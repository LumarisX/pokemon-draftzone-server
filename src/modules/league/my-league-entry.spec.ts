import { EntryMatchup, EntryRound, formFrom, nextMatchFor } from "./my-league-entry";

const id = (value: string) => ({
  toString: () => value,
  equals: (other: unknown) => String(other) === value,
});

const rounds: EntryRound[] = [
  { _id: id("r1"), name: "Week 1" },
  { _id: id("r2"), name: "Week 2", matchDeadline: new Date("2026-10-20T00:00:00Z") },
  { _id: id("r3"), name: "Week 3" },
];

const team = (slug: string) => ({
  _id: id(slug),
  teamName: slug.toUpperCase(),
  slug,
  primaryCoach: { name: `${slug}-coach` },
});

function matchup(
  slug: string,
  round: string,
  opponent: string,
  extra: Partial<EntryMatchup> = {},
): EntryMatchup {
  return {
    slug,
    round: id(round),
    side1: { team: team("me") },
    side2: { team: team(opponent) },
    ...extra,
  };
}

const now = new Date("2026-10-11T12:00:00Z").getTime();
const hours = (count: number) => new Date(now + count * 3600000);

describe("formFrom", () => {
  it("keeps the last five played results and skips unplayed rounds", () => {
    expect(
      formFrom([
        { outcome: "w", score: 2 },
        null,
        { outcome: "l", score: -1 },
        { outcome: "t", score: 0 },
        { outcome: "ff", score: -3 },
        { outcome: "d", score: 0 },
        { outcome: "w", score: 1 },
        { outcome: "w", score: 4 },
      ]),
    ).toEqual(["loss", "loss", "draw", "win", "win"]);
  });
});

describe("nextMatchFor", () => {
  it("prefers the soonest scheduled unplayed match over round order", () => {
    const next = nextMatchFor(
      [
        matchup("m1", "r1", "a", { winner: "side1" }),
        matchup("m2", "r2", "b", { scheduledDate: hours(48) }),
        matchup("m3", "r3", "c", { scheduledDate: hours(20) }),
      ],
      "me",
      rounds,
      now,
    );

    expect(next).toMatchObject({
      round: "Week 3",
      matchupSlug: "m3",
      exactTime: true,
      opponent: { name: "C", coach: "c-coach", teamSlug: "c" },
    });
  });

  it("skips a match more than a day overdue and falls back to round order", () => {
    const next = nextMatchFor(
      [
        matchup("m1", "r1", "a", { scheduledDate: hours(-72) }),
        matchup("m2", "r2", "b"),
        matchup("m3", "r3", "c"),
      ],
      "me",
      rounds,
      now,
    );

    expect(next).toMatchObject({
      matchupSlug: "m2",
      exactTime: false,
      when: "2026-10-20T00:00:00.000Z",
    });
  });

  it("returns null once every match is played", () => {
    expect(
      nextMatchFor([matchup("m1", "r1", "a", { winner: "side2" })], "me", rounds, now),
    ).toBeNull();
  });
});
