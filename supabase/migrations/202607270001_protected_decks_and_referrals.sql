-- Protected deck management and one-time referral rewards.
-- Browser clients may read their own deck, but only these functions may change it.

create table public.deck_update_requests (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  request_id uuid not null,
  card_ids text[] not null check (cardinality(card_ids) = 3),
  created_at timestamptz not null default now(),
  unique (player_id, request_id)
);

create table public.player_invite_codes (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{8}$'),
  created_at timestamptz not null default now()
);

create table public.referral_claims (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null unique references public.profiles(id) on delete cascade,
  request_id uuid not null,
  inviter_reward integer not null check (inviter_reward > 0),
  invitee_reward integer not null check (invitee_reward > 0),
  claimed_at timestamptz not null default now(),
  check (inviter_id <> invitee_id),
  unique (invitee_id, request_id)
);

alter table public.deck_update_requests enable row level security;
alter table public.player_invite_codes enable row level security;
alter table public.referral_claims enable row level security;

create policy deck_update_requests_own_read on public.deck_update_requests
  for select to authenticated using (player_id = (select auth.uid()));
create policy invite_codes_own_read on public.player_invite_codes
  for select to authenticated using (player_id = (select auth.uid()));
create policy referral_claims_own_read on public.referral_claims
  for select to authenticated using ((select auth.uid()) in (inviter_id, invitee_id));

grant select on public.deck_update_requests, public.player_invite_codes, public.referral_claims to authenticated;

-- Replace permissive owner-write policies installed by the original Arena migration.
drop policy if exists decks_own on public.decks;
drop policy if exists deck_cards_own on public.deck_cards;
create policy decks_own_read on public.decks
  for select to authenticated using (player_id = (select auth.uid()));
create policy deck_cards_own_read on public.deck_cards
  for select to authenticated using (deck_id in (select id from public.decks where player_id = (select auth.uid())));

revoke insert, update, delete on public.decks, public.deck_cards from authenticated;
grant select on public.decks, public.deck_cards to authenticated;

create or replace function public.set_active_deck(
  p_card_ids text[],
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_deck uuid;
  v_existing public.deck_update_requests%rowtype;
  v_card_id text;
  v_position smallint := 0;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if p_request_id is null then
    raise exception 'Request id is required' using errcode = '22023';
  end if;
  if cardinality(p_card_ids) <> 3 or cardinality(array(select distinct unnest(p_card_ids))) <> 3 then
    raise exception 'An active deck needs exactly three different cards' using errcode = '22023';
  end if;

  select * into v_existing from public.deck_update_requests
  where player_id = v_user and request_id = p_request_id;
  if v_existing.id is not null then
    return jsonb_build_object('deck_card_ids', to_jsonb(v_existing.card_ids), 'replayed', true);
  end if;

  foreach v_card_id in array p_card_ids loop
    if not exists (
      select 1 from public.player_cards
      where player_id = v_user and card_id = v_card_id and quantity > 0
    ) then
      raise exception 'Deck contains a card you do not own' using errcode = '22023';
    end if;
  end loop;

  select id into v_deck from public.decks
  where player_id = v_user and active
  for update;
  if v_deck is null then
    insert into public.decks(player_id, name, active)
    values (v_user, 'Active Deck', true)
    returning id into v_deck;
  end if;

  delete from public.deck_cards where deck_id = v_deck;
  foreach v_card_id in array p_card_ids loop
    v_position := v_position + 1;
    insert into public.deck_cards(deck_id, card_id, position)
    values (v_deck, v_card_id, v_position);
  end loop;

  insert into public.deck_update_requests(player_id, request_id, card_ids)
  values (v_user, p_request_id, p_card_ids);

  return jsonb_build_object('deck_id', v_deck, 'deck_card_ids', to_jsonb(p_card_ids), 'replayed', false);
end;
$$;

create or replace function public.get_or_create_invite_code()
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_code text;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  select code into v_code from public.player_invite_codes where player_id = v_user;
  if v_code is null then
    loop
      v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
      begin
        insert into public.player_invite_codes(player_id, code) values (v_user, v_code);
        exit;
      exception when unique_violation then
        -- Generate a new code if the global unique index collided.
      end;
    end loop;
  end if;
  return jsonb_build_object('code', v_code);
end;
$$;

create or replace function public.claim_referral_reward(
  p_code text,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_inviter uuid;
  v_existing public.referral_claims%rowtype;
  v_reward integer := 10;
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if p_request_id is null then raise exception 'Request id is required' using errcode = '22023'; end if;

  select * into v_existing from public.referral_claims
  where invitee_id = v_user and request_id = p_request_id;
  if v_existing.id is not null then
    return jsonb_build_object('inviter_reward', v_existing.inviter_reward, 'invitee_reward', v_existing.invitee_reward, 'replayed', true);
  end if;
  if exists(select 1 from public.referral_claims where invitee_id = v_user) then
    raise exception 'This player has already claimed a referral reward' using errcode = '22023';
  end if;

  select player_id into v_inviter from public.player_invite_codes where code = upper(trim(p_code)) for share;
  if v_inviter is null then raise exception 'Invite code is invalid' using errcode = '22023'; end if;
  if v_inviter = v_user then raise exception 'You cannot use your own invite code' using errcode = '22023'; end if;

  -- Lock both balances before issuing a one-time, auditable reward.
  perform 1 from public.profiles where id in (v_user, v_inviter) order by id for update;
  update public.profiles set coins = coins + v_reward where id in (v_user, v_inviter);
  insert into public.referral_claims(inviter_id, invitee_id, request_id, inviter_reward, invitee_reward)
  values (v_inviter, v_user, p_request_id, v_reward, v_reward);

  return jsonb_build_object('inviter_reward', v_reward, 'invitee_reward', v_reward, 'replayed', false);
end;
$$;

revoke all on function public.set_active_deck(text[], uuid), public.get_or_create_invite_code(), public.claim_referral_reward(text, uuid) from public, anon;
grant execute on function public.set_active_deck(text[], uuid), public.get_or_create_invite_code(), public.claim_referral_reward(text, uuid) to authenticated;
