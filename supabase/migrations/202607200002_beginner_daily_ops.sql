-- Make the first authenticated daily board beginner-friendly.
-- New accounts should be able to finish the opening loop quickly instead of
-- rolling straight into a full live-service cadence.

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
  v_baseline jsonb := private.daily_metrics(p_player);
  v_online_matches integer := coalesce((v_baseline ->> 'onlineMatches')::integer, 0);
  v_packs_opened integer := coalesce((v_baseline ->> 'packsOpened')::integer, 0);
  v_collection_count integer := coalesce((v_baseline ->> 'collectionCount')::integer, 0);
begin
  if v_online_matches = 0 and v_packs_opened = 0 and v_collection_count = 0 then
    v_tasks := jsonb_build_array(
      jsonb_build_object(
        'id', 'online-play-1',
        'group', 'onlineMatches',
        'metric', 'onlineMatches',
        'goal', 1,
        'icon', '◆',
        'title', 'Play 1 live match',
        'description', 'Take your first protected arena match to complete the opening run.'
      ),
      jsonb_build_object(
        'id', 'pack-open-1',
        'group', 'packsOpened',
        'metric', 'packsOpened',
        'goal', 1,
        'icon', '✦',
        'title', 'Open 1 pack',
        'description', 'Crack one protected pack to start the synced vault.'
      ),
      jsonb_build_object(
        'id', 'collect-cards-3',
        'group', 'collection',
        'metric', 'collectionCount',
        'goal', 3,
        'icon', '◇',
        'title', 'Collect 3 cards',
        'description', 'Send three owned cards into the synced collection.'
      ),
      jsonb_build_object(
        'id', 'collect-unique-1',
        'group', 'collection',
        'metric', 'uniqueOwned',
        'goal', 1,
        'icon', '◇',
        'title', 'Discover 1 new pup',
        'description', 'Reveal one new unique card to finish the starter board.'
      )
    );
  else
    foreach v_group in array array['onlineWins', 'onlineMatches', 'packsOpened', 'collection'] loop
      v_tasks := v_tasks || jsonb_build_array(private.pick_daily_task(v_group));
    end loop;
  end if;

  insert into public.daily_ops_boards(
    player_id,
    tasks,
    baseline,
    reward_card_id,
    refresh_at
  ) values (
    p_player,
    v_tasks,
    v_baseline,
    private.pick_daily_reward_card(),
    now() + interval '24 hours'
  )
  returning * into v_board;

  return v_board;
end;
$$;
