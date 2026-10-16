import { Format } from "@core/data/formats/formats";
import { Ruleset } from "@core/data/rulesets/rulesets";
import { Types } from "mongoose";
import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";
import { PDZPokemon } from "@modules/pokemon/pokemon.domain";
import { PokemonEntity } from "@modules/pokemon/pokemon.schema";

export interface TournamentScore {
  wins: number;
  losses: number;
  diff: string;
}

export type ExternalFormResult = "win" | "loss" | "draw";

export type ExternalNextMatch = {
  round: string;
  matchupId: string | null;
  when: string | null;
  exactTime: boolean;
  opponent: { name: string; coach: string | null };
};

const FORM_LENGTH = 5;
const SCORING_GRACE_MS = 24 * 60 * 60 * 1000;

export class ExternalTournament {
  _id?: Types.ObjectId;
  ruleset: Ruleset;
  format: Format;
  leagueName: string;
  teamName: string;
  slug: string;
  owner: string;
  team: PDZPokemon[];
  unresolvedTeam: PokemonEntity[];
  doc?: string;
  coach?: string;
  completedAt?: Date;
  matchups: ExternalMatchup[];
  constructor(
    props: {
      _id?: Types.ObjectId;
      ruleset: Ruleset;
      format: Format;
      leagueName: string;
      teamName: string;
      slug: string;
      owner: string;
      team: PDZPokemon[];
      unresolvedTeam?: PokemonEntity[];
      doc?: string;
      coach?: string;
      completedAt?: Date;
    },
    matchups: ExternalMatchup[],
  ) {
    this._id = props._id;
    this.ruleset = props.ruleset;
    this.format = props.format;
    this.leagueName = props.leagueName;
    this.teamName = props.teamName;
    this.slug = props.slug;
    this.owner = props.owner;
    this.team = props.team;
    this.unresolvedTeam = props.unresolvedTeam ?? [];
    this.doc = props.doc;
    this.coach = props.coach;
    this.completedAt = props.completedAt;
    this.matchups = matchups;
  }

  getForm(): ExternalFormResult[] {
    return this.matchups
      .flatMap((matchup): ExternalFormResult[] => {
        if (matchup.isDoubleForfeit()) return ["loss"];
        if (!matchup.forfeitedBy && !matchup.calculateScore()) return [];
        const winner = matchup.calculateWinner();
        if (winner === "a") return ["win"];
        if (winner === "b") return ["loss"];
        return ["draw"];
      })
      .slice(-FORM_LENGTH);
  }

  getNextMatch(now = Date.now()): ExternalNextMatch | null {
    const open = this.matchups.filter(
      (matchup) => !matchup.forfeitedBy && !matchup.calculateScore(),
    );
    const scheduled = open
      .filter(
        (matchup) =>
          matchup.scheduledDate &&
          matchup.scheduledDate.getTime() > now - SCORING_GRACE_MS,
      )
      .sort(
        (a, b) => a.scheduledDate!.getTime() - b.scheduledDate!.getTime(),
      );
    const next =
      scheduled[0] ?? open.find((matchup) => !matchup.scheduledDate) ?? null;
    if (!next) return null;
    return {
      round: next.stage || "Next Match",
      matchupId: next.id ?? null,
      when: next.scheduledDate ? next.scheduledDate.toISOString() : null,
      exactTime: !!next.scheduledDate,
      opponent: {
        name: next.bTeam.teamName,
        coach: next.bTeam.coach ?? null,
      },
    };
  }

  getScore(): TournamentScore {
    const score: TournamentScore = { wins: 0, losses: 0, diff: "+0" };
    let numDiff = 0;
    const seriesScoring = this.matchups.some(
      (matchup) => (matchup.matches?.length ?? 0) > 1,
    );

    if (seriesScoring) {
      for (const matchup of this.matchups) {
        let matchupWins = 0;
        let matchupLosses = 0;
        for (const match of matchup.matches ?? []) {
          if (match.winner === "a") matchupWins++;
          else if (match.winner === "b") matchupLosses++;
        }
        if (matchupWins > matchupLosses) score.wins++;
        else if (matchupLosses > matchupWins) score.losses++;
        numDiff += matchupWins - matchupLosses;
      }
    } else {
      for (const matchup of this.matchups) {
        const match = matchup.matches?.[0];
        if (!match) continue;
        const aScore = match.aTeam?.score ?? 0;
        const bScore = match.bTeam?.score ?? 0;
        if (aScore > bScore) score.wins++;
        else if (aScore < bScore) score.losses++;
        numDiff += aScore - bScore;
      }
    }

    score.diff = (numDiff < 0 ? "" : "+") + numDiff;
    return score;
  }
}
