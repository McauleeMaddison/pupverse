# Public beta launch checklist

## Frontend instrumentation

PupVerse emits privacy-conscious product events through `window.dataLayer` and an
optional `window.pupverseAnalytics.track(name, properties)` adapter. Events never
include emails, player IDs, card IDs, or free-text feedback.

Track these events in the analytics provider you choose:

- `first_battle_started`, `first_battle_won`
- `first_pack_opened`
- `daily_board_completed`, `daily_reward_claimed`
- `account_signup_started`, `account_signup_completed`

For local inspection only, run this in the browser console:

```js
localStorage.setItem("pupverse-analytics-debug", "true")
```

## Production acceptance test

Run against the deployed Render URL with two separate browser profiles and two
new accounts. Record the date, URLs, account aliases, and pass/fail result.

1. Create both accounts; confirm each receives starter cards, an active deck,
   and a daily board.
2. Open a pack, retry its request, and verify the balance is debited once and
   the same opening is returned.
3. Create an anonymous player, open a pack, link an email identity, and confirm
   the same cards, balance, deck, and daily progress remain.
4. Complete a daily board, claim the reward, retry the claim, and verify the
   second claim is rejected without a second reward.
5. Run Solo, Packs, Vault, and Daily Ops on Safari for iOS and Chrome for Android.
6. Verify casual matchmaking, reconnect recovery, friend rooms, report/block,
   ratings, and leaderboard updates with both accounts.
7. Attempt direct client-side writes to coins, cards, decks, and another
   player’s vault. Every request must fail through RLS or the Edge Functions.

Keep Ranked disabled until every test passes on production.

## Before publishing the beta link

- Enable CAPTCHA and anonymous sign-in/manual identity linking in Supabase Auth.
- Set the Render production URL and any custom domain in Supabase Auth Site URL
  and Redirect URLs.
- Deploy `arena`, `progression`, and `arena-cron`; configure the cron secret in
  a trusted scheduler, never in Render frontend variables.
- The in-game **Feedback** link opens a pre-filled beta issue with
  browser, platform, and viewport details. Keep the repository issue tracker
  monitored, or replace `FEEDBACK_URL` in `src/main.js` with your support form
  before a wider announcement.
