export interface StandingRow {
  player: string;
  points: number;
  isYou: boolean;
}

function initials(name: string): string {
  const parts = name.split(/[\s_]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Slim running-standings strip — initials avatars + points in a single
 * horizontally-scrollable line, sorted by the hook. "You" is pinned lime.
 */
export function Standings({ standings, pot }: { standings: StandingRow[]; pot: number }) {
  const top = standings.slice(0, 8);
  return (
    <div className="card flex items-center gap-3 px-3 py-2">
      <div className="shrink-0">
        <div className="eyebrow text-[9px] text-faint">Pot</div>
        <div className="num text-sm leading-none text-lime">{(pot / 1e9).toFixed(2)}</div>
      </div>
      <div className="h-7 w-px shrink-0 bg-line" />
      {top.length === 0 ? (
        <span className="text-xs text-faint">No players yet.</span>
      ) : (
        <ul className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
          {top.map((s) => (
            <li
              key={s.player}
              title={`${s.player} · ${s.points.toLocaleString()} pts`}
              className={`flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 ${
                s.isYou ? "bg-[rgba(198,255,58,0.12)] ring-1 ring-[rgba(198,255,58,0.35)]" : "bg-panel2"
              }`}
            >
              <span
                className={`num flex h-6 w-6 items-center justify-center rounded-full text-[10px] ${
                  s.isYou ? "bg-lime text-[#0a0d12]" : "bg-[rgba(255,255,255,0.08)] text-muted"
                }`}
              >
                {s.isYou ? "YOU" : initials(s.player)}
              </span>
              <span className={`num text-xs ${s.isYou ? "text-lime" : "text-text"}`}>{s.points.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
