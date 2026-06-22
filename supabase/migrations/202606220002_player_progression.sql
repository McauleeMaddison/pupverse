-- PupVerse persistent Vault progression.
-- The browser may read ownership and toggle favourites, but cannot mint cards,
-- change quantities, or award itself coins/XP/rank.

create table public.pack_catalog (
  id text primary key,
  card_pack text not null,
  cost integer not null check (cost > 0),
  card_count smallint not null check (card_count between 1 and 10),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.pack_catalog(id, card_pack, cost, card_count) values
  ('crypto', 'CryptoPups', 5, 3),
  ('cyber', 'CyberPups', 8, 3),
  ('alien', 'AlienPups', 10, 3)
on conflict (id) do update set
  card_pack = excluded.card_pack,
  cost = excluded.cost,
  card_count = excluded.card_count,
  active = true;

create table public.pack_openings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  pack_id text not null references public.pack_catalog(id),
  card_ids text[] not null check (cardinality(card_ids) > 0),
  coins_spent integer not null check (coins_spent > 0),
  balance_after integer not null check (balance_after >= 0),
  opened_at timestamptz not null default now(),
  unique (player_id, request_id)
);

create index pack_openings_player_time_idx
  on public.pack_openings(player_id, opened_at desc);

alter table public.pack_catalog enable row level security;
alter table public.pack_openings enable row level security;

grant select on public.pack_catalog, public.pack_openings to authenticated;
create policy pack_catalog_read on public.pack_catalog
  for select to authenticated using (active);
create policy pack_openings_own_read on public.pack_openings
  for select to authenticated using (player_id = (select auth.uid()));

-- Ownership is server-managed. Players may only toggle their own favourite flag.
revoke insert, update, delete on public.player_cards from authenticated;
grant update (favourite) on public.player_cards to authenticated;

create or replace function public.open_player_pack(p_pack_id text, p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_pack public.pack_catalog%rowtype;
  v_balance integer;
  v_existing public.pack_openings%rowtype;
  v_card_id text;
  v_cards text[] := array[]::text[];
  v_index integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null then
    raise exception 'Request id is required' using errcode = '22023';
  end if;

  select * into v_existing
  from public.pack_openings
  where player_id = v_user and request_id = p_request_id;

  if v_existing.id is not null then
    return jsonb_build_object(
      'opening_id', v_existing.id,
      'pack_id', v_existing.pack_id,
      'card_ids', to_jsonb(v_existing.card_ids),
      'coins_spent', v_existing.coins_spent,
      'balance', v_existing.balance_after,
      'replayed', true
    );
  end if;

  select * into v_pack from public.pack_catalog
  where id = p_pack_id and active
  for share;
  if v_pack.id is null then
    raise exception 'Pack is unavailable' using errcode = '22023';
  end if;

  select coins into v_balance
  from public.profiles
  where id = v_user
  for update;
  if v_balance is null then
    raise exception 'Player profile is unavailable';
  end if;
  if v_balance < v_pack.cost then
    raise exception 'Not enough coins' using errcode = '22023';
  end if;

  for v_index in 1..v_pack.card_count loop
    select c.id into v_card_id
    from public.cards c
    where c.active and c.pack = v_pack.card_pack
    order by
      power(random(), 1.0 / case c.rarity
        when 'Mythic' then 2
        when 'Legendary' then 5
        when 'Epic' then 12
        when 'Rare' then 24
        else 40
      end) desc
    limit 1;

    if v_card_id is null then
      raise exception 'Pack has no active cards';
    end if;
    v_cards := array_append(v_cards, v_card_id);

    insert into public.player_cards(player_id, card_id, quantity)
    values (v_user, v_card_id, 1)
    on conflict (player_id, card_id)
    do update set quantity = public.player_cards.quantity + 1;
  end loop;

  v_balance := v_balance - v_pack.cost;
  update public.profiles
  set coins = v_balance
  where id = v_user;

  insert into public.pack_openings(
    player_id, request_id, pack_id, card_ids, coins_spent, balance_after
  ) values (
    v_user, p_request_id, v_pack.id, v_cards, v_pack.cost, v_balance
  ) returning id into v_existing.id;

  return jsonb_build_object(
    'opening_id', v_existing.id,
    'pack_id', v_pack.id,
    'card_ids', to_jsonb(v_cards),
    'coins_spent', v_pack.cost,
    'balance', v_balance,
    'replayed', false
  );
end;
$$;

revoke all on function public.open_player_pack(text, uuid) from public, anon;
grant execute on function public.open_player_pack(text, uuid) to authenticated;
