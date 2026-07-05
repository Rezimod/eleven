import type { RoomView } from "@/lib/room/useMatchRoom";

export function Standings({
  standings,
  total,
}: {
  standings: RoomView["standings"];
  total: number;
}) {
  const top = standings.slice(0, 6);

  return (
    <div className="card p-4">
      <h3 className="eyebrow mb-3 text-muted">
        Standings · <span className="num text-text">{total.toLocaleString()}</span> in pool
      </h3>
      <ul className="flex flex-col gap-1">
        {top.map((s, i) => (
          <li
            key={s.user}
            className={`flex items-center justify-between rounded-[12px] px-2.5 py-2 text-sm ${
              s.isYou ? "bg-[rgba(198,255,58,0.1)] ring-1 ring-[rgba(198,255,58,0.3)]" : ""
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span className="num w-5 text-right text-xs text-faint">{i + 1}</span>
              <span className={s.isYou ? "font-semibold text-lime" : "text-text"}>{s.user}</span>
            </span>
            <span className="num text-text">{s.points.toLocaleString()}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
