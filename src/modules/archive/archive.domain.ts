import { getRuleset } from "@core/data/rulesets/rulesets";
import { PokemonEntity } from "@modules/draft-pokemon/draft-pokemon.schema";
import { ExternalMatchupDocument } from "@modules/matchup/sub-modules/external-matchup/external-matchup.schema";
import { ID, toID } from "@pkmn/data";

export class Stat {
  indirect?: number;
  kills?: number;
  deaths?: number;
  brought?: number;

  constructor(
    props: {
      indirect?: number;
      kills?: number;
      deaths?: number;
      brought?: number;
    } = {},
  ) {
    this.indirect = props.indirect;
    this.kills = props.kills;
    this.deaths = props.deaths;
    this.brought = props.brought;
  }
}

export type ArchivePokemonStat = {
  pokemon: { id: ID; name: string };
  kills: number;
  brought: number;
  indirect: number;
  deaths: number;
  kdr: number;
  kpg: number;
};

export type ArchiveStats = { pokemon: ArchivePokemonStat[] };

function toStatRow(pid: string, stat: Stat): ArchivePokemonStat {
  const kills = stat.kills ?? 0;
  const brought = stat.brought ?? 0;
  const indirect = stat.indirect ?? 0;
  const deaths = stat.deaths ?? 0;
  return {
    pokemon: {
      id: toID(pid),
      name: getRuleset("Gen9 NatDex").species.get(pid)?.name ?? "",
    },
    kills,
    brought,
    indirect,
    deaths,
    kdr: kills + indirect - deaths,
    kpg: brought > 0 ? (kills + indirect) / brought : 0,
  };
}

function tuplesToStatMap(
  tuples: [
    string,
    { indirect?: number; kills?: number; deaths?: number; brought?: number },
  ][],
): Map<string, Stat> {
  return new Map(tuples.map(([pid, stat]) => [pid, new Stat(stat)]));
}

export class ArchiveMatchV1 {
  winner?: "a" | "b";
  teamName?: string;
  stage: string;
  stats: Map<string, Stat>;
  score: [number, number];
  replay?: string;

  constructor(props: {
    winner?: "a" | "b";
    teamName?: string;
    stage: string;
    stats: Map<string, Stat>;
    score: [number, number];
    replay?: string;
  }) {
    this.winner = props.winner;
    this.teamName = props.teamName;
    this.stage = props.stage;
    this.stats = props.stats;
    this.score = props.score;
    this.replay = props.replay;
  }
}

export class ArchiveMatchTeamV2 {
  stats: Map<string, Stat>;
  score: number;

  constructor(props: { stats: Map<string, Stat>; score: number }) {
    this.stats = props.stats;
    this.score = props.score;
  }
}

export class ArchiveMatchV2 {
  aTeam: ArchiveMatchTeamV2;
  bTeam: ArchiveMatchTeamV2;
  replay?: string;
  winner?: "a" | "b";

  constructor(props: {
    aTeam: ArchiveMatchTeamV2;
    bTeam: ArchiveMatchTeamV2;
    replay?: string;
    winner?: "a" | "b";
  }) {
    this.aTeam = props.aTeam;
    this.bTeam = props.bTeam;
    this.replay = props.replay;
    this.winner = props.winner;
  }
}

export class ArchiveMatchupStatsTeam {
  wins: number;
  stats: Map<string, Stat>;
  differential: number;

  constructor(props: {
    wins: number;
    stats: Map<string, Stat>;
    differential: number;
  }) {
    this.wins = props.wins;
    this.stats = props.stats;
    this.differential = props.differential;
  }
}

export class ArchiveMatchupStats {
  winner?: "a" | "b";
  aTeam: ArchiveMatchupStatsTeam;
  bTeam: ArchiveMatchupStatsTeam;

  constructor(props: {
    winner?: "a" | "b";
    aTeam: ArchiveMatchupStatsTeam;
    bTeam: ArchiveMatchupStatsTeam;
  }) {
    this.winner = props.winner;
    this.aTeam = props.aTeam;
    this.bTeam = props.bTeam;
  }
}

/** Sums kills/indirect, counts brought/deaths as occurred-this-match (0 or 1), across a matchup's games. */
function accumulateTeamStats(
  matches: ArchiveMatchV2[],
  team: "aTeam" | "bTeam",
): ArchiveMatchupStatsTeam {
  const pokemonMap = new Map<string, Stat>();
  let wins = 0;
  let differential = 0;

  for (const match of matches) {
    for (const [pid, stat] of match[team].stats.entries()) {
      const existing = pokemonMap.get(pid);
      pokemonMap.set(
        pid,
        new Stat({
          brought: (existing?.brought ?? 0) + (stat.brought ? 1 : 0),
          kills: (existing?.kills ?? 0) + (stat.kills ?? 0),
          deaths: (existing?.deaths ?? 0) + (stat.deaths ? 1 : 0),
          indirect: (existing?.indirect ?? 0) + (stat.indirect ?? 0),
        }),
      );
    }

    if (
      (match.winner === "a" && team === "aTeam") ||
      (match.winner === "b" && team === "bTeam")
    ) {
      wins++;
    }
    differential += match[team].score;
  }

  return new ArchiveMatchupStatsTeam({ wins, stats: pokemonMap, differential });
}

function computeMatchupStats(matches: ArchiveMatchV2[]): ArchiveMatchupStats {
  if (matches.length === 0) {
    return new ArchiveMatchupStats({
      winner: undefined,
      aTeam: new ArchiveMatchupStatsTeam({
        wins: 0,
        stats: new Map(),
        differential: 0,
      }),
      bTeam: new ArchiveMatchupStatsTeam({
        wins: 0,
        stats: new Map(),
        differential: 0,
      }),
    });
  }

  const wins = matches.reduce(
    (acc, match) => {
      if (match.winner === "a") acc[0]++;
      else if (match.winner === "b") acc[1]++;
      return acc;
    },
    [0, 0] as [number, number],
  );

  let winner: "a" | "b" | undefined;
  if (wins[0] > wins[1]) winner = "a";
  else if (wins[1] > wins[0]) winner = "b";

  return new ArchiveMatchupStats({
    winner,
    aTeam: accumulateTeamStats(matches, "aTeam"),
    bTeam: accumulateTeamStats(matches, "bTeam"),
  });
}

export class ArchiveMatchupV2 {
  teamName?: string;
  coach?: string;
  team: PokemonEntity[];
  paste?: string;
  pastes: { aTeam?: string; bTeam?: string };
  stage: string;
  matches: ArchiveMatchV2[];
  stats: ArchiveMatchupStats;

  constructor(props: {
    teamName?: string;
    coach?: string;
    team: PokemonEntity[];
    paste?: string;
    pastes: { aTeam?: string; bTeam?: string };
    stage: string;
    matches: ArchiveMatchV2[];
    stats: ArchiveMatchupStats;
  }) {
    this.teamName = props.teamName;
    this.coach = props.coach;
    this.team = props.team;
    this.paste = props.paste;
    this.pastes = props.pastes;
    this.stage = props.stage;
    this.matches = props.matches;
    this.stats = props.stats;
  }

  /** Ports the per-matchup aggregation that used to live in classes/archive.ts's matchupStats/teamStats helpers. */
  static fromMatchup(matchup: ExternalMatchupDocument): ArchiveMatchupV2 {
    const normalizeWinner = (winner?: string): "a" | "b" | undefined =>
      winner === "a" || winner === "b" ? winner : undefined;

    const matches = matchup.matches.map(
      (match) =>
        new ArchiveMatchV2({
          aTeam: new ArchiveMatchTeamV2({
            stats: tuplesToStatMap(match.aTeam.stats),
            score: match.aTeam.score,
          }),
          bTeam: new ArchiveMatchTeamV2({
            stats: tuplesToStatMap(match.bTeam.stats),
            score: match.bTeam.score,
          }),
          replay: match.replay,
          winner: normalizeWinner(match.winner),
        }),
    );

    return new ArchiveMatchupV2({
      teamName: matchup.bTeam.teamName,
      coach: matchup.bTeam.coach,
      team: matchup.bTeam.team,
      pastes: { aTeam: matchup.aTeam.paste, bTeam: matchup.bTeam.paste },
      stage: matchup.stage,
      matches,
      stats: computeMatchupStats(matches),
    });
  }
}

export class ArchiveScore {
  wins: number;
  losses: number;
  diff: string;

  constructor(props: { wins: number; losses: number; diff: string }) {
    this.wins = props.wins;
    this.losses = props.losses;
    this.diff = props.diff;
  }
}

function computeLeagueStats(matchups: ArchiveMatchupV2[]): Map<string, Stat> {
  const stats = new Map<string, Stat>();
  for (const matchup of matchups) {
    for (const [pid, stat] of matchup.stats.aTeam.stats.entries()) {
      const existing = stats.get(pid);
      stats.set(
        pid,
        new Stat({
          brought: (existing?.brought ?? 0) + (stat.brought ?? 0),
          kills: (existing?.kills ?? 0) + (stat.kills ?? 0),
          deaths: (existing?.deaths ?? 0) + (stat.deaths ?? 0),
          indirect: (existing?.indirect ?? 0) + (stat.indirect ?? 0),
        }),
      );
    }
  }
  return stats;
}

function computeLeagueScore(matchups: ArchiveMatchupV2[]): ArchiveScore {
  let wins = 0;
  let losses = 0;
  let diff = 0;
  for (const matchup of matchups) {
    if (matchup.stats.winner === "a") wins++;
    else if (matchup.stats.winner === "b") losses++;
    diff += matchup.stats.aTeam.differential - matchup.stats.bTeam.differential;
  }
  return new ArchiveScore({ wins, losses, diff: diff.toString() });
}

export type ArchiveIdentity = {
  id?: string;
  leagueName: string;
  teamName: string;
  owner: string;
  format: string;
  ruleset: string;
  team: string[];
  createdAt?: Date;
  updatedAt?: Date;
};

export class ArchiveV1 {
  readonly archiveType = "ArchiveV1" as const;
  id?: string;
  leagueName: string;
  teamName: string;
  owner: string;
  format: string;
  ruleset: string;
  team: string[];
  matches: ArchiveMatchV1[];
  createdAt?: Date;
  updatedAt?: Date;

  constructor(props: ArchiveIdentity & { matches: ArchiveMatchV1[] }) {
    this.id = props.id;
    this.leagueName = props.leagueName;
    this.teamName = props.teamName;
    this.owner = props.owner;
    this.format = props.format;
    this.ruleset = props.ruleset;
    this.team = props.team;
    this.matches = props.matches;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  computeStats(): ArchiveStats {
    const totals = new Map<string, Stat>();
    for (const match of this.matches) {
      for (const [pid, stat] of match.stats.entries()) {
        const existing = totals.get(pid);
        totals.set(
          pid,
          new Stat({
            kills: (existing?.kills ?? 0) + (stat.kills ?? 0),
            brought: (existing?.brought ?? 0) + (stat.brought ?? 0),
            indirect: (existing?.indirect ?? 0) + (stat.indirect ?? 0),
            deaths: (existing?.deaths ?? 0) + (stat.deaths ?? 0),
          }),
        );
      }
    }
    return {
      pokemon: Array.from(totals.entries()).map(([pid, stat]) =>
        toStatRow(pid, stat),
      ),
    };
  }
}

export class ArchiveV2 {
  readonly archiveType = "ArchiveV2" as const;
  id?: string;
  leagueName: string;
  teamName: string;
  owner: string;
  format: string;
  ruleset: string;
  team: string[];
  leagueId: string;
  doc?: string;
  matchups: ArchiveMatchupV2[];
  stats: Map<string, Stat>;
  score: ArchiveScore;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(
    props: ArchiveIdentity & {
      leagueId: string;
      doc?: string;
      matchups: ArchiveMatchupV2[];
      stats: Map<string, Stat>;
      score: ArchiveScore;
    },
  ) {
    this.id = props.id;
    this.leagueName = props.leagueName;
    this.teamName = props.teamName;
    this.owner = props.owner;
    this.format = props.format;
    this.ruleset = props.ruleset;
    this.team = props.team;
    this.leagueId = props.leagueId;
    this.doc = props.doc;
    this.matchups = props.matchups;
    this.stats = props.stats;
    this.score = props.score;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  computeStats(): ArchiveStats {
    return {
      pokemon: Array.from(this.stats.entries()).map(([pid, stat]) =>
        toStatRow(pid, stat),
      ),
    };
  }
}

export type Archive = ArchiveV1 | ArchiveV2;
