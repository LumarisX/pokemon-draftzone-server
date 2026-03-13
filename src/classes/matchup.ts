import { ID, StatsTable, TypeName } from "@pkmn/data";
import { Types } from "mongoose";
import { Format, FormatId, getFormat } from "../data/formats";
import { getRuleset, Ruleset, RulesetId } from "../data/rulesets";
import { MatchData, MatchupData } from "../models/draft/matchup.model";
import { LeagueCoachDocument } from "../models/league/coach.model";
import { LeagueDivisionDocument } from "../models/league/division.model";
import { LeagueMatchupDocument } from "../models/league/matchup.model";
import { LeagueTeamDocument } from "../models/league/team.model";
import { LeagueTournamentDocument } from "../models/league/tournament.model";
import { getDraft } from "../services/database-services/draft.service";
import { getRosterByStage } from "../services/league-services/league-service";
import {
  Coveragechart,
  coveragechart,
} from "../services/matchup-services/coverage.service";
import {
  Movechart,
  movechart,
} from "../services/matchup-services/movechart.service";
import {
  Speedchart,
  speedchart,
} from "../services/matchup-services/speedchart.service";
import { SummaryClass } from "../services/matchup-services/summary.service";
import { Typechart } from "../services/matchup-services/typechart.service";
import { Draft } from "./draft";
import { Opponent } from "./opponent";
import { DraftSpecie, PokemonFormData } from "./pokemon";

export type MatchupTeam = {
  teamName: string;
  team: DraftSpecie[];
  coach?: string;
  paste?: string;
  _id?: Types.ObjectId;
  owner?: string;
  notes?: string;
};

export type PopulatedLeagueMatchup = LeagueMatchupDocument & {
  side1: {
    team: LeagueTeamDocument & { coach: LeagueCoachDocument };
  };
  side2: {
    team: LeagueTeamDocument & { coach: LeagueCoachDocument };
  };
  division: LeagueDivisionDocument & {
    tournament: LeagueTournamentDocument;
  };
};

export class Matchup {
  constructor(
    public aTeam: MatchupTeam,
    public bTeam: MatchupTeam,
    public ruleset: Ruleset,
    public format: Format,
    public leagueName: string,
    public leagueId: string,
    public stage: string,
    public matches: MatchData[],
    public gameTime?: string,
    public reminder?: number,
  ) {}

  static async fromData(
    data: MatchupData & { _id: Types.ObjectId },
    draft?: Draft,
  ): Promise<Matchup> {
    if (!draft) {
      const draftDoc = await getDraft(data.aTeam._id);
      draft = Draft.fromData(draftDoc);
    }
    return new Matchup(
      {
        teamName: draft.teamName,
        _id: data.aTeam._id,
        paste: data.aTeam.paste,
        team: draft.team,
        owner: draft.owner,
        notes: data.notes,
        // coach:
      },
      {
        teamName: data.bTeam.teamName,
        _id: data._id,
        paste: data.bTeam.paste,
        team: DraftSpecie.getTeam(data.bTeam.team, draft.ruleset),
        coach: data.bTeam.coach,
      },
      draft.ruleset,
      draft.format,
      draft.leagueName,
      draft.tournamentId,
      data.stage,
      data.matches,
      data.gameTime,
      data.reminder,
    );
  }

  static fromLeagueMatchup(
    leagueMatchupDoc: PopulatedLeagueMatchup,
    sub?: string,
  ): Matchup {
    const ruleset = getRuleset(leagueMatchupDoc.division.tournament.ruleset);
    let notes: string | undefined = undefined;
    const stageIndex = leagueMatchupDoc.division.stages.findIndex(
      (stage) => stage._id.toString() === leagueMatchupDoc.stage._id.toString(),
    );
    return new Matchup(
      {
        teamName: leagueMatchupDoc.side1.team.coach.teamName,
        coach: leagueMatchupDoc.side1.team.coach.name,
        team: getRosterByStage(
          leagueMatchupDoc.side1.team,
          leagueMatchupDoc.division,
          stageIndex,
        ).map(
          (pokemon) =>
            new DraftSpecie(
              {
                id: pokemon.id as ID,
                capt: pokemon.addons?.includes("Tera Captain")
                  ? {
                      tera: [],
                    }
                  : undefined,
              },
              ruleset,
            ),
        ),
        owner: leagueMatchupDoc.side1.team.coach.auth0Id,
      },
      {
        teamName: leagueMatchupDoc.side2.team.coach.teamName,
        coach: leagueMatchupDoc.side2.team.coach.name,
        team: getRosterByStage(
          leagueMatchupDoc.side2.team,
          leagueMatchupDoc.division,
          stageIndex,
        ).map(
          (pokemon) =>
            new DraftSpecie(
              {
                id: pokemon.id as ID,
                capt: pokemon.addons?.includes("Tera Captain")
                  ? {
                      tera: [],
                    }
                  : undefined,
              },
              ruleset,
            ),
        ),
        owner: leagueMatchupDoc.side2.team.coach.auth0Id,
      },
      ruleset,
      getFormat(leagueMatchupDoc.division.tournament.format),
      leagueMatchupDoc.division.tournament.name,
      leagueMatchupDoc.division.tournament.id.toString(),
      leagueMatchupDoc.division.stages[stageIndex].name ?? "",
      [],
      notes,
    );
  }

  static async fromQuickData(data: {
    format: string;
    ruleset: string;
    side1: {
      team: PokemonFormData[];
      teamName: string;
    };
    side2: {
      team: PokemonFormData[];
      teamName: string;
    };
  }): Promise<Matchup> {
    const ruleset = getRuleset(data.ruleset);
    const format = getFormat(data.format);
    return new Matchup(
      {
        teamName: data.side1.teamName || "Team 1",
        team: DraftSpecie.getTeam(data.side1.team, ruleset),
      },
      {
        teamName: data.side2.teamName || "Team 2",
        team: DraftSpecie.getTeam(data.side2.team, ruleset),
      },
      ruleset,
      format,
      "",
      "",
      "",
      [],
    );
  }

  toData(): MatchupData {
    return {
      aTeam: {
        _id: this.aTeam._id!,
        paste: this.aTeam.paste,
      },
      bTeam: {
        teamName: this.bTeam.teamName,
        coach: this.bTeam.coach ?? undefined,
        paste: this.bTeam.paste,
        team: this.bTeam.team.map((pokemon) => pokemon.toData()),
      },
      stage: this.stage,
      matches: this.matches,
      gameTime: this.gameTime,
      reminder: this.reminder,
    };
  }

  toClient() {
    return {
      _id: this.bTeam._id,
      leagueName: this.leagueName,
      aTeam: {
        team: this.aTeam.team.map((pokemon) => pokemon.toClient()),
        teamName: this.aTeam.teamName,
        paste: this.aTeam.paste,
        coach: this.aTeam.coach,
      },
      bTeam: {
        team: this.bTeam.team.map((pokemon) => pokemon.toClient()),
        teamName: this.bTeam.teamName,
        paste: this.bTeam.paste,
        coach: this.bTeam.coach,
      },
      stage: this.stage,
      matches: this.matches,
      score: [1, 3],
    };
  }

  async analyze(sub?: string) {
    const aTeam = this.aTeam.owner === sub ? this.aTeam : this.bTeam;
    const bTeam = this.aTeam.owner === sub ? this.bTeam : this.aTeam;
    const data: {
      details: {
        level: number;
        format: FormatId;
        ruleset: RulesetId;
        gameTime?: string;
        stage?: string;
        leagueName?: string;
      };
      summary: {
        teamName?: string;
        coach?: string;
        team: (PokemonFormData & {
          abilities: string[];
          baseStats: StatsTable;
          types: [TypeName] | [TypeName, TypeName];
          index: number;
        })[];
        stats?: {
          mean: {
            hp?: number;
            atk?: number;
            def?: number;
            spa?: number;
            spd?: number;
            spe?: number;
          };
          median: {
            hp?: number;
            atk?: number;
            def?: number;
            spa?: number;
            spd?: number;
            spe?: number;
          };
          max: {
            hp?: number;
            atk?: number;
            def?: number;
            spa?: number;
            spd?: number;
            spe?: number;
          };
        };
      }[];
      speedchart: Speedchart;
      coveragechart: Coveragechart[];
      typechart: {
        team: (PokemonFormData & {
          weak: { [key: string]: number }[];
        })[];
        teraTypes: {
          [key: string]: {};
        };
      }[];
      movechart: Movechart[];
      notes?: string;
    } = {
      details: {
        level: this.format.level,
        format: this.format.name,
        ruleset: this.ruleset.name,
        gameTime: this.gameTime,
        leagueName: this.leagueName,
        stage: this.stage,
      },
      summary: [
        new SummaryClass(aTeam.team, aTeam.teamName, aTeam.coach).toJson(),
        new SummaryClass(bTeam.team, bTeam.teamName, bTeam.coach).toJson(),
      ],
      speedchart: speedchart([aTeam.team, bTeam.team], this.format.level),
      coveragechart: [
        await coveragechart(aTeam.team, bTeam.team),
        await coveragechart(bTeam.team, aTeam.team),
      ],
      typechart: [
        new Typechart(aTeam.team).toJson(),
        new Typechart(bTeam.team).toJson(),
      ],
      movechart: [
        await movechart(aTeam.team, aTeam.team[0].ruleset),
        await movechart(bTeam.team, bTeam.team[0].ruleset),
      ],
      notes:
        sub && sub === aTeam.owner
          ? aTeam.notes
          : sub && sub === bTeam.owner
            ? bTeam.notes
            : undefined,
    };
    return data;
  }

  static fromForm(draft: Draft, opponent: Opponent) {
    return new Matchup(
      {
        team: draft.team,
        teamName: draft.teamName,
        _id: draft._id!,
      },
      {
        team: opponent.team,
        teamName: opponent.teamName,
        coach: opponent.coach,
      },
      draft.ruleset,
      draft.format,
      draft.leagueName,
      draft.tournamentId,
      opponent.stage,
      [],
    );
  }

  toOpponent(): Opponent {
    return new Opponent(
      this.ruleset,
      this.bTeam.team,
      this.bTeam.teamName,
      this.matches,
      this.stage,
      this.bTeam.coach,
      this.bTeam._id,
    );
  }
}

export class Score {
  constructor(
    private scoreData: {
      bTeamPaste: string;
      aTeamPaste: string;
      matches: {
        replay: string;
        winner: "a" | "b" | "";
        aTeam: {
          team: {
            pokemon: { id: string };
            kills: number;
            fainted: number;
            indirect: number;
            brought: number;
          }[];
        };
        bTeam: {
          team: {
            pokemon: { id: string };
            kills: number;
            fainted: number;
            indirect: number;
            brought: number;
          }[];
        };
      }[];
    },
  ) {}

  async processScore(): Promise<{
    matches: MatchData[];
    aTeamPaste?: string | undefined;
    bTeamPaste?: string | undefined;
  }> {
    const data: {
      matches: MatchData[];
      aTeamPaste?: string;
      bTeamPaste?: string;
    } = {
      matches: [],
    };
    const pastePattern = /^(https:\/\/)?pokepast\.es\/[a-zA-Z0-9]{16}$/;

    if (this.scoreData.aTeamPaste != "") {
      data.aTeamPaste = this.scoreData.aTeamPaste;
    }
    if (this.scoreData.bTeamPaste != "") {
      data.bTeamPaste = this.scoreData.bTeamPaste;
    }
    this.scoreData.matches.forEach((match) => {
      let matchData: MatchData = {
        aTeam: { stats: [], score: 0 },
        bTeam: { stats: [], score: 0 },
      };
      if (match.replay != "") {
        matchData.replay = match.replay;
      }
      if (match.winner) {
        matchData.winner = match.winner;
      }
      let aTeamStats: { [key: string]: any } = {};
      for (const stat of match.aTeam.team) {
        if (stat.brought) {
          const pokemonStats: {
            kills?: number;
            indirect?: number;
            deaths?: number;
            brought?: number;
          } = {};
          if (stat.kills > 0) {
            pokemonStats.kills = stat.kills;
          }
          if (stat.fainted > 0) {
            pokemonStats.deaths = stat.fainted;
          }
          if (stat.indirect > 0) {
            pokemonStats.indirect = stat.indirect;
          }
          if (stat.brought > 0) {
            pokemonStats.brought = stat.brought;
          }
          if (Object.keys(pokemonStats).length > 0) {
            aTeamStats[stat.pokemon.id] = pokemonStats;
          }
        }
      }
      matchData.aTeam.stats = Object.entries(aTeamStats);
      let bTeamStats: { [key: string]: any } = {};
      for (const stat of match.bTeam.team) {
        if (stat.brought) {
          const pokemonStats: {
            kills?: number;
            indirect?: number;
            deaths?: number;
            brought?: number;
          } = {};
          if (stat.kills > 0) {
            pokemonStats.kills = stat.kills;
          }
          if (stat.fainted > 0) {
            pokemonStats.deaths = stat.fainted;
          }
          if (stat.indirect > 0) {
            pokemonStats.indirect = stat.indirect;
          }
          if (stat.brought > 0) {
            pokemonStats.brought = stat.brought;
          }
          if (Object.keys(pokemonStats).length > 0) {
            bTeamStats[stat.pokemon.id] = pokemonStats;
          }
        }
      }
      matchData.bTeam.stats = Object.entries(bTeamStats);
      matchData.aTeam.score =
        matchData.aTeam.stats.length -
        matchData.aTeam.stats.reduce(
          (deaths, mon) =>
            (deaths += +(mon[1].deaths !== undefined && mon[1].deaths > 0)),
          0,
        );
      matchData.bTeam.score =
        matchData.bTeam.stats.length -
        matchData.bTeam.stats.reduce(
          (deaths, mon) =>
            (deaths += +(mon[1].deaths !== undefined && mon[1].deaths > 0)),
          0,
        );
      data.matches.push(matchData);
    });
    return data;
  }
}

export class GameTime {
  constructor(
    private timeData: { dateTime: string; email: boolean; emailTime: number },
  ) {}

  async processTime(): Promise<{ dateTime: string; emailTime: number }> {
    return {
      dateTime: this.timeData.dateTime,
      emailTime: this.timeData.email
        ? Math.floor(this.timeData.emailTime * 60)
        : -1,
    };
  }
}
