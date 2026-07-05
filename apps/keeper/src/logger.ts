/** Minimal structured JSON-lines logger (one object per line, machine-parseable). */

export type Level = "info" | "warn" | "error";

export interface Logger {
  log(level: Level, msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function makeLogger(
  bindings: Record<string, unknown> = {},
  sink: (line: string) => void = (l) => process.stdout.write(l + "\n"),
): Logger {
  const log = (level: Level, msg: string, fields: Record<string, unknown> = {}) => {
    sink(JSON.stringify({ ts: new Date().toISOString(), level, msg, ...bindings, ...fields }));
  };
  return {
    log,
    info: (m, f) => log("info", m, f),
    warn: (m, f) => log("warn", m, f),
    error: (m, f) => log("error", m, f),
    child: (extra) => makeLogger({ ...bindings, ...extra }, sink),
  };
}

/** A logger that drops everything — used in tests. */
export const silentLogger: Logger = makeLogger({}, () => {});
