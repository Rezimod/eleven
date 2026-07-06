import type {
  MatchClock,
  MatchEvent,
  MatchEventKind,
  MatchFeed,
  MatchStats,
  MatchSummary,
  Score,
  Team,
} from "./types";

/**
 * SimulatedFeed — replays a scripted ~5-minute World Cup match so the entire app
 * is demoable with NO TxLINE token. Same interface as the live feed, so nothing
 * downstream changes. This is the path we demo/record on until the token lands.
 */

interface ScriptStep {
  t: number; // seconds from kickoff (real time, before speed factor)
  kind: MatchEventKind;
  team?: Team;
  card?: "yellow" | "red";
  goalType?: string;
}

// One canonical, well-paced timeline. Goals ~every 45s so "next goal" rounds
// resolve live on camera. Final score 3–3.
const SCRIPT: ScriptStep[] = [
  { t: 8, kind: "corner", team: "home" },
  { t: 22, kind: "goal", team: "home", goalType: "Shot" },
  { t: 40, kind: "card", team: "away", card: "yellow" },
  { t: 58, kind: "corner", team: "away" },
  { t: 74, kind: "goal", team: "away", goalType: "Header" },
  { t: 96, kind: "corner", team: "home" },
  { t: 118, kind: "goal", team: "home", goalType: "Shot" },
  { t: 140, kind: "card", team: "away", card: "red" },
  { t: 166, kind: "corner", team: "home" },
  { t: 188, kind: "goal", team: "away", goalType: "Penalty" },
  { t: 212, kind: "corner", team: "away" },
  { t: 236, kind: "goal", team: "home", goalType: "Header" },
  { t: 262, kind: "corner", team: "home" },
  { t: 286, kind: "goal", team: "away", goalType: "Shot" },
  { t: 300, kind: "fulltime" },
];

const MATCH_SECONDS = 300;

interface SimMatch {
  fixtureId: number;
  competition: string;
  home: string;
  away: string;
  homeShort: string;
  awayShort: string;
  homeScorers: string[];
  awayScorers: string[];
}

const MATCHES: SimMatch[] = [
  {
    fixtureId: 900101,
    competition: "World Cup · Round of 16",
    home: "Brazil",
    away: "Argentina",
    homeShort: "BRA",
    awayShort: "ARG",
    homeScorers: ["Rodrygo", "Vinícius Jr", "Endrick"],
    awayScorers: ["J. Álvarez", "L. Martínez", "Messi"],
  },
  {
    fixtureId: 900102,
    competition: "World Cup · Round of 16",
    home: "France",
    away: "Portugal",
    homeShort: "FRA",
    awayShort: "POR",
    homeScorers: ["Mbappé", "Thuram", "Dembélé"],
    awayScorers: ["R. Leão", "B. Fernandes", "Ronaldo"],
  },
  {
    fixtureId: 900103,
    competition: "World Cup · Round of 16",
    home: "Spain",
    away: "Netherlands",
    homeShort: "ESP",
    awayShort: "NED",
    homeScorers: ["Yamal", "Morata", "Olmo"],
    awayScorers: ["Gakpo", "Depay", "Simons"],
  },
];

function speed(): number {
  const s = Number(process.env.NEXT_PUBLIC_SIM_SPEED ?? "1");
  return Number.isFinite(s) && s > 0 ? s : 1;
}

function minuteAt(sec: number): number {
  return Math.min(90, Math.floor((sec / MATCH_SECONDS) * 90));
}

function clockAt(sec: number): MatchClock {
  const minute = minuteAt(sec);
  const running = sec < MATCH_SECONDS;
  const period = sec >= MATCH_SECONDS ? "FT" : minute < 45 ? "1H" : "2H";
  return { minute, period, running };
}

export class SimulatedFeed implements MatchFeed {
  readonly kind = "sim" as const;

  private match(fixtureId: number): SimMatch | undefined {
    return MATCHES.find((m) => m.fixtureId === fixtureId);
  }

  async listMatches(): Promise<MatchSummary[]> {
    return MATCHES.map((m, i) => ({
      fixtureId: m.fixtureId,
      competition: m.competition,
      home: m.home,
      away: m.away,
      homeShort: m.homeShort,
      awayShort: m.awayShort,
      status: i === 0 ? "live" : "upcoming",
      score: { home: 0, away: 0 },
      minute: 0,
      kickoffLabel: i === 0 ? "LIVE" : "Kicks off now",
    }));
  }

  async getMatch(fixtureId: number): Promise<MatchSummary | null> {
    const m = this.match(fixtureId);
    if (!m) return null;
    return {
      fixtureId: m.fixtureId,
      competition: m.competition,
      home: m.home,
      away: m.away,
      homeShort: m.homeShort,
      awayShort: m.awayShort,
      status: "live",
      score: { home: 0, away: 0 },
      minute: 0,
      kickoffLabel: "LIVE",
    };
  }

  subscribe(fixtureId: number, onEvent: (e: MatchEvent) => void): () => void {
    // The sim always replays a scripted match; `opts.replay` is a no-op here.
    const m = this.match(fixtureId);
    if (!m) return () => {};

    const factor = 1 / speed();
    const score: Score = { home: 0, away: 0 };
    let seq = 0;
    let goalCount = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Synthesized context stats (display-only + trigger-only). Real feed pulls
    // these from TxLINE; here we derive plausible pressure signals so the live
    // market generator is demoable with no token.
    const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
    const stats: MatchStats = {
      shots: 0,
      shotsOnTarget: 0,
      possessionHome: 50,
      attacks: 0,
      dangerousAttacks: 0,
      momentum: 0,
    };
    const nudge = (team: Team | undefined, m: number) => {
      if (team === "home") stats.momentum += m;
      else if (team === "away") stats.momentum -= m;
      stats.momentum = clamp(stats.momentum, -100, 100);
      stats.possessionHome = clamp(50 + Math.round(stats.momentum / 4), 5, 95);
    };

    const emit = (
      kind: MatchEventKind,
      sec: number,
      extra: Partial<MatchEvent> = {},
    ) => {
      onEvent({
        id: `${fixtureId}-${kind}-${sec}-${seq++}`,
        kind,
        ts: Date.now(),
        fixtureId,
        minute: minuteAt(sec),
        clock: clockAt(sec),
        score: { ...score },
        stats: { ...stats },
        ...extra,
      });
    };

    // Kickoff immediately.
    emit("kickoff", 0);

    // Clock tick every match-second (scaled by speed).
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - start) / (1000 * factor));
      if (elapsed > MATCH_SECONDS) return;
      // Momentum decays toward neutral between events; open play adds attacks.
      stats.momentum = Math.trunc(stats.momentum * 0.9);
      stats.attacks += 1;
      stats.possessionHome = clamp(50 + Math.round(stats.momentum / 4), 5, 95);
      emit("clock", Math.min(elapsed, MATCH_SECONDS));
    }, 1000 * factor);

    for (const step of SCRIPT) {
      const timer = setTimeout(() => {
        if (step.kind === "goal" && step.team) {
          score[step.team] += 1;
          const scorers = step.team === "home" ? m.homeScorers : m.awayScorers;
          const scorer = scorers[goalCount % scorers.length] ?? "Unknown";
          goalCount += 1;
          stats.shots += 2;
          stats.shotsOnTarget += 2; // SoT spike → the "goal in next N" template
          stats.dangerousAttacks += 2;
          nudge(step.team, 25);
          emit("goal", step.t, { team: step.team, goalType: step.goalType, scorer });
        } else if (step.kind === "fulltime") {
          emit("fulltime", step.t);
          clearInterval(interval);
        } else if (step.kind === "corner") {
          stats.shots += 1;
          stats.attacks += 3;
          stats.dangerousAttacks += 2; // pressure signal
          nudge(step.team, 14);
          emit(step.kind, step.t, { team: step.team });
        } else if (step.kind === "card") {
          stats.dangerousAttacks += 1;
          nudge(step.team === "home" ? "away" : "home", 10); // tilts to the other side
          emit(step.kind, step.t, { team: step.team, card: step.card });
        } else {
          emit(step.kind, step.t, { team: step.team, card: step.card });
        }
      }, step.t * 1000 * factor);
      timers.push(timer);
    }

    return () => {
      clearInterval(interval);
      timers.forEach(clearTimeout);
    };
  }
}
