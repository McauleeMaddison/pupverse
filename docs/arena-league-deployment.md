# Arena League deployment

## Trust boundary

The browser never decides a round, reward, rating change, timeout, or match winner.
It sends an authenticated action to the `arena` Edge Function. The function invokes
transactional Postgres functions that lock the match row and read authoritative card
stats from a private deck snapshot. Full opponent snapshots are stored only in the
`private` schema and cannot be selected through the Data API.

Pack contents and Vault ownership use the same trust boundary. The browser invokes
the authenticated `progression` Edge Function with an idempotency key. PostgreSQL
locks the player's profile, verifies the balance, draws cards using server-side
randomness, updates owned-card quantities, debits coins, and records the opening in
one transaction. Direct browser writes to quantities and ownership are revoked.

Active decks and referral rewards use the same trust boundary. A signed-in browser
sends exactly three card IDs plus an idempotency key to `progression`; PostgreSQL
verifies ownership, replaces the active deck in one transaction, and records the
request. Invite codes and referral claims are server-issued and one-time only.

## Local setup

Prerequisites: Docker Desktop and Node.js.

```bash
npm install
npm run supabase:start
npm run supabase:reset
cp .env.example .env.local
```

Copy the local API URL and publishable/anon key printed by `npm run supabase:status`
into `.env.local`, then run:

```bash
npm run supabase:functions
npm run dev -- --host 127.0.0.1 --port 4175
```

For local function calls, set the function URL through the Supabase client URL printed
by the CLI. The Vite application automatically enables the account gate when both
`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are present. Existing
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` names are also
accepted by this project.

Anonymous sign-in is enabled in local `config.toml`. A first-time visitor receives a
real authenticated guest profile, starter Vault cards, and a starter deck. The
"Secure account" action links an email or OAuth identity to the same user ID, so the
Vault is preserved. For a hosted project, enable Anonymous Sign-Ins and manual
identity linking in the Auth dashboard. Add CAPTCHA before a public launch to limit
automated anonymous-account creation.

## Hosted setup

1. Create a Supabase project.
2. Link it with `npx supabase link --project-ref <project-ref>`.
3. Apply schema and seed data with `npx supabase db push --include-seed`. This includes
   `202607270001_protected_decks_and_referrals.sql`, which revokes direct deck writes.
4. Deploy functions with `npx supabase functions deploy arena`,
   `npx supabase functions deploy progression`, and
   `npx supabase functions deploy arena-cron --no-verify-jwt`.
5. Create a secret API key named `arena-cron` and schedule `arena-cron` every 15 seconds
   from a trusted worker or scheduler. Never place that key in Vite environment files.
6. Disable Realtime public channel access in the Supabase dashboard. Match presence
   channels use RLS authorization on `realtime.messages`.
7. Configure Auth site URL and redirect URLs for the production domain.
8. Put only the project URL and publishable key in the frontend environment.

## Two-player release test

Use two isolated browser profiles and two different email accounts.

1. Confirm each signup creates a profile, three starter cards, and an active starter deck.
2. Queue both users in Casual and confirm they receive the same match ID.
3. Verify only the active player can resolve a round and repeated action nonces are idempotent.
4. Attempt an invalid stat, a second action in the same round, and an action from the wrong player.
5. Disconnect one browser for under 60 seconds and confirm it can recover the match.
6. Disconnect for over 60 seconds, run the stale-state sweep, and confirm an official abandonment.
7. Create and join a friend room; verify an unrelated account cannot read its channel.
8. Finish a Ranked match and confirm both ratings, leaderboard order, rewards, and match history.
9. Submit a report and block the opponent; verify open matchmaking no longer pairs them.
10. Open a pack in both browsers. Confirm each request debits coins once, the returned
    cards appear in `player_cards`, duplicate quantities increment, and a retry using
    the same request ID returns the same opening without a second debit.
11. Attempt direct inserts, quantity changes, deck/deck-card writes, coin changes, and
    another player's Vault reads through the browser client; every request must be
    rejected by grants/RLS. Save a legal three-card deck through `progression` and
    confirm it succeeds; retry the same request ID and confirm it is replayed.
12. Create an anonymous player, open a pack, link an email or Google identity, and
    confirm the same player ID, balance, cards, favourites, and deck remain available.
13. Generate an invite code for player A, redeem it as player B, retry the same request,
    and confirm each balance changes once. Confirm self-referral and a second redemption
    by player B are rejected.

Do not launch ranked mode until all twelve checks pass against the hosted project.
