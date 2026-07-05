import { shortHex, type ReceiptProof } from "@/lib/txline";

const TXORACLE_DEVNET = "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J";

function Row({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-faint">{k}</span>
      <span className={`${mono ? "font-mono" : ""} text-text`}>{v}</span>
    </div>
  );
}

/** Verifiable-receipt card for one resolved market. */
export function ReceiptCard({ proof, outcomeText }: { proof: ReceiptProof; outcomeText: string }) {
  return (
    <div className="animate-popin card overflow-hidden p-0" style={{ background: "#06080c" }}>
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="pill pill-lime">✓ VERIFIED ON-CHAIN</span>
        {proof.mock && <span className="pill text-faint">MOCK</span>}
      </div>
      <div className="px-4 py-4">
        <p className="text-sm">
          <span className="text-muted">Outcome proven: </span>
          <span className="font-semibold text-text">{outcomeText}</span>
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-muted">
          Verified against TxLINE&apos;s on-chain daily-scores Merkle root via a{" "}
          <span className="font-mono text-text">validate_stat</span> CPI —{" "}
          <span className="text-lime">trust no oracle — verifiable</span>.
        </p>
        <div className="mt-3 rounded-[12px] border border-line bg-[rgba(255,255,255,0.03)] px-3 py-2 font-mono">
          <Row k="program" v={`TxOracle · ${shortHex(TXORACLE_DEVNET, 4)}`} />
          <Row k="instruction" v="validate_stat" />
          <Row k="target_ts" v={String(proof.targetTs)} />
          <Row k="summary root" v={shortHex(proof.rootHex, 8)} />
          <Row k="leaf" v={proof.leafHex ? shortHex(proof.leafHex, 8) : "—"} />
          <Row k="fixture proof" v={`${proof.fixtureProofDepth} nodes`} mono={false} />
          <Row k="main-tree proof" v={`${proof.mainTreeProofDepth} nodes`} mono={false} />
        </div>
      </div>
    </div>
  );
}
