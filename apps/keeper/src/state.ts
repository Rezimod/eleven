import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

/**
 * Crash-safe keeper state. Every mutation is flushed to disk with an atomic
 * temp-write + rename, so a crash mid-write can never corrupt the file or lose a
 * committed resolve/settle. On restart the sets guarantee the keeper never
 * double-resolves a market or double-settles a room, and `seq` lets the stream
 * resume from the last processed event (Last-Event-ID).
 */
interface Persisted {
  lastSeq: number;
  resolved: string[]; // `${roomId}#${marketIndex}`
  settled: string[]; // roomId
}

export class KeeperStore {
  private lastSeq = 0;
  private resolved = new Set<string>();
  private settled = new Set<string>();
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    this.load();
  }

  private load() {
    if (!existsSync(this.path)) return;
    try {
      const p = JSON.parse(readFileSync(this.path, "utf8")) as Partial<Persisted>;
      this.lastSeq = p.lastSeq ?? 0;
      this.resolved = new Set(p.resolved ?? []);
      this.settled = new Set(p.settled ?? []);
    } catch {
      // A corrupt file (should be impossible with atomic writes) starts fresh
      // rather than crashing the keeper.
    }
  }

  private flush() {
    const dir = dirname(this.path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const data: Persisted = {
      lastSeq: this.lastSeq,
      resolved: [...this.resolved],
      settled: [...this.settled],
    };
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(data));
    renameSync(tmp, this.path); // atomic on POSIX
  }

  static marketKey(roomId: string, marketIndex: number): string {
    return `${roomId}#${marketIndex}`;
  }

  get seq(): number {
    return this.lastSeq;
  }

  advance(seq: number) {
    if (seq > this.lastSeq) {
      this.lastSeq = seq;
      this.flush();
    }
  }

  isResolved(key: string): boolean {
    return this.resolved.has(key);
  }

  markResolved(key: string) {
    this.resolved.add(key);
    this.flush();
  }

  isSettled(roomId: string): boolean {
    return this.settled.has(roomId);
  }

  markSettled(roomId: string) {
    this.settled.add(roomId);
    this.flush();
  }
}
