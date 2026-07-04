# Demo — recording ELEVEN on the simulated feed

The whole app runs with **no TxLINE token and no wallet**. The `SimulatedFeed`
replays a scripted ~5-minute World Cup match (Brazil vs Argentina) with goals,
corners, and cards on a timeline, so the full loop — predict → lock → live goal →
resolve → verifiable receipt → standings — is demoable and recordable today.

## Run it

```bash
npm install
npm run dev
# open http://localhost:3000   (feed defaults to sim — zero env needed)
```

Optional: speed the match up while rehearsing:

```bash
NEXT_PUBLIC_SIM_SPEED=3 npm run dev   # ~100s match instead of ~5 min
```

## The 5-minute arc (matches docs/PLAYBOOK.md §4)

1. **Lobby** — land on `/`, hit **"Play free — no wallet"**. Free play is the default.
2. **Match room** (`/match/900101`) — live score + clock ticking. The
   **"Who scores the NEXT goal?"** card opens with a lock countdown. Tap Home or Away.
3. **Lock + goal** — the window closes; seconds later a real (simulated) goal fires.
   The card resolves with a flash, points/streak update, standings shift.
4. **Verifiable receipt** — the receipt card appears: outcome proven, the TxOracle
   `validate_stat` program + Merkle proof (root, leaf, proof depths). This is the
   judge signal — "trust no oracle." On sim it's clearly badged **MOCK PROOF**.
5. Repeat for a few goals (they come ~every 45s); show a streak building.

Timeline of goals (real seconds from kick-off): 22, 74, 118, 188, 236, 286 →
final 3–3, so several rounds resolve on camera.

## Optional: the USDC path

Inside a match, flip the toggle to **USDC pool**. Without `NEXT_PUBLIC_PRIVY_APP_ID`
this uses a demo stub wallet (labeled as such). Free play stays the hero.

## Switching to the real feed (when the token lands)

```bash
NEXT_PUBLIC_FEED=live TXLINE_API_KEY=<token> npm run dev
```

Everything downstream is identical — only the feed source and the receipt's proof
(mock → real `/api/scores/stat-validation`) change. See the report / README for the
full swap list.
