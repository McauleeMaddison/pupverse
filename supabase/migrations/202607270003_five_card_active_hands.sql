-- A player-facing active hand is five cards everywhere: onboarding, deck editing,
-- and protected matchmaking snapshots.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, private, auth, extensions
as $$
declare
  v_username text;
  v_deck uuid;
begin
  v_username := regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^A-Za-z0-9_]', '', 'g');
  if char_length(v_username) < 3 then
    v_username := 'Pup_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;
  if exists(select 1 from public.profiles p where p.username = left(v_username, 20)) then
    v_username := left(v_username, 11) || '_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  insert into public.profiles(id, username) values (new.id, left(v_username, 20));
  insert into public.player_cards(player_id, card_id, quantity)
  select new.id, c.id, 1 from public.cards c where c.active order by c.id limit 5;
  insert into public.decks(player_id, name, active) values (new.id, 'Starter Hand', true) returning id into v_deck;
  insert into public.deck_cards(deck_id, card_id, position)
  select v_deck, starter.card_id, starter.position from (
    select c.id as card_id, row_number() over (order by c.id)::smallint as position
    from public.cards c where c.active order by c.id limit 5
  ) starter;
  return new;
end;
$$;

-- Bring early beta accounts up to the same five-card starter entitlement without
-- disturbing cards already collected or deck positions already chosen.
insert into public.player_cards(player_id, card_id, quantity)
select p.id, c.id, 1
from public.profiles p
cross join lateral (select id from public.cards where active order by id limit 5) c
on conflict (player_id, card_id) do nothing;

with deck_counts as (
  select d.id as deck_id, count(dc.card_id)::smallint as card_count
  from public.decks d
  left join public.deck_cards dc on dc.deck_id = d.id
  where d.active
  group by d.id
), candidates as (
  select dc.deck_id, c.id as card_id, dc.card_count,
    row_number() over (partition by dc.deck_id order by c.id)::smallint as sequence
  from deck_counts dc
  join public.decks d on d.id = dc.deck_id
  cross join public.cards c
  where c.active
    and not exists (select 1 from public.deck_cards existing where existing.deck_id = dc.deck_id and existing.card_id = c.id)
)
insert into public.deck_cards(deck_id, card_id, position)
select deck_id, card_id, card_count + sequence
from candidates
where card_count + sequence <= 5
on conflict do nothing;

create or replace function public.set_active_deck(p_card_ids text[], p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = public, private
as $$
declare
  v_user uuid := auth.uid(); v_deck uuid; v_existing public.deck_update_requests%rowtype;
  v_card_id text; v_position smallint := 0;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_request_id is null then raise exception 'Request id is required' using errcode = '22023'; end if;
  if cardinality(p_card_ids) <> 5 or cardinality(array(select distinct unnest(p_card_ids))) <> 5 then
    raise exception 'An active hand needs exactly five different cards' using errcode = '22023';
  end if;
  select * into v_existing from public.deck_update_requests where player_id = v_user and request_id = p_request_id;
  if v_existing.id is not null then return jsonb_build_object('deck_card_ids', to_jsonb(v_existing.card_ids), 'replayed', true); end if;
  foreach v_card_id in array p_card_ids loop
    if not exists (select 1 from public.player_cards where player_id = v_user and card_id = v_card_id and quantity > 0) then
      raise exception 'Deck contains a card you do not own' using errcode = '22023';
    end if;
  end loop;
  select id into v_deck from public.decks where player_id = v_user and active for update;
  if v_deck is null then insert into public.decks(player_id, name, active) values (v_user, 'Active Hand', true) returning id into v_deck; end if;
  delete from public.deck_cards where deck_id = v_deck;
  foreach v_card_id in array p_card_ids loop
    v_position := v_position + 1;
    insert into public.deck_cards(deck_id, card_id, position) values (v_deck, v_card_id, v_position);
  end loop;
  insert into public.deck_update_requests(player_id, request_id, card_ids) values (v_user, p_request_id, p_card_ids);
  return jsonb_build_object('deck_id', v_deck, 'deck_card_ids', to_jsonb(p_card_ids), 'replayed', false);
end;
$$;

create or replace function private.build_deck_snapshot(p_deck uuid, p_player uuid)
returns jsonb language plpgsql security definer set search_path = public, private
as $$
declare v_snapshot jsonb;
begin
  if not exists(select 1 from public.decks where id = p_deck and player_id = p_player) then
    raise exception 'Deck does not belong to player' using errcode = '42501';
  end if;
  select jsonb_agg(jsonb_build_object(
    'card_id', c.id, 'name', c.name, 'pack', c.pack, 'rarity', c.rarity, 'element', c.element,
    'front_image', c.front_image,
    'stats', jsonb_build_object('power', c.power, 'speed', c.speed, 'intelligence', c.intelligence, 'defence', c.defence, 'luck', c.luck)
  ) order by dc.position) into v_snapshot
  from public.deck_cards dc join public.cards c on c.id = dc.card_id and c.active
  join public.player_cards pc on pc.player_id = p_player and pc.card_id = c.id and pc.quantity > 0
  where dc.deck_id = p_deck;
  if jsonb_array_length(coalesce(v_snapshot, '[]'::jsonb)) <> 5 then
    raise exception 'A legal active hand needs exactly 5 owned cards' using errcode = '22023';
  end if;
  return v_snapshot;
end;
$$;
