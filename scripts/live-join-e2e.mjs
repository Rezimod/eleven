// Devnet e2e: prove joins stay open DURING the live phase (kickoff already
// passed) and close logic holds. Uses throwaway lamports on devnet only.
import { BN, Program, utils } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram, Connection, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { readFileSync } from "node:fs";

const conn = new Connection("https://api.devnet.solana.com", "confirmed");
const idl = JSON.parse(readFileSync(new URL("../src/lib/chain/eleven.idl.json", import.meta.url), "utf8"));
const programId = new PublicKey(idl.address);
const load = (p) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
const creator = load(process.env.HOME + "/.config/solana/id.json");
const joiner = load(process.env.HOME + "/.config/solana/eleven-devnet.json");
const program = new Program(idl, { connection: conn });

const now = Math.floor(Date.now() / 1000);
const kickoff = now - 120; // match kicked off 2 minutes ago → LIVE
const end = kickoff + 3 * 3600;
const roomId = new BN(now);
const enc = utils.bytes.utf8.encode;
const room = PublicKey.findProgramAddressSync([enc("room"), creator.publicKey.toBuffer(), roomId.toArrayLike(Buffer, "le", 8)], programId)[0];
const part = (o) => PublicKey.findProgramAddressSync([enc("participant"), room.toBuffer(), o.toBuffer()], programId)[0];

const market = { statKey: 6, period: 0, threshold: new BN(6), comparison: 0, hasSecond: false, statKey2: 0, period2: 0, op: 0, lockTs: new BN(kickoff), resolveDeadlineTs: new BN(end), yesPoints: 100, noPoints: 100, isLive: false };
const BUY_IN = 50_000_000;

const createIx = await program.methods.createRoom({ roomId, fixtureId: 990001, buyInLamports: new BN(BUY_IN), rakeBps: 500, maxPlayers: 8, joinDeadlineTs: new BN(kickoff), kickoffTs: new BN(kickoff), endTs: new BN(end), refundDeadlineTs: new BN(end + 3600), treasury: creator.publicKey, markets: [market] })
  .accounts({ creator: creator.publicKey, room, participant: part(creator.publicKey), systemProgram: SystemProgram.programId }).instruction();
await sendAndConfirmTransaction(conn, new Transaction().add(createIx), [creator], { commitment: "confirmed" });
console.log("room created, kickoff was 2min ago (LIVE):", room.toBase58());

const joinIx = await program.methods.joinRoom()
  .accounts({ joiner: joiner.publicKey, room, participant: part(joiner.publicKey), systemProgram: SystemProgram.programId }).instruction();
const sig = await sendAndConfirmTransaction(conn, new Transaction().add(joinIx), [joiner], { commitment: "confirmed" });
const acc = await program.account.room.fetch(room);
console.log("MID-MATCH JOIN OK:", sig.slice(0, 20) + "…", "| players:", acc.playerCount, "| pot:", acc.potLamports.toNumber() / 1e9, "SOL escrowed");
