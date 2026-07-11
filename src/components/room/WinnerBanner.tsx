export function WinnerBanner({
  winners,
  payouts,
  rake,
}: {
  winners: string[];
  payouts: { player: string; amount: number }[];
  rake: number;
}) {
  const youWon = winners.includes("You");
  return (
    <div className="card-accent p-6 text-center">
      <div className="eyebrow text-lime">Full time</div>
      <div className="display mt-1 text-3xl">
        {youWon ? "YOU WIN" : winners.length > 1 ? "SPLIT POT" : `${winners[0] ?? "—"} WINS`}
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {payouts.map((p) => (
          <div key={p.player} className="flex items-center justify-between text-sm">
            <span className={p.player === "You" ? "font-semibold text-lime" : "text-muted"}>{p.player}</span>
            <span className="num text-text">{(p.amount / 1e9).toFixed(4)} SOL</span>
          </div>
        ))}
        <div className="mt-1 flex items-center justify-between text-xs text-faint">
          <span>rake → treasury</span>
          <span className="num">{(rake / 1e9).toFixed(4)} SOL</span>
        </div>
      </div>
    </div>
  );
}
