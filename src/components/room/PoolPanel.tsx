export interface StandingRow {
  player: string;
  points: number;
  isYou: boolean;
}

export function Standings({ standings, pot }: { standings: StandingRow[]; pot: number }) {
  const top = standings.slice(0, 8);
  return (
    <div className="card p-4">
      <h3 className="eyebrow mb-3 text-muted">
        Standings · <span className="num text-text">{(pot / 1e9).toFixed(2)}</span> SOL pot
      </h3>
      {top.length === 0 ? (
        <p className="text-sm text-faint">No players yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {top.map((s, i) => (
            <li
              key={s.player}
              className={`flex items-center justify-between rounded-[12px] px-2.5 py-2 text-sm ${
                s.isYou ? "bg-[rgba(198,255,58,0.1)] ring-1 ring-[rgba(198,255,58,0.3)]" : ""
              }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="num w-5 text-right text-xs text-faint">{i + 1}</span>
                <span className={s.isYou ? "font-semibold text-lime" : "text-text"}>{s.player}</span>
              </span>
              <span className="num text-text">{s.points.toLocaleString()} pts</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
