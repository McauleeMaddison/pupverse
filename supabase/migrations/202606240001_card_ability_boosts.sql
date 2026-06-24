-- Add card ability metadata and apply combat boosts in server-authoritative rounds.

alter table public.cards add column if not exists ability_name text not null default 'Cosmic Instinct';
alter table public.cards add column if not exists ability_description text not null default '';
alter table public.cards add column if not exists ability_boosts jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cards_ability_boosts_object'
  ) then
    alter table public.cards
      add constraint cards_ability_boosts_object
      check (jsonb_typeof(ability_boosts) = 'object');
  end if;
end $$;

with ability_data(id, ability_name, ability_description, ability_boosts) as (
values
  ('crypto-brooklyn', 'Coast Rush', 'Brooklyn charges with ocean momentum, gaining +15 Speed and +10 Power for one round.', '{"speed":15,"power":10}'::jsonb),
  ('crypto-gemstone', 'Prism Bloom', 'Gemstone releases radiant flower light, gaining +18 Luck and +12 Intelligence for one round.', '{"luck":18,"intelligence":12}'::jsonb),
  ('crypto-astro', 'Phantom Swipe', 'Ace phases through danger, gaining +18 Speed and improved evasion for one round.', '{"speed":18}'::jsonb),
  ('crypto-bandit', 'Shadow Dash', 'Bandit dashes through the shadows to evade an attack and boosts Speed by +25 for that round.', '{"speed":25}'::jsonb),
  ('crypto-raven', 'Nova Howl', 'Raven channels dark star energy, gaining +18 Power and +14 Intelligence for one round.', '{"power":18,"intelligence":14}'::jsonb),
  ('cyber-nukie', 'Halo Dash', 'Nukie bends a glowing orbit ring, gaining +16 Intelligence and +12 Speed for one round.', '{"intelligence":16,"speed":12}'::jsonb),
  ('cyber-jinx', 'Plasma Bulwark', 'Jinx activates a burning shield wall, gaining +18 Defence and +10 Power for one round.', '{"defence":18,"power":10}'::jsonb),
  ('cyber-elsie', 'Moonstep Surge', 'Elsie powers through a lunar circuit, gaining +14 Luck and +12 Intelligence.', '{"luck":14,"intelligence":12}'::jsonb),
  ('cyber-metallo', 'Titan Shell', 'Metallo locks into titan armour mode, gaining +20 Defence and +10 Power for one round.', '{"defence":20,"power":10}'::jsonb),
  ('cyber-kimiko', 'Orbit Sugar Rush', 'Kimiko spins through a candy-coloured nebula, gaining +15 Speed and +13 Intelligence.', '{"speed":15,"intelligence":13}'::jsonb),
  ('alien-aqualis', 'Lunar Drift', 'Aqualis rides the moonlit dunes, gaining +14 Speed and +12 Defence for one round.', '{"speed":14,"defence":12}'::jsonb),
  ('alien-eclipse-pop', 'Glowshift', 'Eclipse Pop activates a luminous disguise aura, gaining +20 Intelligence and +10 Luck for one round.', '{"intelligence":20,"luck":10}'::jsonb),
  ('alien-prism-fang', 'Star Slash', 'Prism Fang channels aurora energy, gaining +17 Speed and +15 Power for one round.', '{"speed":17,"power":15}'::jsonb),
  ('alien-bloopa', 'Prism Bubble', 'Bloopa conjures a moonlit bubble shield, gaining +16 Intelligence and +13 Defence for one round.', '{"intelligence":16,"defence":13}'::jsonb),
  ('alien-mintara', 'Cloud Dash', 'Mintara glides on pastel winds, gaining +14 Speed and +11 Luck for one round.', '{"speed":14,"luck":11}'::jsonb),
  ('alien-vexa-fang', 'Psionic Snarl', 'Vexa Fang unleashes a telepathic howl, gaining +18 Power and +12 Intelligence for one round.', '{"power":18,"intelligence":12}'::jsonb),
  ('alien-rosette', 'Phantom Petal', 'Rosette summons a glowing bloom spirit, gaining +15 Luck and +10 Speed for one round.', '{"luck":15,"speed":10}'::jsonb),
  ('alien-blossom-byte', 'Mist Charm', 'Blossom Byte wraps the field in dream mist, gaining +14 Luck and +8 Intelligence for one round.', '{"luck":14,"intelligence":8}'::jsonb),
  ('alien-solaro', 'Solar Stride', 'Solaro surges with comet light, gaining +14 Power and +9 Speed for one round.', '{"power":14,"speed":9}'::jsonb),
  ('alien-aster', 'Prism Step', 'Aster glides across moonlight trails, gaining +10 Speed and +12 Intelligence for one round.', '{"speed":10,"intelligence":12}'::jsonb),
  ('alien-nova-umbra', 'Dual Nova', 'Nova & Umbra fuse lunar and solar energy, gaining +12 Power and +12 Intelligence for one round.', '{"power":12,"intelligence":12}'::jsonb),
  ('alien-rosette-spirit-trail', 'Spirit Trail', 'Rosette follows a glowing grove spirit, gaining +13 Speed and +10 Luck for one round.', '{"speed":13,"luck":10}'::jsonb),
  ('alien-mintara-nebula-spirit', 'Spirit Glow', 'Mintara summons a nebula familiar, gaining +16 Intelligence and +8 Luck for one round.', '{"intelligence":16,"luck":8}'::jsonb),
  ('alien-verdix', 'Sprout Dash', 'Verdix channels sky-seed energy, gaining +11 Speed and +11 Luck for one round.', '{"speed":11,"luck":11}'::jsonb),
  ('alien-lunabop', 'Orbit Pop', 'Lunabop launches a glowing moon orb, gaining +14 Luck and +9 Power for one round.', '{"luck":14,"power":9}'::jsonb),
  ('alien-aqualis-coral', 'Tide Blink', 'Aqualis slips through a shimmering coral warp, gaining +12 Speed and +8 Intelligence for one round.', '{"speed":12,"intelligence":8}'::jsonb),
  ('alien-petalia', 'Petal Burst', 'Petalia scatters glowing bloom dust, gaining +15 Luck and +10 Speed for one round.', '{"luck":15,"speed":10}'::jsonb),
  ('alien-cosmabit', 'Orbital Dash', 'Cosmabit dashes in an orbital arc, leaving a trail of cosmic fire that boosts Speed by +20 and Defence by +15 for 2 rounds.', '{"speed":20,"defence":15}'::jsonb),
  ('alien-tiko', 'Cosmic Bubble', 'Tiko summons a protective starlight bubble that blocks damage and grants +15 Defence to all allies for one round.', '{"defence":15}'::jsonb),
  ('alien-limebyte', 'Frost Byte', 'Limebyte unleashes a wave of binary frost, chilling foes and boosting Speed +18 and Defence +14 for one round.', '{"speed":18,"defence":14}'::jsonb)
)
update public.cards c
set
  ability_name = ability_data.ability_name,
  ability_description = ability_data.ability_description,
  ability_boosts = ability_data.ability_boosts
from ability_data
where c.id = ability_data.id;

create or replace function private.stat_boost(p_card jsonb, p_stat text)
returns smallint
language sql
immutable
as $$
  select coalesce((p_card -> 'ability_boosts' ->> p_stat)::smallint, 0);
$$;

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
    'ability', jsonb_build_object('name', c.ability_name, 'description', c.ability_description),
    'ability_boosts', c.ability_boosts,
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
  v_my_value := (v_my_card -> 'stats' ->> p_stat)::smallint + private.stat_boost(v_my_card, p_stat);
  v_their_value := (v_their_card -> 'stats' ->> p_stat)::smallint + private.stat_boost(v_their_card, p_stat);
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
