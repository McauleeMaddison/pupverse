-- PupVerse authenticated daily operations.
-- Signed-in players receive server-owned daily boards so rewards remain
-- authoritative across devices and cannot be minted from the browser.

create table public.daily_ops_boards (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  tasks jsonb not null check (jsonb_typeof(tasks) = 'array' and jsonb_array_length(tasks) = 4),
  baseline jsonb not null check (jsonb_typeof(baseline) = 'object'),
  reward_card_id text not null references public.cards(id),
  reward_claimed boolean not null default false,
  claim_request_id uuid,
  created_at timestamptz not null default now(),
  refresh_at timestamptz not null,
  claimed_at timestamptz,
  unique (player_id, claim_request_id)
);

create index daily_ops_boards_player_refresh_idx
  on public.daily_ops_boards(player_id, refresh_at desc, created_at desc);

alter table public.daily_ops_boards enable row level security;

create or replace function private.daily_metrics(p_player uuid)
returns jsonb
language sql
stable
set search_path = public
as $$
  with profile as (
    select
      coalesce(online_wins, 0)::integer as online_wins,
      coalesce(losses, 0)::integer as losses,
      coalesce(draws, 0)::integer as draws,
      coalesce(ranked_wins, 0)::integer as ranked_wins
    from public.profiles
    where id = p_player
  ),
  collection as (
    select
      coalesce(sum(quantity), 0)::integer as collection_count,
      coalesce(count(*) filter (where quantity > 0), 0)::integer as unique_owned
    from public.player_cards
    where player_id = p_player
  ),
  packs as (
    select coalesce(count(*), 0)::integer as packs_opened
    from public.pack_openings
    where player_id = p_player
  )
  select jsonb_build_object(
    'onlineWins', coalesce((select online_wins from profile), 0),
    'onlineMatches', coalesce((select online_wins + losses + draws from profile), 0),
    'rankedWins', coalesce((select ranked_wins from profile), 0),
    'packsOpened', coalesce((select packs_opened from packs), 0),
    'collectionCount', coalesce((select collection_count from collection), 0),
    'uniqueOwned', coalesce((select unique_owned from collection), 0),
    'duplicateCount', greatest(
      coalesce((select collection_count from collection), 0) - coalesce((select unique_owned from collection), 0),
      0
    )
  );
$$;

create or replace function private.pick_daily_task(p_group text)
returns jsonb
language plpgsql
volatile
set search_path = public, private
as $$
declare
  v_options jsonb;
  v_task jsonb;
begin
  case p_group
    when 'onlineWins' then
      v_options := jsonb_build_array(
        jsonb_build_object(
          'id', 'online-win-1',
          'group', 'onlineWins',
          'metric', 'onlineWins',
          'goal', 1,
          'icon', '◆',
          'title', 'Win 1 arena match',
          'description', 'Beat one real challenger in the protected arena.'
        ),
        jsonb_build_object(
          'id', 'online-win-2',
          'group', 'onlineWins',
          'metric', 'onlineWins',
          'goal', 2,
          'icon', '◆',
          'title', 'Win 2 arena matches',
          'description', 'String together two online wins before the next reset.'
        ),
        jsonb_build_object(
          'id', 'online-win-3',
          'group', 'onlineWins',
          'metric', 'onlineWins',
          'goal', 3,
          'icon', '◆',
          'title', 'Win 3 arena matches',
          'description', 'Push a full online streak through the live league.'
        )
      );
    when 'onlineMatches' then
      v_options := jsonb_build_array(
        jsonb_build_object(
          'id', 'online-play-2',
          'group', 'onlineMatches',
          'metric', 'onlineMatches',
          'goal', 2,
          'icon', '◷',
          'title', 'Play 2 arena matches',
          'description', 'Stay active and complete two protected matches.'
        ),
        jsonb_build_object(
          'id', 'online-play-3',
          'group', 'onlineMatches',
          'metric', 'onlineMatches',
          'goal', 3,
          'icon', '◷',
          'title', 'Play 3 arena matches',
          'description', 'Keep your deck warm with three online battles.'
        ),
        jsonb_build_object(
          'id', 'online-play-4',
          'group', 'onlineMatches',
          'metric', 'onlineMatches',
          'goal', 4,
          'icon', '◷',
          'title', 'Play 4 arena matches',
          'description', 'Finish a longer online session before the board rotates.'
        )
      );
    when 'packsOpened' then
      v_options := jsonb_build_array(
        jsonb_build_object(
          'id', 'pack-open-1',
          'group', 'packsOpened',
          'metric', 'packsOpened',
          'goal', 1,
          'icon', '✦',
          'title', 'Open 1 pack',
          'description', 'Crack one protected pack to feed the live vault.'
        ),
        jsonb_build_object(
          'id', 'pack-open-2',
          'group', 'packsOpened',
          'metric', 'packsOpened',
          'goal', 2,
          'icon', '✦',
          'title', 'Open 2 packs',
          'description', 'Double up on verified pulls and widen the roster.'
        )
      );
    when 'collection' then
      v_options := jsonb_build_array(
        jsonb_build_object(
          'id', 'collect-cards-3',
          'group', 'collection',
          'metric', 'collectionCount',
          'goal', 3,
          'icon', '◇',
          'title', 'Collect 3 cards',
          'description', 'Add three more owned cards to your synced vault.'
        ),
        jsonb_build_object(
          'id', 'collect-unique-1',
          'group', 'collection',
          'metric', 'uniqueOwned',
          'goal', 1,
          'icon', '◇',
          'title', 'Discover 1 new pup',
          'description', 'Find one card your account has never owned before.'
        ),
        jsonb_build_object(
          'id', 'collect-unique-2',
          'group', 'collection',
          'metric', 'uniqueOwned',
          'goal', 2,
          'icon', '◇',
          'title', 'Discover 2 new pups',
          'description', 'Expand the synced archive with two fresh uniques.'
        ),
        jsonb_build_object(
          'id', 'collect-duplicates-2',
          'group', 'collection',
          'metric', 'duplicateCount',
          'goal', 2,
          'icon', '⧉',
          'title', 'Gain 2 duplicates',
          'description', 'Build fusion material by pulling two duplicate cards.'
        )
      );
    else
      raise exception 'Unknown daily task group: %', p_group using errcode = '22023';
  end case;

  select value into v_task
  from jsonb_array_elements(v_options)
  order by random()
  limit 1;

  return v_task;
end;
$$;

create or replace function private.pick_daily_reward_card()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_card_id text;
begin
  select c.id into v_card_id
  from public.cards c
  where c.active and c.rarity in ('Rare', 'Epic', 'Legendary', 'Mythic')
  order by power(random(), 1.0 / case c.rarity
    when 'Mythic' then 8
    when 'Legendary' then 6
    when 'Epic' then 4
    when 'Rare' then 2
    else 1
  end) desc
  limit 1;

  if v_card_id is null then
    select c.id into v_card_id
    from public.cards c
    where c.active
    order by random()
    limit 1;
  end if;

  return v_card_id;
end;
$$;

create or replace function private.create_daily_ops_board(p_player uuid)
returns public.daily_ops_boards
language plpgsql
volatile
security definer
set search_path = public, private
as $$
declare
  v_board public.daily_ops_boards%rowtype;
  v_tasks jsonb := '[]'::jsonb;
  v_group text;
begin
  foreach v_group in array array['onlineWins', 'onlineMatches', 'packsOpened', 'collection'] loop
    v_tasks := v_tasks || jsonb_build_array(private.pick_daily_task(v_group));
  end loop;

  insert into public.daily_ops_boards(
    player_id,
    tasks,
    baseline,
    reward_card_id,
    refresh_at
  ) values (
    p_player,
    v_tasks,
    private.daily_metrics(p_player),
    private.pick_daily_reward_card(),
    now() + interval '24 hours'
  )
  returning * into v_board;

  return v_board;
end;
$$;

create or replace function private.daily_refresh_countdown(p_refresh_at timestamptz)
returns text
language plpgsql
stable
set search_path = public
as $$
declare
  v_minutes integer := greatest(
    floor(extract(epoch from greatest(p_refresh_at - now(), interval '0 seconds')) / 60)::integer,
    0
  );
begin
  return (v_minutes / 60)::text || 'h ' || lpad((v_minutes % 60)::text, 2, '0') || 'm';
end;
$$;

create or replace function private.build_daily_ops_payload(
  p_board public.daily_ops_boards,
  p_metrics jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public, private
as $$
declare
  v_task jsonb;
  v_tasks jsonb := '[]'::jsonb;
  v_completed_count integer := 0;
  v_metric text;
  v_goal integer;
  v_start integer;
  v_current integer;
  v_progress integer;
  v_clamped integer;
  v_complete boolean;
  v_total_tasks integer := jsonb_array_length(p_board.tasks);
begin
  for v_task in
    select value
    from jsonb_array_elements(p_board.tasks)
  loop
    v_metric := coalesce(v_task ->> 'metric', '');
    v_goal := greatest(coalesce((v_task ->> 'goal')::integer, 0), 0);
    v_start := coalesce((p_board.baseline ->> v_metric)::integer, 0);
    v_current := coalesce((p_metrics ->> v_metric)::integer, 0);
    v_progress := greatest(v_current - v_start, 0);
    v_clamped := least(v_progress, v_goal);
    v_complete := v_goal > 0 and v_clamped >= v_goal;

    if v_complete then
      v_completed_count := v_completed_count + 1;
    end if;

    v_tasks := v_tasks || jsonb_build_array(
      v_task || jsonb_build_object(
        'progress', v_clamped,
        'complete', v_complete,
        'percent', case
          when v_goal > 0 then round((v_clamped::numeric * 100) / v_goal)::integer
          else 0
        end
      )
    );
  end loop;

  return jsonb_build_object(
    'boardId', p_board.id,
    'cycleKey', p_board.id,
    'tasks', v_tasks,
    'completedCount', v_completed_count,
    'totalTasks', v_total_tasks,
    'allComplete', v_completed_count = v_total_tasks,
    'rewardClaimed', p_board.reward_claimed,
    'rewardCardId', p_board.reward_card_id,
    'canClaim', v_completed_count = v_total_tasks and not p_board.reward_claimed,
    'rewardLocked', false,
    'coinsReward', 24,
    'refreshAt', p_board.refresh_at,
    'refreshesIn', private.daily_refresh_countdown(p_board.refresh_at),
    'claimedAt', p_board.claimed_at
  );
end;
$$;

create or replace function public.get_daily_ops_board()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_board public.daily_ops_boards%rowtype;
  v_metrics jsonb;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  perform pg_advisory_xact_lock(hashtext('pupverse:daily:' || v_user::text));

  select * into v_board
  from public.daily_ops_boards
  where player_id = v_user
  order by created_at desc
  limit 1
  for update;

  if v_board.id is null or v_board.refresh_at <= now() then
    v_board := private.create_daily_ops_board(v_user);
  end if;

  v_metrics := private.daily_metrics(v_user);

  return private.build_daily_ops_payload(v_board, v_metrics);
end;
$$;

create or replace function public.claim_daily_ops_reward(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_board public.daily_ops_boards%rowtype;
  v_metrics jsonb;
  v_payload jsonb;
  v_balance integer;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null then
    raise exception 'Request id is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('pupverse:daily:' || v_user::text));

  select * into v_board
  from public.daily_ops_boards
  where player_id = v_user
  order by created_at desc
  limit 1
  for update;

  if v_board.id is null or v_board.refresh_at <= now() then
    raise exception 'Daily board expired. Open home again to get a fresh rotation.' using errcode = '22023';
  end if;

  if v_board.reward_claimed and v_board.claim_request_id = p_request_id then
    select coins into v_balance
    from public.profiles
    where id = v_user;

    return jsonb_build_object(
      'ok', true,
      'reward_card_id', v_board.reward_card_id,
      'coins', 24,
      'balance', v_balance,
      'claimedAt', v_board.claimed_at,
      'replayed', true
    );
  end if;

  if v_board.reward_claimed then
    raise exception 'Today''s drop has already been collected.' using errcode = '22023';
  end if;

  v_metrics := private.daily_metrics(v_user);
  v_payload := private.build_daily_ops_payload(v_board, v_metrics);

  if not coalesce((v_payload ->> 'allComplete')::boolean, false) then
    raise exception 'Finish all four daily tasks to unlock the drop.' using errcode = '22023';
  end if;

  insert into public.player_cards(player_id, card_id, quantity)
  values (v_user, v_board.reward_card_id, 1)
  on conflict (player_id, card_id)
  do update set quantity = public.player_cards.quantity + 1;

  update public.profiles
  set coins = coins + 24
  where id = v_user
  returning coins into v_balance;

  update public.daily_ops_boards
  set
    reward_claimed = true,
    claim_request_id = p_request_id,
    claimed_at = now()
  where id = v_board.id
  returning * into v_board;

  return jsonb_build_object(
    'ok', true,
    'reward_card_id', v_board.reward_card_id,
    'coins', 24,
    'balance', v_balance,
    'claimedAt', v_board.claimed_at,
    'replayed', false
  );
end;
$$;

revoke all on function public.get_daily_ops_board() from public, anon;
revoke all on function public.claim_daily_ops_reward(uuid) from public, anon;
grant execute on function public.get_daily_ops_board(), public.claim_daily_ops_reward(uuid) to authenticated;
