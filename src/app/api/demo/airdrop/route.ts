import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

/**
 * DEMO grant — DEVNET ONLY. Grants each guest the $15.00 landing balance
 * (0.15 devnet SOL at the fixed internal $100/SOL rate) — ONCE PER IP.
 *
 * ANTI-FARM: granted IPs are recorded in a persistent store (Upstash Redis /
 * Vercel KV via REST, creds from env). A returning or storage-cleared client
 * on a granted IP keeps its existing balance — no fresh $15 — so refresh /
 * clear-localStorage farming can't mint stacks of entries and drain rooms.
 *
 * RELIABILITY: funds come from the pre-funded DEMO_FAUCET_SECRET keypair
 * (primary); the rate-limited public airdrop is only a fallback.
 */

const RPC_URL = process.env.SOLANA_RPC ?? process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
/** $15.00 at the fixed demo rate of $100/SOL. Mirrors TARGET_DEMO_LAMPORTS. */
const TARGET_LAMPORTS = 150_000_000;

// ── once-per-IP grant ledger ──────────────────────────────────────────────────

const KV_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

const KV_SETUP_HINT =
  "No persistent grant store configured — falling back to in-memory (resets on every deploy/restart, " +
  "NOT safe against farming in production). Add to the deployment env either an Upstash Redis DB " +
  "(UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN, free at https://console.upstash.com) or Vercel " +
  "KV (KV_REST_API_URL + KV_REST_API_TOKEN, Storage tab of the Vercel project).";

/** Dev fallback only — per-process, so it resets on restart. */
const memoryGrants = new Set<string>();
let warnedNoKv = false;

async function kv(command: string[]): Promise<unknown> {
  const r = await fetch(`${KV_URL}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KV_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  if (!r.ok) throw new Error(`grant store error (HTTP ${r.status})`);
  const body = (await r.json()) as { result?: unknown };
  return body.result;
}

/** Atomically claim the IP's one grant. True = we hold it; false = already granted. */
async function claimGrant(ip: string, address: string): Promise<boolean> {
  const key = `eleven:grant:${ip}`;
  if (KV_URL && KV_TOKEN) {
    return (await kv(["SET", key, address, "NX"])) === "OK";
  }
  if (!warnedNoKv) {
    warnedNoKv = true;
    console.warn(KV_SETUP_HINT);
  }
  if (memoryGrants.has(key)) return false;
  memoryGrants.add(key);
  return true;
}

/** Release a claim whose transfer failed, so the IP can retry. */
async function releaseGrant(ip: string): Promise<void> {
  const key = `eleven:grant:${ip}`;
  if (KV_URL && KV_TOKEN) {
    await kv(["DEL", key]).catch(() => {});
    return;
  }
  memoryGrants.delete(key);
}

function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  return xff?.split(",")[0]?.trim() || "local";
}

// ── the grant ─────────────────────────────────────────────────────────────────

async function sendDeficit(conn: Connection, address: PublicKey, deficit: number): Promise<{ method: string; signature: string }> {
  const secret = process.env.DEMO_FAUCET_SECRET;
  if (secret) {
    try {
      const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: address, lamports: deficit }),
      );
      const signature = await sendAndConfirmTransaction(conn, tx, [faucet], { commitment: "confirmed" });
      return { method: "faucet-keypair", signature };
    } catch (e) {
      console.error(
        `demo faucet keypair transfer failed (${e instanceof Error ? e.message : e}); trying public airdrop`,
      );
    }
  } else {
    console.warn(
      "DEMO_FAUCET_SECRET is not set — falling back to the rate-limited public devnet airdrop. " +
        "Generate a keypair (solana-keygen new), fund it with devnet SOL, and set DEMO_FAUCET_SECRET " +
        "to its JSON secret-key array for reliable demo funding.",
    );
  }
  const signature = await conn.requestAirdrop(address, deficit);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
  return { method: "airdrop", signature };
}

export async function POST(req: Request) {
  if (/mainnet/i.test(RPC_URL)) {
    return new Response("demo faucet is devnet-only", { status: 403 });
  }

  let address: PublicKey;
  try {
    const body = (await req.json()) as { address?: string };
    address = new PublicKey(body.address ?? "");
  } catch {
    return new Response("invalid address", { status: 400 });
  }

  const conn = new Connection(RPC_URL, "confirmed");
  const balance = await conn.getBalance(address);
  const deficit = TARGET_LAMPORTS - balance;
  // Already at (or above) the landing balance — nothing to grant, and the
  // IP's one grant is NOT consumed.
  if (deficit <= 0) {
    return Response.json({ ok: true, method: "already-funded", lamports: 0, balance });
  }

  const ip = clientIp(req);
  if (!(await claimGrant(ip, address.toBase58()))) {
    return new Response("demo grant already claimed on this network — you keep your existing balance", {
      status: 429,
    });
  }

  try {
    const { method, signature } = await sendDeficit(conn, address, deficit);
    return Response.json({ ok: true, method, lamports: deficit, signature });
  } catch {
    await releaseGrant(ip); // transfer failed — let this IP retry later
    return new Response("demo top-up unavailable right now — try again in a minute", { status: 503 });
  }
}
