/**
 * Presentation-only brand primitives. No data logic — everything here is derived
 * from props the feed already provides (short team codes, live minute, feed mode).
 */

/** ELEVEN wordmark — Anton display, the middle V rendered in lime. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`display tracking-[0.02em] ${className}`}>
      ELE<span className="text-lime">V</span>EN
    </span>
  );
}

/** Red pulsing dot + "LIVE · {min}'" — the live state signature. */
export function LivePill({ minute }: { minute: number }) {
  return (
    <span className="pill pill-live">
      <span className="livedot inline-block h-1.5 w-1.5 rounded-full bg-red" />
      LIVE · <span className="num">{minute}</span>&apos;
    </span>
  );
}

export function FeedChip({ mode }: { mode: "sim" | "live" }) {
  return (
    <span className={`pill ${mode === "live" ? "pill-lime" : "text-muted"}`}>
      {mode === "live" ? "LIVE FEED" : "SIM FEED"}
    </span>
  );
}

/* ── flags ────────────────────────────────────────────────────────────────── */
// FIFA 3-letter code → ISO 3166-1 alpha-2, for the regional-indicator emoji flag.
const FIFA_TO_ISO: Record<string, string> = {
  BRA: "BR", ARG: "AR", FRA: "FR", POR: "PT", ESP: "ES", NED: "NL",
  GER: "DE", ITA: "IT", ENG: "GB", USA: "US", MEX: "MX", CAN: "CA",
  JPN: "JP", KOR: "KR", CRO: "HR", BEL: "BE", URU: "UY", COL: "CO",
  SUI: "CH", SEN: "SN", MAR: "MA", GHA: "GH", CMR: "CM", POL: "PL",
  DEN: "DK", SRB: "RS", SWE: "SE", NOR: "NO", AUS: "AU", QAT: "QA",
  SAU: "SA", IRN: "IR", ECU: "EC", CRC: "CR", TUN: "TN", NGA: "NG",
  EGY: "EG", ALG: "DZ", CHI: "CL", PER: "PE", PAR: "PY", AUT: "AT",
};

function isoToEmoji(iso: string): string {
  return iso
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

/**
 * Team flag. Uses the emoji flag when the code maps to a known nation; otherwise
 * falls back to the short code in a bordered tile so the layout never breaks.
 */
export function TeamFlag({ short, size = 34 }: { short: string; size?: number }) {
  const iso = FIFA_TO_ISO[short?.toUpperCase()];
  if (iso) {
    return (
      <span aria-label={short} style={{ fontSize: size, lineHeight: 1 }}>
        {isoToEmoji(iso)}
      </span>
    );
  }
  return (
    <span
      className="num inline-flex items-center justify-center rounded-lg border border-line bg-panel2 font-bold text-text"
      style={{ width: size, height: size, fontSize: size * 0.34 }}
    >
      {short}
    </span>
  );
}
