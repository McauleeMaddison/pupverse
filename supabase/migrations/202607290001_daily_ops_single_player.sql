-- Daily Ops is a protected single-player loop during public beta.
-- Do not ask players to enter Online until matchmaking has passed its launch QA.

create or replace function private.pick_daily_task(p_group text)
returns jsonb
language plpgsql
volatile
set search_path = public, private
as $$
begin
  case p_group
    when 'packsOpened' then
      return jsonb_build_object(
        'id', 'pack-open-1',
        'group', 'packsOpened',
        'metric', 'packsOpened',
        'goal', 1,
        'icon', '✦',
        'title', 'Open 1 foil pack',
        'description', 'Tear one pack and add its three pulls to your vault.'
      );
    when 'vaultGrowth' then
      return jsonb_build_object(
        'id', 'collect-cards-3',
        'group', 'vaultGrowth',
        'metric', 'collectionCount',
        'goal', 3,
        'icon', '◇',
        'title', 'Add 3 cards to your vault',
        'description', 'Grow the collection with one complete foil pull.'
      );
    when 'discoveries' then
      return jsonb_build_object(
        'id', 'discover-unique-1',
        'group', 'discoveries',
        'metric', 'uniqueOwned',
        'goal', 1,
        'icon', '✧',
        'title', 'Discover 1 new pup',
        'description', 'Find a card your vault has never held before.'
      );
    when 'duplicates' then
      return jsonb_build_object(
        'id', 'gain-duplicate-1',
        'group', 'duplicates',
        'metric', 'duplicateCount',
        'goal', 1,
        'icon', '⧉',
        'title', 'Gain 1 duplicate',
        'description', 'Build fusion material from a repeated pull.'
      );
    else
      raise exception 'Unknown daily task group: %', p_group using errcode = '22023';
  end case;
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
  v_baseline jsonb := private.daily_metrics(p_player);
begin
  insert into public.daily_ops_boards(
    player_id,
    tasks,
    baseline,
    reward_card_id,
    refresh_at
  ) values (
    p_player,
    jsonb_build_array(
      private.pick_daily_task('packsOpened'),
      private.pick_daily_task('vaultGrowth'),
      private.pick_daily_task('discoveries'),
      private.pick_daily_task('duplicates')
    ),
    v_baseline,
    private.pick_daily_reward_card(),
    now() + interval '24 hours'
  )
  returning * into v_board;

  return v_board;
end;
$$;

-- Replace unclaimed live boards immediately so no beta player is directed to Online.
update public.daily_ops_boards as board
set
  tasks = jsonb_build_array(
    private.pick_daily_task('packsOpened'),
    private.pick_daily_task('vaultGrowth'),
    private.pick_daily_task('discoveries'),
    private.pick_daily_task('duplicates')
  ),
  baseline = private.daily_metrics(board.player_id)
where board.reward_claimed = false
  and board.refresh_at > now();
