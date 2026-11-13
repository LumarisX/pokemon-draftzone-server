import { DashboardTeam, orderTeams, upNextFrom } from "./dashboard.domain";

const NOW = new Date("2026-11-12T12:00:00Z").getTime();
const HOUR = 60 * 60 * 1000;

function at(offsetHours: number): string {
  return new Date(NOW + offsetHours * HOUR).toISOString();
}

function team(overrides: Partial<DashboardTeam> = {}): DashboardTeam {
  return {
    id: "hosted:1",
    kind: "hosted",
    teamName: "The Team",
    logo: null,
    leagueName: "PDBL",
    tournamentName: "Season 4",
    format: "Singles",
    ruleset: "Gen9 NatDex",
    pokemon: [],
    phase: "season",
    record: null,
    form: [],
    standing: null,
    next: null,
    draft: null,
    startsAt: null,
    hosted: null,
    external: null,
    ...overrides,
  };
}

function next(when: string | null) {
  return {
    round: "Round 3",
    when,
    exactTime: !!when,
    matchupSlug: "m3",
    matchupId: null,
    opponent: null,
  };
}

function draft(onClock: boolean, deadline: string | null = null) {
  return {
    picksMade: 2,
    rosterSize: 10,
    onClock,
    round: 3,
    pick: 4,
    deadline,
  };
}

describe("upNextFrom", () => {
  it("puts a pick on the clock ahead of a sooner match", () => {
    const items = upNextFrom(
      [
        team({ id: "a", next: next(at(2)) }),
        team({ id: "b", phase: "drafting", draft: draft(true, at(10)) }),
      ],
      NOW,
    );

    expect(items).toEqual([
      { kind: "pick", teamId: "b", when: at(10) },
      { kind: "match", teamId: "a", when: at(2) },
    ]);
  });

  it("includes matches in the next three days and leaves later ones out", () => {
    const items = upNextFrom(
      [
        team({ id: "soon", next: next(at(71)) }),
        team({ id: "later", next: next(at(73)) }),
        team({ id: "unscheduled", next: next(null) }),
      ],
      NOW,
    );

    expect(items.map((item) => item.teamId)).toEqual(["soon"]);
  });

  it("keeps a match that started within the last hour", () => {
    const items = upNextFrom(
      [
        team({ id: "running", next: next(at(-0.5)) }),
        team({ id: "stale", next: next(at(-2)) }),
      ],
      NOW,
    );

    expect(items.map((item) => item.teamId)).toEqual(["running"]);
  });

  it("announces a draft starting within a week only before it starts", () => {
    const items = upNextFrom(
      [
        team({ id: "week", phase: "upcoming", startsAt: at(100) }),
        team({ id: "far", phase: "upcoming", startsAt: at(200) }),
        team({ id: "started", phase: "season", startsAt: at(100) }),
      ],
      NOW,
    );

    expect(items).toEqual([{ kind: "draftStart", teamId: "week", when: at(100) }]);
  });
});

describe("orderTeams", () => {
  it("orders drafting, then in season, then upcoming, soonest first within each", () => {
    const ordered = orderTeams([
      team({ id: "upcoming", phase: "upcoming", startsAt: at(48) }),
      team({ id: "late-match", next: next(at(90)) }),
      team({ id: "early-match", next: next(at(5)) }),
      team({ id: "waiting", phase: "drafting", draft: draft(false) }),
      team({ id: "on-clock", phase: "drafting", draft: draft(true) }),
    ]);

    expect(ordered.map((entry) => entry.id)).toEqual([
      "on-clock",
      "waiting",
      "early-match",
      "late-match",
      "upcoming",
    ]);
  });
});
