import { Connection, PublicKey } from "@solana/web3.js";

/**
 * DEVNET ONLY. ELEVEN's paid rooms run on demo devnet SOL — never mainnet,
 * never real money. The guard below refuses any mainnet-looking RPC outright.
 */
export const RPC_URL = process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
if (/mainnet/i.test(RPC_URL)) {
  throw new Error("ELEVEN is devnet-only (demo money). Refusing a mainnet RPC URL.");
}
export const WS_URL = RPC_URL.replace(/^http/, "ws");

/** CAIP-2 chain id Privy signs against — pinned to devnet, not configurable. */
export const SOLANA_CHAIN = "solana:devnet" as const;

export const ELEVEN_PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_ELEVEN_PROGRAM_ID ?? "2DoTb77aro9SoArLPQMucnCxoTDnvZvZskYtYhSdywRm",
);

/** Rake destination for rooms created from this client (devnet treasury). */
export const TREASURY = new PublicKey(
  process.env.NEXT_PUBLIC_TREASURY ?? "5ufkUNHzdRhGkW2gbiEgrpJfmzvwWoF1aPo4hbZ63mmd",
);

let conn: Connection | null = null;
export function getConnection(): Connection {
  if (!conn) conn = new Connection(RPC_URL, "confirmed");
  return conn;
}

export const LAMPORTS_PER_SOL = 1_000_000_000;
export function fmtSol(lamports: number): string {
  return (lamports / LAMPORTS_PER_SOL).toFixed(2);
}
