import type { MatchEvent } from "@/lib/feed";

function label(e: MatchEvent): { icon: string; text: string; settled: boolean } {
  const side = e.team === "home" ? "Home" : e.team === "away" ? "Away" : "";
  switch (e.kind) {
    case "goal":
      return { icon: "⚽", text: `GOAL — ${e.scorer ?? side}`, settled: true };
    case "corner":
      return { icon: "⛳", text: `Corner — ${side}`, settled: false };
    case "card":
      return { icon: e.card === "red" ? "🟥" : "🟨", text: `Booking — ${side}`, settled: false };
    case "kickoff":
      return { icon: "🟢", text: "Kick-off", settled: false };
    case "fulltime":
      return { icon: "🏁", text: "Full time", settled: false };
    default:
      return { icon: "•", text: "", settled: false };
  }
}

export function EventTicker({ events }: { events: MatchEvent[] }) {
  const shown = events.filter((e) => e.kind !== "clock").slice(0, 8);
  return (
    <div className="card p-4">
      <h3 className="eyebrow mb-3 text-muted">Live ticker</h3>
      {shown.length === 0 ? (
        <p className="text-sm text-faint">Waiting for kick-off…</p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {shown.map((e) => {
            const l = label(e);
            return (
              <li key={e.id} className="animate-tickerin flex items-center gap-3 text-sm">
                <span className="num w-9 shrink-0 text-right text-base text-lime">{e.minute}&apos;</span>
                <span className="w-5 text-center">{l.icon}</span>
                <span className="flex-1 text-text">{l.text}</span>
                {l.settled && (
                  <span className="eyebrow shrink-0 text-lime">settled ✓ verifiable</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
