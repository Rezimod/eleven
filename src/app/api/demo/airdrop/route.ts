import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";

/**
 * DEMO top-up — DEVNET ONLY. Tops a player's balance up to the guaranteed
 * $50.00 demo balance (0.5 devnet SOL at the fixed internal $100/SOL rate),
 * so every new account can play instantly and "Top up to $50" is one tap.
 *
 * RELIABILITY: the public devnet faucet rate-limits hard, so the PRIMARY
 * path is a pre-funded faucet keypair (DEMO_FAUCET_SECRET, a JSON secret-key
 * array — generate one, fund it with devnet SOL, keep it out of git). The
 * public `requestAirdrop` is only the fallback when no keypair is set.
 */

const RPC_URL = process.env.SOLANA_RPC ?? process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com";
/** $50.00 at the fixed demo rate of $100/SOL. Mirrors TARGET_DEMO_LAMPORTS. */
const TARGET_LAMPORTS = 500_000_000;

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
  if (deficit <= 0) {
    return Response.json({ ok: true, method: "already-funded", lamports: 0, balance });
  }

  // ── primary: the pre-funded faucet keypair (reliable, no rate limits) ──────
  const secret = process.env.DEMO_FAUCET_SECRET;
  if (secret) {
    try {
      const faucet = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(secret)));
      const tx = new Transaction().add(
        SystemProgram.transfer({ fromPubkey: faucet.publicKey, toPubkey: address, lamports: deficit }),
      );
      const signature = await sendAndConfirmTransaction(conn, tx, [faucet], { commitment: "confirmed" });
      return Response.json({ ok: true, method: "faucet-keypair", lamports: deficit, signature });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // A drained faucet still falls through to the public airdrop below.
      console.error(`demo faucet keypair transfer failed (${msg}); falling back to public airdrop`);
    }
  } else {
    console.warn(
      "DEMO_FAUCET_SECRET is not set — falling back to the rate-limited public devnet airdrop. " +
        "Generate a keypair (solana-keygen new), fund it with devnet SOL, and set DEMO_FAUCET_SECRET " +
        "to its JSON secret-key array for reliable demo funding.",
    );
  }

  // ── fallback: the public devnet faucet (rate-limited) ──────────────────────
  try {
    const signature = await conn.requestAirdrop(address, deficit);
    const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
    await conn.confirmTransaction({ signature, blockhash, lastValidBlockHeight }, "confirmed");
    return Response.json({ ok: true, method: "airdrop", lamports: deficit, signature });
  } catch {
    return new Response("demo top-up unavailable right now — try again in a minute", { status: 503 });
  }
}
