import type { MatchEvent } from "@/lib/feed";

function label(e: MatchEvent): { icon: string; text: string; tone: string } {
  const side = e.team === "home" ? "Home" : e.team === "away" ? "Away" : "";
  switch (e.kind) {
    case "goal":
      return { icon: "⚽", text: `GOAL — ${e.scorer ?? side}${e.goalType ? ` (${e.goalType})` : ""}`, tone: "text-neon" };
    case "corner":
      return { icon: "⛳", text: `Corner — ${side}`, tone: "text-cyan" };
    case "card":
      return {
        icon: e.card === "red" ? "🟥" : "🟨",
        text: `${e.card === "red" ? "Red" : "Yellow"} card — ${side}`,
        tone: e.card === "red" ? "text-lose" : "text-gold",
      };
    case "kickoff":
      return { icon: "🟢", text: "Kick-off", tone: "text-muted" };
    case "fulltime":
      return { icon: "🏁", text: "Full time", tone: "text-muted" };
    default:
      return { icon: "•", text: "", tone: "text-muted" };
  }
}

export function EventTicker({ events }: { events: MatchEvent[] }) {
  const shown = events.filter((e) => e.kind !== "clock").slice(0, 8);
  return (
    <div className="card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Live ticker</h3>
      {shown.length === 0 ? (
        <p className="text-sm text-faint">Waiting for kick-off…</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {shown.map((e) => {
            const l = label(e);
            return (
              <li key={e.id} className="animate-tickerin flex items-center gap-3 text-sm">
                <span className="num w-8 shrink-0 text-right text-xs text-faint">{e.minute}&apos;</span>
                <span className="w-5 text-center">{l.icon}</span>
                <span className={l.tone}>{l.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
