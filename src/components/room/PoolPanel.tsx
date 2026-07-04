import type { RoomView } from "@/lib/room/useMatchRoom";

export function PoolPanel({
  odds,
  standings,
  homeShort,
  awayShort,
}: {
  odds: RoomView["odds"];
  standings: RoomView["standings"];
  homeShort: string;
  awayShort: string;
}) {
  const homePct = Math.round(odds.home * 100);
  const awayPct = 100 - homePct;
  const top = standings.slice(0, 6);

  return (
    <div className="card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">
        Pool · <span className="num text-text">{odds.total.toLocaleString()}</span> staked
      </h3>

      {/* parimutuel split */}
      <div className="mb-1 flex justify-between text-xs">
        <span style={{ color: "var(--color-home)" }}>
          {homeShort} {homePct}%
        </span>
        <span style={{ color: "var(--color-away)" }}>
          {awayShort} {awayPct}%
        </span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-surface2">
        <div style={{ width: `${homePct}%`, background: "var(--color-home)" }} />
        <div style={{ width: `${awayPct}%`, background: "var(--color-away)" }} />
      </div>

      {/* leaderboard */}
      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Standings</h3>
      <ul className="flex flex-col gap-1">
        {top.map((s, i) => (
          <li
            key={s.user}
            className={`flex items-center justify-between rounded-lg px-2 py-1.5 text-sm ${
              s.isYou ? "bg-neon/10 ring-1 ring-neon/30" : ""
            }`}
          >
            <span className="flex items-center gap-2">
              <span className="num w-5 text-right text-xs text-faint">{i + 1}</span>
              <span className={s.isYou ? "font-semibold text-neon" : ""}>{s.user}</span>
            </span>
            <span className="num text-text">{s.points.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
