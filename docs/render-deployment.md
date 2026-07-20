# Render deployment

PupVerse ships cleanly to Render as a static site. The browser bundle stays on
Render, while Supabase remains the backend trust boundary for auth, packs, and
multiplayer.

## What this repo now includes

- `render.yaml` for a Render Blueprint static site
- `.env.example` for the required public frontend variables
- `public/site.webmanifest` plus mobile web app meta tags

## Render setup

1. Push this repository to GitHub or GitLab.
2. In Render, create a new Blueprint and point it at this repo.
3. Render will detect `render.yaml` and create a static site named `pupverse`.
4. During the first Blueprint deploy, provide values for:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Let the build finish and note the generated `onrender.com` URL.

If you prefer the manual static-site flow instead of a Blueprint, use:

- Build command: `npm ci && npm run build`
- Publish directory: `dist`

## Supabase production checklist

1. In Supabase Auth, set the Site URL to your Render production URL.
2. Add that same URL to the allowed redirect URLs.
3. If you later attach a custom domain, add the custom domain there as well.
4. Deploy the Supabase Edge Functions separately as described in
   [arena-league-deployment.md](/Users/user/Desktop/pupverse/docs/arena-league-deployment.md).

## Notes

- This app does not currently need a Render rewrite rule because it renders from
  a single browser entrypoint instead of path-based client routing.
- Only public frontend values belong in Render for this Vite app. Do not place
  service-role keys or cron secrets in frontend environment variables.
