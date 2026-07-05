import { settleArgsToReceiptProof, shortHex } from "@/lib/txline";
import type { Round } from "@/lib/room/useMatchRoom";

const TXORACLE_DEVNET = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";

function Row({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-faint">{k}</span>
      <span className={`${mono ? "font-mono" : ""} text-text`}>{v}</span>
    </div>
  );
}

export function ReceiptCard({
  round,
  homeShort,
  awayShort,
}: {
  round: Round;
  homeShort: string;
  awayShort: string;
}) {
  if (!round.receipt || round.outcome === undefined) return null;
  const p = settleArgsToReceiptProof(round.receipt.args, round.receipt.mock);
  const scored = round.outcome ? homeShort : awayShort;
  const scorer = round.goal?.scorer;

  return (
    <div className="animate-popin card overflow-hidden p-0" style={{ background: "#06080c" }}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="pill pill-lime">✓ VERIFIED ON-CHAIN</span>
        {round.receipt.mock && <span className="pill text-faint">MOCK</span>}
      </div>

      <div className="px-4 py-4">
        <p className="text-sm">
          <span className="text-muted">Outcome proven: </span>
          <span className="font-semibold text-text">
            {scored} scored the next goal{scorer ? ` — ${scorer}` : ""} ({round.goal?.minute}&apos;)
          </span>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Verified against TxLINE&apos;s on-chain daily-scores Merkle root via a{" "}
          <span className="font-mono text-text">validate_stat</span> CPI —{" "}
          <span className="text-lime">trust no oracle — verifiable</span>. Anyone can re-derive it
          from the proof below.
        </p>

        <div className="mt-3 rounded-[12px] border border-line bg-[rgba(255,255,255,0.03)] px-3 py-2 font-mono">
          <Row k="program" v={`TxOracle · ${shortHex(TXORACLE_DEVNET, 4)}`} />
          <Row k="instruction" v="validate_stat" />
          <Row k="target_ts" v={String(p.targetTs)} />
          <Row k="summary root" v={shortHex(p.rootHex, 8)} />
          <Row k="leaf" v={p.leafHex ? shortHex(p.leafHex, 8) : "—"} />
          <Row k="fixture proof" v={`${p.fixtureProofDepth} nodes`} mono={false} />
          <Row k="main-tree proof" v={`${p.mainTreeProofDepth} nodes`} mono={false} />
        </div>

        {round.receipt.mock && (
          <p className="mt-2.5 text-center text-[11px] text-faint">
            Simulated feed → mock proof fixture. Live feed swaps in the real{" "}
            <span className="font-mono">/api/scores/stat-validation</span> proof.
          </p>
        )}
      </div>
    </div>
  );
}
