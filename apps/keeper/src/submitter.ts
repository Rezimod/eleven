import type { Logger } from "./logger.ts";
import type { ProofNode, SettleArgs } from "./proof.ts";
import type { Decision, KeeperConfig, RoomWatch } from "./types.ts";
import type { Submitter } from "./keeper.ts";

/**
 * Dry-run submitter: logs the exact on-chain call it WOULD make and returns a
 * synthetic signature. This is the default (and the demo/sim) target — no keypair,
 * no funds, no deployed program required.
 */
export class LoggingSubmitter implements Submitter {
  private readonly log: Logger;
  constructor(log: Logger) {
    this.log = log;
  }

  async resolveMarket(d: Decision, proof: SettleArgs | null): Promise<string> {
    this.log.info("[dry-run] resolve_market", {
      room: d.room.roomId,
      marketIndex: d.market.index,
      kind: d.kind,
      targetTs: proof?.targetTs ?? null,
      proofNodes: proof ? proof.fixtureProof.length + proof.mainTreeProof.length + proof.statA.statProof.length : 0,
    });
    return `dry-run:resolve:${d.room.roomId}#${d.market.index}`;
  }

  async settleRoom(room: RoomWatch): Promise<string> {
    this.log.info("[dry-run] settle_room", { room: room.roomId, markets: room.markets.length });
    return `dry-run:settle:${room.roomId}`;
  }
}

// ── real Solana submitter ───────────────────────────────────────────────────

const asArray = (b: Uint8Array): number[] => Array.from(b);
const node = (n: ProofNode) => ({ hash: asArray(n.hash), isRightSibling: n.isRightSibling });

/**
 * Builds and sends real `resolve_market` / `settle_room` transactions via Anchor
 * and the generated `eleven` IDL. web3.js + anchor are loaded lazily so the sim
 * / test paths never need them installed. Requires: a deployed program, a funded
 * keeper keypair, and rooms that exist on-chain with revealed predictions.
 */
export async function makeSolanaSubmitter(cfg: KeeperConfig, log: Logger): Promise<Submitter> {
  const anchor = await import("@coral-xyz/anchor");
  const web3 = await import("@solana/web3.js");
  const { readFileSync } = await import("node:fs");
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);

  const idl = require("../idl/eleven.json");
  const conn = new web3.Connection(cfg.rpcUrl!, "confirmed");
  const secret = Uint8Array.from(JSON.parse(readFileSync(cfg.keypairPath!, "utf8")));
  const keypair = web3.Keypair.fromSecretKey(secret);
  const wallet = new anchor.Wallet(keypair);
  const provider = new anchor.AnchorProvider(conn, wallet, { commitment: "confirmed" });
  const program = new anchor.Program(idl, provider);
  const programId = program.programId;
  const BN = anchor.BN;

  const enc = (s: string) => new TextEncoder().encode(s);
  const partPda = (room: any, owner: any) =>
    web3.PublicKey.findProgramAddressSync([enc("participant"), room.toBuffer(), owner.toBuffer()], programId)[0];
  const predPda = (room: any, index: number, owner: any) => {
    const idx = Buffer.alloc(2);
    idx.writeUInt16LE(index);
    return web3.PublicKey.findProgramAddressSync([enc("prediction"), room.toBuffer(), idx, owner.toBuffer()], programId)[0];
  };

  const statTerm = (t: SettleArgs["statA"]) => ({
    statToProve: { key: t.statToProve.key, value: t.statToProve.value, period: t.statToProve.period },
    eventStatRoot: asArray(t.eventStatRoot),
    statProof: t.statProof.map(node),
  });

  return {
    async resolveMarket(d: Decision, proof: SettleArgs | null): Promise<string> {
      const room = new web3.PublicKey(d.room.roomPda!);
      // Every revealed, not-yet-scored prediction for this market + its participant,
      // sorted by owner strictly increasing (the program rejects unsorted/dup).
      const preds = (await program.account.prediction.all([{ memcmp: { offset: 8, bytes: room.toBase58() } }]))
        .map((p: any) => p.account)
        .filter((a: any) => a.marketIndex === d.market.index && a.revealed && !a.scored)
        .sort((a: any, b: any) => a.owner.toBuffer().compare(b.owner.toBuffer()));

      const remaining = preds.flatMap((a: any) => [
        { pubkey: predPda(room, d.market.index, a.owner), isWritable: true, isSigner: false },
        { pubkey: partPda(room, a.owner), isWritable: true, isSigner: false },
      ]);

      const args = {
        marketIndex: d.market.index,
        kind: d.kind === "ProveYes" ? { proveYes: {} } : { timeoutNo: {} },
        targetTs: new BN(proof?.targetTs ?? d.targetTs),
        fixtureSummary: proof
          ? {
              fixtureId: new BN(proof.fixtureSummary.fixtureId),
              updateStats: {
                updateCount: proof.fixtureSummary.updateStats.updateCount,
                minTimestamp: new BN(proof.fixtureSummary.updateStats.minTimestamp),
                maxTimestamp: new BN(proof.fixtureSummary.updateStats.maxTimestamp),
              },
              eventsSubTreeRoot: asArray(proof.fixtureSummary.eventStatsSubTreeRoot),
            }
          : { fixtureId: new BN(d.room.fixtureId), updateStats: { updateCount: 0, minTimestamp: new BN(0), maxTimestamp: new BN(0) }, eventsSubTreeRoot: asArray(new Uint8Array(32)) },
        fixtureProof: proof ? proof.fixtureProof.map(node) : [],
        mainTreeProof: proof ? proof.mainTreeProof.map(node) : [],
        statA: proof
          ? statTerm(proof.statA)
          : { statToProve: { key: 0, value: 0, period: 0 }, eventStatRoot: asArray(new Uint8Array(32)), statProof: [] },
        statB: proof?.statB ? statTerm(proof.statB) : null,
        op: null,
      };

      const sig = await program.methods
        .resolveMarket(args)
        .accounts({
          settler: keypair.publicKey,
          room,
          txlineOracle: new web3.PublicKey(cfg.oracleProgramId!),
          dailyScoresRoots: new web3.PublicKey(cfg.dailyScoresRoots!),
        })
        .remainingAccounts(remaining)
        .rpc();
      log.info("submitted resolve_market", { room: d.room.roomId, market: d.market.index, sig });
      return sig;
    },

    async settleRoom(room: RoomWatch): Promise<string> {
      const roomPk = new web3.PublicKey(room.roomPda!);
      const parts = (await program.account.participant.all([{ memcmp: { offset: 8, bytes: roomPk.toBase58() } }]))
        .map((p: any) => p.account)
        .sort((a: any, b: any) => a.owner.toBuffer().compare(b.owner.toBuffer()));

      const remaining = parts.flatMap((a: any) => [
        { pubkey: partPda(roomPk, a.owner), isWritable: true, isSigner: false },
        { pubkey: a.owner, isWritable: true, isSigner: false },
      ]);

      const sig = await program.methods
        .settleRoom()
        .accounts({ settler: keypair.publicKey, room: roomPk, treasury: new web3.PublicKey(room.treasury!) })
        .remainingAccounts(remaining)
        .rpc();
      log.info("submitted settle_room", { room: room.roomId, players: parts.length, sig });
      return sig;
    },
  };
}
