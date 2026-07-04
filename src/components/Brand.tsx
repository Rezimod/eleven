export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display font-bold tracking-tight ${className}`}>
      ELEVEN<span className="text-neon">.</span>
    </span>
  );
}

export function LiveDot({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="chip border-lose/40 text-lose">
      <span className="livedot inline-block h-1.5 w-1.5 rounded-full bg-lose" />
      {label}
    </span>
  );
}

export function FeedChip({ mode }: { mode: "sim" | "live" }) {
  return (
    <span className={`chip ${mode === "live" ? "text-win border-win/40" : "text-cyan border-cyan/40"}`}>
      {mode === "live" ? "LIVE FEED" : "SIM FEED"}
    </span>
  );
}
