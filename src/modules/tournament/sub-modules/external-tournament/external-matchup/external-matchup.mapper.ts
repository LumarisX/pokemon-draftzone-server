import { Ruleset } from "@core/data/rulesets/rulesets";
import { DraftSpecie } from "../../../../../classes/pokemon";
import { ExternalTournamentMapper } from "../external-tournament.mapper";
import { ExternalTournamentDocument } from "../external-tournament.schema";
import { ExternalMatchup } from "./external-matchup.domain";
import { ExternalMatchupDto } from "./external-matchup.dto";
import {
  ExternalMatchupDocument,
  ExternalMatchupEntity,
} from "./external-matchup.schema";

export class ExternalMatchupMapper {
  static toClientPayload(matchup: ExternalMatchup) {
    return {
      _id: matchup._id,
      stage: matchup.stage,
      teamName: matchup.teamName,
      coach: matchup.coach,
      team: matchup.team.map((pokemon) => pokemon.toClient()),
      score: matchup.calculateScore(),
      matches: matchup.matches,
      paste: matchup.paste,
    };
  }

  static toDatabasePayload(matchup: ExternalMatchup): ExternalMatchupEntity {
    return {
      aTeam: {
        _id: matchup._id!, //Needs to be reviewed later
        paste: matchup.paste,
      },
      bTeam: {
        teamName: matchup.teamName,
        coach: matchup.coach ?? undefined,
        team: matchup.team.map((pokemon) => pokemon.toData()),
        paste: matchup.paste,
      },
      stage: matchup.stage,
      matches: [],
    };
  }

  static fromForm(data: ExternalMatchupDto, ruleset: Ruleset): ExternalMatchup {
    const errors: string[] = [];

    if (errors.length > 0) {
      throw new Error(errors.join(", "));
    }

    return new ExternalMatchup({
      ruleset,
      team: data.team
        .filter((pokemonData) => pokemonData.id)
        .map((pokemonData) => new DraftSpecie(pokemonData, ruleset)),
      teamName: data.teamName,
      matches: data.matches || [],
      stage: data.stage,
      coach: data.coach,
    });
  }

  static fromDatabase(
    matchupDoc: ExternalMatchupDocument,
    ruleset: Ruleset,
  ): ExternalMatchup {
    return new ExternalMatchup({
      ruleset,
      team: DraftSpecie.getTeam(matchupDoc.bTeam.team, ruleset),
      teamName: matchupDoc.bTeam.teamName,
      matches: matchupDoc.matches ?? [],
      stage: matchupDoc.stage,
      coach: matchupDoc.bTeam.coach,
      _id: matchupDoc._id,
      paste: matchupDoc.bTeam.paste,
      notes: matchupDoc.notes,
    });
  }
}
