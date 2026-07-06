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

## Live-match MVP (real TxLINE feed)

The live MVP runs the room against a **real World Cup fixture**. It never falls
back to the fictional simulated match in this mode — if nothing is live it replays
the most-recent real fixture, clearly badged **REPLAY**.

### Env needed

| var | required | what it does |
|---|---|---|
| `NEXT_PUBLIC_FEED=live` | yes | switches the app off the sim onto the real `TxlineFeed` |
| `TXLINE_API_KEY` | yes | the secret X-Api-Token; held server-side only (the two `/api/txline/*` proxies), never sent to the browser |
| `TXLINE_ORIGIN` | no | defaults to `https://txline.txodds.com` |
| `TXLINE_COMPETITION_ID` | no | fixture competition (defaults to `72`, World Cup) |
| `TXLINE_FIXTURES_START_EPOCHDAY`, `TXLINE_FIXTURES_DAYS` | no | the fixture window the lobby lists |

```bash
NEXT_PUBLIC_FEED=live TXLINE_API_KEY=<token> npm run dev
# open http://localhost:3000
```

Without `TXLINE_API_KEY` the `/api/txline/*` routes return 503 and the live lobby is
empty — that's expected; the token is the one thing you must supply.

### What live mode does

1. **Fixture picker** — the lobby (`/`) lists the real fixture slate grouped into
   **Live now**, **Upcoming**, and **Recent — replay**. Pick any one.
2. **Live match** — a live fixture streams over SSE (`/api/txline/stream`), showing
   real score + clock. A finished fixture is replayed from kickoff (`?replay=1`,
   resumed from event id 0) and badged **REPLAY** — no fictional sim.
3. **Live stats** — shots, shots-on-target, possession, attacks/dangerous-attacks and
   momentum render in the `StatsBar`, badged **display only · not settleable**. They
   come from the live payload's `stats` map + `possession` (see `parseStats`); confirm
   the exact `stats`-map key IDs against a live payload — unknown keys default to 0.
4. **Live bets** — as pressure builds, the smart market generator opens time-boxed
   markets (goal-in-N, over-corners, another-card). Each shows the trigger that fired
   it and the provable stat it settles on (`validate_stat` over goals/corners/cards).
   They lock on the commit countdown and close on the match clock.

Everything downstream (scoring, settlement, receipts) is identical to sim — only the
feed source and the receipt's proof (mock → real `/api/scores/stat-validation`) change.
