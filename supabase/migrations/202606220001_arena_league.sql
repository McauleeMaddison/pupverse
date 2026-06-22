-- PupVerse Arena League
-- Server-authoritative multiplayer, matchmaking, progression, safety, and recovery.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.match_mode as enum ('casual', 'ranked', 'friend');
create type public.match_status as enum ('waiting', 'matched', 'active', 'completed', 'abandoned', 'cancelled');
create type public.queue_status as enum ('waiting', 'matched', 'cancelled');
create type public.room_status as enum ('waiting', 'matched', 'closed', 'expired');
create type public.report_reason as enum ('cheating', 'stalling', 'inappropriate_username', 'harassment', 'other');

create table public.cards (
  id text primary key,
  name text not null,
  pack text not null,
  rarity text not null,
  element text not null,
  front_image text not null,
  power smallint not null check (power between 0 and 100),
  speed smallint not null check (speed between 0 and 100),
  intelligence smallint not null check (intelligence between 0 and 100),
  defence smallint not null check (defence between 0 and 100),
  luck smallint not null check (luck between 0 and 100),
  ranked_legal boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[A-Za-z0-9_]{3,20}$'),
  avatar text not null default 'MP' check (avatar ~ '^[A-Za-z0-9]{1,4}$'),
  banner text not null default 'Founding Pup' check (banner ~ '^[A-Za-z0-9 _-]{1,40}$'),
  level integer not null default 1 check (level > 0),
  xp integer not null default 0 check (xp >= 0),
  coins integer not null default 100 check (coins >= 0),
  rank_rating integer not null default 1000 check (rank_rating >= 0),
  rank_tier text not null default 'Bronze Paw',
  online_wins integer not null default 0,
  ranked_wins integer not null default 0,
  losses integer not null default 0,
  draws integer not null default 0,
  win_streak integer not null default 0,
  best_win_streak integer not null default 0,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  active boolean not null default false,
  rating_floor integer not null default 900,
  card_pool text[] not null default array[]::text[],
  created_at timestamptz not null default now()
);

create unique index one_active_season on public.seasons(active) where active;

create table public.player_cards (
  player_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null references public.cards(id),
  quantity integer not null default 1 check (quantity > 0),
  favourite boolean not null default false,
  acquired_at timestamptz not null default now(),
  primary key (player_id, card_id)
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 32),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_active_deck_per_player on public.decks(player_id) where active;

create table public.deck_cards (
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_id text not null references public.cards(id),
  position smallint not null check (position between 1 and 5),
  primary key (deck_id, card_id),
  unique (deck_id, position)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  mode public.match_mode not null,
  status public.match_status not null default 'matched',
  season_id uuid references public.seasons(id),
  current_turn_player_id uuid references public.profiles(id),
  winner_id uuid references public.profiles(id),
  round_number smallint not null default 1 check (round_number between 1 and 20),
  action_deadline timestamptz,
  reconnect_deadline timestamptz,
  last_action_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  seat smallint not null check (seat in (1, 2)),
  rating_before integer not null,
  rating_after integer,
  score smallint not null default 0,
  deck_hash text not null,
  connected boolean not null default false,
  last_seen_at timestamptz not null default now(),
  primary key (match_id, player_id),
  unique (match_id, seat)
);

-- Full snapshots never enter an exposed schema. Browsers cannot read an opponent's hand.
create table private.match_decks (
  match_id uuid not null references public.matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'array'),
  created_at timestamptz not null default now(),
  primary key (match_id, player_id)
);

create table public.match_rounds (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  round_number smallint not null,
  action_nonce uuid not null,
  actor_id uuid not null references public.profiles(id),
  selected_stat text not null check (selected_stat in ('power', 'speed', 'intelligence', 'defence', 'luck')),
  player_card_id text not null references public.cards(id),
  opponent_card_id text not null references public.cards(id),
  player_value smallint not null,
  opponent_value smallint not null,
  winner_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (match_id, round_number),
  unique (match_id, action_nonce)
);

create table public.matchmaking_queue (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  mode public.match_mode not null check (mode in ('casual', 'ranked')),
  deck_id uuid not null references public.decks(id),
  rating integer not null,
  status public.queue_status not null default 'waiting',
  matched_id uuid references public.matches(id),
  queued_at timestamptz not null default now(),
  heartbeat_at timestamptz not null default now()
);

create index matchmaking_search_idx on public.matchmaking_queue(mode, status, rating, queued_at);

create table public.friend_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z2-9]{6}$'),
  host_id uuid not null references public.profiles(id),
  host_deck_id uuid not null references public.decks(id),
  guest_id uuid references public.profiles(id),
  guest_deck_id uuid references public.decks(id),
  match_id uuid references public.matches(id),
  status public.room_status not null default 'waiting',
  expires_at timestamptz not null default now() + interval '15 minutes',
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id),
  reported_player_id uuid not null references public.profiles(id),
  match_id uuid not null references public.matches(id),
  reason public.report_reason not null,
  details text check (char_length(details) <= 500),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  unique (reporter_id, reported_player_id, match_id)
);

create table public.player_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create or replace function private.rank_tier(p_rating integer)
returns text
language sql
immutable
as $$
  select case
    when p_rating >= 1800 then 'PupVerse Champion'
    when p_rating >= 1600 then 'Neon Elite'
    when p_rating >= 1400 then 'Gold Howl'
    when p_rating >= 1200 then 'Silver Fang'
    when p_rating >= 1000 then 'Bronze Paw'
    else 'Rookie'
  end
$$;

create or replace function private.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger decks_touch before update on public.decks
for each row execute function private.touch_updated_at();

create or replace function private.set_profile_rank_tier()
returns trigger language plpgsql as $$
begin
  new.rank_tier = private.rank_tier(new.rank_rating);
  return new;
end;
$$;

create trigger profiles_rank_tier before insert or update of rank_rating on public.profiles
for each row execute function private.set_profile_rank_tier();

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
  if exists(select 1 from public.profiles where username = left(v_username, 20)) then
    v_username := left(v_username, 11) || '_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  insert into public.profiles(id, username)
  values (new.id, left(v_username, 20));

  insert into public.player_cards(player_id, card_id, quantity)
  select new.id, id, 1 from public.cards where active order by id limit 3;

  insert into public.decks(player_id, name, active)
  values (new.id, 'Starter Squad', true)
  returning id into v_deck;

  insert into public.deck_cards(deck_id, card_id, position)
  select v_deck, id, row_number() over (order by id)::smallint
  from (select id from public.cards where active order by id limit 3) starter;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.build_deck_snapshot(p_deck uuid, p_player uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_snapshot jsonb;
begin
  if not exists(select 1 from public.decks where id = p_deck and player_id = p_player) then
    raise exception 'Deck does not belong to player' using errcode = '42501';
  end if;

  select jsonb_agg(jsonb_build_object(
    'card_id', c.id,
    'name', c.name,
    'pack', c.pack,
    'rarity', c.rarity,
    'element', c.element,
    'front_image', c.front_image,
    'stats', jsonb_build_object('power', c.power, 'speed', c.speed, 'intelligence', c.intelligence, 'defence', c.defence, 'luck', c.luck)
  ) order by dc.position)
  into v_snapshot
  from public.deck_cards dc
  join public.cards c on c.id = dc.card_id and c.active
  join public.player_cards pc on pc.player_id = p_player and pc.card_id = c.id and pc.quantity > 0
  where dc.deck_id = p_deck;

  if jsonb_array_length(coalesce(v_snapshot, '[]'::jsonb)) < 3 then
    raise exception 'A legal deck needs at least 3 owned active cards' using errcode = '22023';
  end if;
  return v_snapshot;
end;
$$;

create or replace function private.create_match(
  p_mode public.match_mode,
  p_player_one uuid,
  p_deck_one uuid,
  p_player_two uuid,
  p_deck_two uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, private, extensions
as $$
declare
  v_match uuid;
  v_one jsonb;
  v_two jsonb;
  v_one_rating integer;
  v_two_rating integer;
begin
  if p_player_one = p_player_two then raise exception 'Cannot match a player with themselves'; end if;
  if p_mode = 'ranked' and exists(
    select 1 from public.deck_cards dc join public.cards c on c.id = dc.card_id
    where dc.deck_id in (p_deck_one, p_deck_two) and not c.ranked_legal
  ) then raise exception 'Deck contains a card outside the ranked pool'; end if;
  v_one := private.build_deck_snapshot(p_deck_one, p_player_one);
  v_two := private.build_deck_snapshot(p_deck_two, p_player_two);
  select rank_rating into v_one_rating from public.profiles where id = p_player_one;
  select rank_rating into v_two_rating from public.profiles where id = p_player_two;

  insert into public.matches(mode, status, season_id, current_turn_player_id, started_at, action_deadline)
  values (p_mode, 'matched', (select id from public.seasons where active limit 1), p_player_one, now(), now() + interval '45 seconds')
  returning id into v_match;

  insert into public.match_players(match_id, player_id, seat, rating_before, deck_hash)
  values
    (v_match, p_player_one, 1, v_one_rating, encode(digest(v_one::text, 'sha256'), 'hex')),
    (v_match, p_player_two, 2, v_two_rating, encode(digest(v_two::text, 'sha256'), 'hex'));
  insert into private.match_decks(match_id, player_id, snapshot)
  values (v_match, p_player_one, v_one), (v_match, p_player_two, v_two);
  return v_match;
end;
$$;

create or replace function private.finalize_match(
  p_match_id uuid,
  p_winner uuid,
  p_status public.match_status
)
returns boolean
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_match public.matches%rowtype;
begin
  if p_status not in ('completed', 'abandoned') then raise exception 'Invalid terminal match status'; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if v_match.id is null or v_match.status not in ('matched', 'active') then return false; end if;
  if p_winner is not null and not exists(select 1 from public.match_players where match_id = p_match_id and player_id = p_winner) then
    raise exception 'Winner is not a match participant';
  end if;

  update public.matches set status = p_status, winner_id = p_winner, ended_at = now(), last_action_at = now(), action_deadline = null, reconnect_deadline = null
  where id = p_match_id;

  update public.profiles p set
    coins = coins + case
      when p_status = 'abandoned' and p_winner is null then 0
      when p.id = p_winner then case when p_status = 'completed' then 18 else 12 end
      when p_winner is null then 10
      when p_status = 'completed' then 6 else 0
    end,
    xp = xp + case
      when p_status = 'abandoned' and p_winner is null then 0
      when p.id = p_winner then case when p_status = 'completed' then 120 else 80 end
      when p_winner is null then 75
      when p_status = 'completed' then 45 else 20
    end,
    online_wins = online_wins + case when p.id = p_winner then 1 else 0 end,
    ranked_wins = ranked_wins + case when p.id = p_winner and v_match.mode = 'ranked' then 1 else 0 end,
    losses = losses + case when p_winner is not null and p.id <> p_winner then 1 else 0 end,
    draws = draws + case when p_status = 'completed' and p_winner is null then 1 else 0 end,
    win_streak = case when p.id = p_winner then win_streak + 1 else 0 end,
    best_win_streak = greatest(best_win_streak, case when p.id = p_winner then win_streak + 1 else best_win_streak end),
    rank_rating = greatest(0, rank_rating + case
      when v_match.mode <> 'ranked' or (p_status = 'abandoned' and p_winner is null) then 0
      when p.id = p_winner then case when p_status = 'completed' then 24 else 12 end
      when p_winner is null then 0
      else -18
    end)
  where p.id in (select player_id from public.match_players where match_id = p_match_id);

  update public.match_players mp set rating_after = p.rank_rating
  from public.profiles p where mp.match_id = p_match_id and p.id = mp.player_id;
  return true;
end;
$$;

create or replace function public.request_matchmaking(p_mode public.match_mode, p_deck_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_rating integer;
  v_opponent public.matchmaking_queue%rowtype;
  v_match uuid;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_mode not in ('casual', 'ranked') then raise exception 'Open matchmaking only supports casual or ranked'; end if;
  perform private.build_deck_snapshot(p_deck_id, v_user);
  select rank_rating into v_rating from public.profiles where id = v_user;
  perform pg_advisory_xact_lock(hashtext('pupverse:' || p_mode::text));

  delete from public.matchmaking_queue where heartbeat_at < now() - interval '45 seconds';
  select q.* into v_opponent
  from public.matchmaking_queue q
  where q.mode = p_mode and q.status = 'waiting' and q.player_id <> v_user
    and abs(q.rating - v_rating) <= case when p_mode = 'ranked' then 250 else 500 end
    and not exists(select 1 from public.player_blocks b where (b.blocker_id = v_user and b.blocked_id = q.player_id) or (b.blocker_id = q.player_id and b.blocked_id = v_user))
  order by q.queued_at
  for update skip locked
  limit 1;

  if v_opponent.player_id is not null then
    v_match := private.create_match(p_mode, v_opponent.player_id, v_opponent.deck_id, v_user, p_deck_id);
    update public.matchmaking_queue set status = 'matched', matched_id = v_match, heartbeat_at = now() where player_id = v_opponent.player_id;
    insert into public.matchmaking_queue(player_id, mode, deck_id, rating, status, matched_id)
    values(v_user, p_mode, p_deck_id, v_rating, 'matched', v_match)
    on conflict(player_id) do update set mode = excluded.mode, deck_id = excluded.deck_id, rating = excluded.rating, status = 'matched', matched_id = v_match, queued_at = now(), heartbeat_at = now();
    return jsonb_build_object('status', 'matched', 'match_id', v_match);
  end if;

  insert into public.matchmaking_queue(player_id, mode, deck_id, rating, status, matched_id)
  values(v_user, p_mode, p_deck_id, v_rating, 'waiting', null)
  on conflict(player_id) do update set mode = excluded.mode, deck_id = excluded.deck_id, rating = excluded.rating, status = 'waiting', matched_id = null, queued_at = now(), heartbeat_at = now();
  return jsonb_build_object('status', 'waiting');
end;
$$;

create or replace function public.cancel_matchmaking()
returns void language sql security definer set search_path = public as $$
  delete from public.matchmaking_queue where player_id = auth.uid() and status = 'waiting';
$$;

create or replace function public.create_friend_room(p_deck_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
  v_room uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform private.build_deck_snapshot(p_deck_id, v_user);
  loop
    v_code := upper(substr(translate(encode(extensions.gen_random_bytes(8), 'base64'), '01IO+/=', 'ABCDEFG'), 1, 6));
    v_code := regexp_replace(v_code, '[^A-Z2-9]', 'P', 'g');
    exit when not exists(select 1 from public.friend_rooms where code = v_code and expires_at > now());
  end loop;
  insert into public.friend_rooms(code, host_id, host_deck_id)
  values(v_code, v_user, p_deck_id) returning id into v_room;
  return jsonb_build_object('room_id', v_room, 'code', v_code, 'expires_at', now() + interval '15 minutes');
end;
$$;

create or replace function public.join_friend_room(p_code text, p_deck_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_room public.friend_rooms%rowtype;
  v_match uuid;
begin
  if v_user is null then raise exception 'Authentication required'; end if;
  perform private.build_deck_snapshot(p_deck_id, v_user);
  select * into v_room from public.friend_rooms
  where code = upper(regexp_replace(p_code, '[^A-Za-z0-9]', '', 'g')) and status = 'waiting' and expires_at > now()
  for update;
  if v_room.id is null then raise exception 'Room not found or expired'; end if;
  if v_room.host_id = v_user then raise exception 'Host cannot join their own room'; end if;
  if exists(select 1 from public.player_blocks b where (b.blocker_id = v_user and b.blocked_id = v_room.host_id) or (b.blocker_id = v_room.host_id and b.blocked_id = v_user)) then
    raise exception 'Room unavailable';
  end if;
  v_match := private.create_match('friend', v_room.host_id, v_room.host_deck_id, v_user, p_deck_id);
  update public.friend_rooms set guest_id = v_user, guest_deck_id = p_deck_id, match_id = v_match, status = 'matched' where id = v_room.id;
  return jsonb_build_object('status', 'matched', 'match_id', v_match);
end;
$$;

create or replace function public.get_match_state(p_match_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_match public.matches%rowtype;
  v_card jsonb;
  v_opponent_card jsonb;
  v_resolved boolean;
begin
  if not exists(select 1 from public.match_players where match_id = p_match_id and player_id = v_user) then raise exception 'Not a match participant' using errcode = '42501'; end if;
  select * into v_match from public.matches where id = p_match_id;
  select snapshot -> (v_match.round_number - 1) into v_card from private.match_decks where match_id = p_match_id and player_id = v_user;
  select exists(select 1 from public.match_rounds where match_id = p_match_id and round_number = v_match.round_number) into v_resolved;
  if v_resolved then
    select snapshot -> (v_match.round_number - 1) into v_opponent_card from private.match_decks where match_id = p_match_id and player_id <> v_user;
  end if;
  return jsonb_build_object(
    'match', to_jsonb(v_match),
    'players', (select jsonb_agg(to_jsonb(mp) || jsonb_build_object('profile', jsonb_build_object('username', p.username, 'avatar', p.avatar, 'rank_tier', p.rank_tier))) from public.match_players mp join public.profiles p on p.id = mp.player_id where mp.match_id = p_match_id),
    'rounds', (select coalesce(jsonb_agg(to_jsonb(r) order by r.round_number), '[]'::jsonb) from public.match_rounds r where r.match_id = p_match_id),
    'my_card', v_card,
    'opponent_card', v_opponent_card
  );
end;
$$;

create or replace function public.resolve_match_round(p_match_id uuid, p_stat text, p_action_nonce uuid)
returns jsonb
language plpgsql security definer set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_match public.matches%rowtype;
  v_opponent uuid;
  v_my_card jsonb;
  v_their_card jsonb;
  v_my_value smallint;
  v_their_value smallint;
  v_round_winner uuid;
  v_my_score smallint;
  v_their_score smallint;
  v_match_winner uuid;
  v_existing jsonb;
begin
  if p_stat not in ('power', 'speed', 'intelligence', 'defence', 'luck') then raise exception 'Invalid stat'; end if;
  select to_jsonb(r) into v_existing from public.match_rounds r where match_id = p_match_id and action_nonce = p_action_nonce;
  if v_existing is not null then return jsonb_build_object('round', v_existing, 'replayed', true); end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if v_match.id is null or v_match.status <> 'active' then raise exception 'Match is not active'; end if;
  if not exists(select 1 from public.match_players where match_id = p_match_id and player_id = v_user) then raise exception 'Not a match participant' using errcode = '42501'; end if;
  if v_match.current_turn_player_id <> v_user then raise exception 'Not your turn' using errcode = '42501'; end if;
  if v_match.action_deadline < now() then raise exception 'Action deadline expired'; end if;
  if exists(select 1 from public.match_rounds where match_id = p_match_id and round_number = v_match.round_number) then raise exception 'Round already resolved'; end if;

  select player_id into v_opponent from public.match_players where match_id = p_match_id and player_id <> v_user;
  select snapshot -> (v_match.round_number - 1) into v_my_card from private.match_decks where match_id = p_match_id and player_id = v_user;
  select snapshot -> (v_match.round_number - 1) into v_their_card from private.match_decks where match_id = p_match_id and player_id = v_opponent;
  v_my_value := (v_my_card -> 'stats' ->> p_stat)::smallint;
  v_their_value := (v_their_card -> 'stats' ->> p_stat)::smallint;
  v_round_winner := case when v_my_value > v_their_value then v_user when v_my_value < v_their_value then v_opponent else null end;

  insert into public.match_rounds(match_id, round_number, action_nonce, actor_id, selected_stat, player_card_id, opponent_card_id, player_value, opponent_value, winner_id)
  values(p_match_id, v_match.round_number, p_action_nonce, v_user, p_stat, v_my_card ->> 'card_id', v_their_card ->> 'card_id', v_my_value, v_their_value, v_round_winner);
  if v_round_winner is not null then update public.match_players set score = score + 1 where match_id = p_match_id and player_id = v_round_winner; end if;
  select score into v_my_score from public.match_players where match_id = p_match_id and player_id = v_user;
  select score into v_their_score from public.match_players where match_id = p_match_id and player_id = v_opponent;

  if greatest(v_my_score, v_their_score) >= 2 or v_match.round_number >= 3 then
    v_match_winner := case when v_my_score > v_their_score then v_user when v_their_score > v_my_score then v_opponent else null end;
    perform private.finalize_match(p_match_id, v_match_winner, 'completed');
  else
    update public.matches set status = 'active', round_number = round_number + 1, current_turn_player_id = coalesce(v_round_winner, current_turn_player_id), last_action_at = now(), action_deadline = now() + interval '25 seconds' where id = p_match_id;
  end if;
  return public.get_match_state(p_match_id);
end;
$$;

create or replace function public.set_match_presence(p_match_id uuid, p_connected boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.match_players where match_id = p_match_id and player_id = auth.uid()) then raise exception 'Not a match participant'; end if;
  update public.match_players set connected = p_connected, last_seen_at = now() where match_id = p_match_id and player_id = auth.uid();
  update public.matches set
    status = case when p_connected and not exists(select 1 from public.match_players where match_id = p_match_id and not connected) then 'active'::public.match_status else status end,
    action_deadline = case when p_connected and not exists(select 1 from public.match_players where match_id = p_match_id and not connected) then now() + interval '25 seconds' else action_deadline end,
    reconnect_deadline = case
      when not p_connected then now() + interval '60 seconds'
      when not exists(select 1 from public.match_players where match_id = p_match_id and not connected) then null
      else reconnect_deadline
    end
  where id = p_match_id and status in ('matched','active');
  update public.profiles set last_seen_at = now() where id = auth.uid();
end;
$$;

create or replace function public.forfeit_match(p_match_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_opponent uuid;
begin
  if not exists(select 1 from public.match_players where match_id = p_match_id and player_id = auth.uid()) then raise exception 'Not a match participant'; end if;
  select player_id into v_opponent from public.match_players where match_id = p_match_id and player_id <> auth.uid();
  perform private.finalize_match(p_match_id, v_opponent, 'abandoned');
end;
$$;

create or replace function public.sweep_stale_arena_state()
returns integer language plpgsql security definer set search_path = public, private as $$
declare v_count integer := 0; v_stale record;
begin
  delete from public.matchmaking_queue where heartbeat_at < now() - interval '45 seconds';
  update public.friend_rooms set status = 'expired' where status = 'waiting' and expires_at < now();
  update public.match_players set connected = false
  where connected and last_seen_at < now() - interval '35 seconds'
    and match_id in (select id from public.matches where status in ('matched','active'));
  update public.matches m set reconnect_deadline = coalesce(reconnect_deadline, now() + interval '60 seconds')
  where status in ('matched','active') and exists(
    select 1 from public.match_players mp where mp.match_id = m.id and not mp.connected
  );
  for v_stale in
    select m.id, (select mp.player_id from public.match_players mp where mp.match_id = m.id and mp.connected order by mp.last_seen_at desc limit 1) winner
    from public.matches m where m.status in ('matched','active') and m.reconnect_deadline < now()
  loop
    if private.finalize_match(v_stale.id, v_stale.winner, 'abandoned') then v_count := v_count + 1; end if;
  end loop;
  for v_stale in
    select m.id, (select mp.player_id from public.match_players mp where mp.match_id = m.id and mp.player_id <> m.current_turn_player_id limit 1) winner
    from public.matches m where m.status = 'active' and m.action_deadline < now()
  loop
    if private.finalize_match(v_stale.id, v_stale.winner, 'abandoned') then v_count := v_count + 1; end if;
  end loop;
  return v_count;
end;
$$;

create or replace view public.leaderboard
with (security_invoker = true)
as
select id, username, avatar, banner, level, rank_rating, rank_tier, ranked_wins, online_wins,
       dense_rank() over(order by rank_rating desc, ranked_wins desc, created_at) as position
from public.profiles;

-- Grants and RLS
grant usage on schema public to anon, authenticated;
grant select on public.cards, public.profiles, public.leaderboard, public.seasons to authenticated;
grant select, insert, update, delete on public.player_cards, public.decks, public.deck_cards to authenticated;
grant select on public.matches, public.match_players, public.match_rounds, public.friend_rooms, public.matchmaking_queue to authenticated;
grant insert on public.reports, public.player_blocks to authenticated;
grant select, delete on public.player_blocks to authenticated;
revoke update on public.profiles from authenticated;
grant update (username, avatar, banner, last_seen_at) on public.profiles to authenticated;

alter table public.cards enable row level security;
alter table public.profiles enable row level security;
alter table public.player_cards enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_rounds enable row level security;
alter table public.matchmaking_queue enable row level security;
alter table public.friend_rooms enable row level security;
alter table public.reports enable row level security;
alter table public.player_blocks enable row level security;
alter table public.seasons enable row level security;

create or replace function private.is_match_participant(p_match uuid, p_user uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(select 1 from public.match_players where match_id = p_match and player_id = p_user)
$$;

create policy cards_read on public.cards for select to authenticated using (active);
create policy profiles_read on public.profiles for select to authenticated using (true);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy player_cards_own on public.player_cards for all to authenticated using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);
create policy decks_own on public.decks for all to authenticated using ((select auth.uid()) = player_id) with check ((select auth.uid()) = player_id);
create policy deck_cards_own on public.deck_cards for all to authenticated
using (deck_id in (select id from public.decks where player_id = (select auth.uid())))
with check (deck_id in (select id from public.decks where player_id = (select auth.uid())));
create policy matches_participant_read on public.matches for select to authenticated using (private.is_match_participant(id, (select auth.uid())));
create policy match_players_participant_read on public.match_players for select to authenticated using (private.is_match_participant(match_id, (select auth.uid())));
create policy match_rounds_participant_read on public.match_rounds for select to authenticated using (private.is_match_participant(match_id, (select auth.uid())));
create policy queue_own_read on public.matchmaking_queue for select to authenticated using (player_id = (select auth.uid()));
create policy friend_rooms_members_read on public.friend_rooms for select to authenticated using ((select auth.uid()) in (host_id, guest_id));
create policy reports_create on public.reports for insert to authenticated with check (
  reporter_id = (select auth.uid()) and reporter_id <> reported_player_id
  and private.is_match_participant(match_id, (select auth.uid()))
  and private.is_match_participant(match_id, reported_player_id)
);
create policy blocks_own on public.player_blocks for all to authenticated using (blocker_id = (select auth.uid())) with check (blocker_id = (select auth.uid()));
create policy seasons_read on public.seasons for select to authenticated using (true);

revoke all on function public.request_matchmaking(public.match_mode, uuid) from public;
revoke all on function public.cancel_matchmaking() from public;
revoke all on function public.create_friend_room(uuid) from public;
revoke all on function public.join_friend_room(text, uuid) from public;
revoke all on function public.get_match_state(uuid) from public;
revoke all on function public.resolve_match_round(uuid, text, uuid) from public;
revoke all on function public.set_match_presence(uuid, boolean) from public;
revoke all on function public.forfeit_match(uuid) from public;
revoke all on function public.sweep_stale_arena_state() from public;
grant execute on function public.request_matchmaking(public.match_mode, uuid), public.cancel_matchmaking(), public.create_friend_room(uuid), public.join_friend_room(text, uuid), public.get_match_state(uuid), public.resolve_match_round(uuid, text, uuid), public.set_match_presence(uuid, boolean), public.forfeit_match(uuid) to authenticated;
grant execute on function public.sweep_stale_arena_state() to service_role;

-- Realtime database changes for participant-safe state.
alter publication supabase_realtime add table public.matchmaking_queue;
alter publication supabase_realtime add table public.friend_rooms;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.match_players;
alter publication supabase_realtime add table public.match_rounds;

create or replace function private.can_access_realtime_topic(p_topic text)
returns boolean language sql security definer set search_path = public as $$
  select case
    when p_topic like 'match:%' then exists(
      select 1 from public.match_players where match_id::text = substring(p_topic from 7) and player_id = auth.uid()
    )
    when p_topic like 'friend:%' then exists(
      select 1 from public.friend_rooms where code = substring(p_topic from 8) and auth.uid() in (host_id, guest_id)
    )
    else false
  end
$$;

create policy arena_realtime_read on realtime.messages for select to authenticated
using (private.can_access_realtime_topic((select realtime.topic())) and realtime.messages.extension in ('broadcast','presence'));
create policy arena_realtime_write on realtime.messages for insert to authenticated
with check (private.can_access_realtime_topic((select realtime.topic())) and realtime.messages.extension in ('broadcast','presence'));

revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_match_participant(uuid, uuid), private.can_access_realtime_topic(text) to authenticated;

insert into public.seasons(name, starts_at, ends_at, active)
values ('Season 04: Neon Horizon', now(), now() + interval '8 weeks', true);
