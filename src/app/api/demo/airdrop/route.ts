import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

/**
 * DEMO funding faucet — DEVNET ONLY. Tops a player's embedded wallet up with
 * demo devnet SOL so they can pay room buy-ins. Refuses anything that smells
 * like mainnet, caps the target balance, and fixes the amount server-side.
 *
 * Primary path: the public devnet faucet (`requestAirdrop`). Fallback (the
 * faucet rate-limits hard): a funded devnet keypair in DEMO_FAUCET_SECRET
 * (JSON secret-key array) transfers a smaller amount.
 */

const RPC_URL = process.env.SOLANA_RPC ?? process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
const AIRDROP_LAMPORTS = 1 * LAMPORTS_PER_SOL;
const FAUCET_FALLBACK_LAMPORTS = 0.3 * LAMPORTS_PER_SOL;
/** No more demo SOL for wallets already holding at least this. */
const MAX_FUNDED_LAMPORTS = 2 * LAMPORTS_PER_SOL;

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
  if (balance >= MAX_FUNDED_LAMPORTS) {
    return Response.json({ ok: true, method: "already-funded", lamports: 0, balance });
  }

  try {
    const signature = await conn.requestAirdrop(address, AIRDROP_LAMPORTS);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return Response.json({ ok: true, method: "airdrop", lamports: AIRDROP_LAMPORTS, signature });
  } catch {
    /* devnet faucet rate-limited — try the local faucet keypair below */
  }

  const secret = process.env.DEMO_FAUCET_SECRET;
  if (!secret) {
    return new Response(
      "devnet faucet rate-limited and no DEMO_FAUCET_SECRET fallback configured — try again in a minute",
      { status: 503 },
    );
  }
  try {
    const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: address, lamports: FAUCET_FALLBACK_LAMPORTS }),
    );
    const signature = await sendAndConfirmTransaction(conn, tx, [faucet], { commitment: "confirmed" });
    return Response.json({ ok: true, method: "faucet-keypair", lamports: FAUCET_FALLBACK_LAMPORTS, signature });
  } catch (e) {
    return new Response(`faucet fallback failed: ${e instanceof Error ? e.message : String(e)}`, { status: 502 });
  }
}
