-- Account creation runs this trigger inside the Auth transaction. Qualify the
-- card ID everywhere so Postgres never confuses it with auth.users.id.
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

  insert into public.profiles(id, username)
  values (new.id, left(v_username, 20));

  insert into public.player_cards(player_id, card_id, quantity)
  select new.id, c.id, 1
  from public.cards c
  where c.active
  order by c.id
  limit 3;

  insert into public.decks(player_id, name, active)
  values (new.id, 'Starter Squad', true)
  returning id into v_deck;

  insert into public.deck_cards(deck_id, card_id, position)
  select v_deck, starter.card_id, starter.position
  from (
    select c.id as card_id, row_number() over (order by c.id)::smallint as position
    from public.cards c
    where c.active
    order by c.id
    limit 3
  ) starter;

  return new;
end;
$$;
