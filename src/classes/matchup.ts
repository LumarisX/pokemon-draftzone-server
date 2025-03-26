import { Types } from "mongoose";
import { PZError } from "..";
import { Ruleset } from "../data/rulesets";
import { DraftDocument, DraftModel } from "../models/draft.model";
import { MatchData, MatchupData } from "../models/matchup.model";
import { PokemonData } from "../models/pokemon.schema";
import { Draft2 } from "./draft";
import { DraftSpecie } from "./pokemon";

export class Matchup {
  constructor(
    public draft: {
      data: Draft2;
      _id: Types.ObjectId;
      paste?: string;
    },
    public opponent: {
      teamName: string;
      team: DraftSpecie[];
      coach?: string;
      paste?: string;
    },
    public stage: string,
    public matches: MatchData[],
    public notes?: string,
    public gameTime?: string,
    public reminder?: number
  ) {}

  static async fromData(data: MatchupData, draft?: Draft2): Promise<Matchup> {
    if (!draft) {
      const draftDoc: DraftDocument | null = await DraftModel.findById(
        data.aTeam._id
      );
      if (!draftDoc) throw new PZError(400, "Draft ID not found.");
      draft = Draft2.fromDocument(draftDoc);
    }
    return new Matchup(
      {
        data: draft,
        _id: data.aTeam._id,
        paste: data.aTeam.paste,
      },
      {
        teamName: data.bTeam.teamName,
        coach: data.bTeam.coach,
        team: data.bTeam.team.map(
          (pokemon) => new DraftSpecie(pokemon, draft.ruleset)
        ),
        paste: data.bTeam.paste,
      },
      data.stage,
      data.matches,
      data.notes,
      data.gameTime,
      data.reminder
    );
  }

  // updateOpponent(opponent: Opponent): Matchup {
  //   return new Matchup(
  //     this.draft,
  //     {
  //       teamName: opponent.teamName,
  //       team: opponent.team,
  //       coach: opponent.coach,
  //     },
  //     opponent.stage,
  //     this.matches,
  //     this.notes,
  //     this.gameTime,
  //     this.reminder
  //   );
  // }

  toData(): MatchupData {
    return {
      aTeam: {
        _id: this.draft._id,
        paste: this.draft.paste,
      },
      bTeam: {
        teamName: this.opponent.teamName,
        coach: this.opponent.coach ?? undefined,
        paste: this.opponent.paste,
        team: this.opponent.team.map((pokemon) => pokemon.toData()),
      },
      stage: this.stage,
      matches: this.matches,
      notes: this.notes,
      gameTime: this.gameTime,
      reminder: this.reminder,
    };
  }

  toClient() {
    return {};
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
    }
  ) {}

  async processScore(): Promise<{
    matches: {}[];
    aTeamPaste?: string | undefined;
    bTeamPaste?: string | undefined;
  }> {
    const data: {
      matches: {}[];
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
      let matchData: {
        replay?: string;
        winner: "" | "a" | "b";
        aTeam: { stats: [string, any][]; score: number };
        bTeam: { stats: [string, any][]; score: number };
      } = {
        aTeam: { stats: [], score: 0 },
        bTeam: { stats: [], score: 0 },
        winner: "",
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
          (deaths, mon) => (deaths += +(mon[1].deaths > 0)),
          0
        );
      matchData.bTeam.score =
        matchData.bTeam.stats.length -
        matchData.bTeam.stats.reduce(
          (deaths, mon) => (deaths += +(mon[1].deaths > 0)),
          0
        );
      data.matches.push(matchData);
    });
    return data;
  }
}

export class GameTime {
  constructor(
    private timeData: { dateTime: string; email: boolean; emailTime: number }
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

export class MatchupTeam {
  constructor(
    public ruleset: Ruleset,
    public teamName: string,
    public team: DraftSpecie[],
    public _id?: Types.ObjectId,
    public coach?: string
  ) {}

  static fromData(
    data: {
      teamName: string;
      team: PokemonData[];
      _id?: Types.ObjectId;
      coach?: string;
    },
    ruleset: Ruleset
  ): MatchupTeam {
    return new MatchupTeam(
      ruleset,
      data.teamName,
      data.team.map((pokemon) => new DraftSpecie(pokemon, ruleset)),
      data._id,
      data.coach
    );
  }

  toClient() {
    return {
      teamName: this.teamName,
      coach: this.coach,
      team: this.team.map((pokemon) => pokemon.toClient()),
    };
  }
}
