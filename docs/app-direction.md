# PupVerse App Direction

PupVerse should remain a polished Vite web game.

The web app is the product surface because it already fits the core goals:

- responsive browser and mobile play
- animated card collection, pack opening, vault, and battle UI
- Supabase-backed accounts, saves, matchmaking, and server-verified actions
- simple hosting and sharing without desktop installs

Python can still be useful later, but it should be added as optional support tooling rather than replacing the Vite app.

Good future Python uses:

- card balance simulations
- pack-odds testing
- battle-stat analysis
- admin/import scripts for card data
- offline bots or test harnesses

Recommended boundary:

- `src/`: Vite frontend and browser game experience
- `supabase/`: online backend, auth, database, edge functions
- `tools/` or `simulations/`: optional Python utilities if needed later

Avoid mixing Python runtime code into the Vite frontend path unless it is build tooling or data-generation support.
