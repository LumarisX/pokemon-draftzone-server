import { TournamentRepository } from "@modules/tournament/tournament.repository";
import { Injectable } from "@nestjs/common";
import { getRuleset } from "../../../data/rulesets";
import { ErrorCodes } from "../../../errors/error-codes";
import { PDZError } from "../../../errors/pdz-error";
import { Matchup } from "./matchup.domain";
import { MatchupDto } from "./matchup.dto";
import { MatchupRepository } from "./matchup.repository";

@Injectable()
export class MatchupService {
  constructor(
    private readonly matchupRepository: MatchupRepository,
    private readonly tournamentRepository: TournamentRepository,
  ) {}

  async getMatchups(tournamentId: string, owner: string) {
    const tournament = await this.tournamentRepository.findByTournamentAndOwner(
      tournamentId,
      owner,
    );
    const docs = await this.matchupRepository.findByTournamentId(
      tournament._id,
    );
    const ruleset = getRuleset(tournament.ruleset);
    return docs.map((doc) => {
      return Matchup.fromDatabase(doc, ruleset).toClientPayload();
    });
  }

  async createMatchup(
    tournamentId: string,
    owner: string,
    matchupData: MatchupDto,
  ): Promise<void> {
    // const tournament = await this.tournamentRepository.findByTournamentAndOwner(
    //   tournamentId,
    //   owner,
    // );
    // const ruleset = getRuleset(tournament.ruleset);
    // const matchup = Matchup.fromForm(matchupData, ruleset);
    // const draftObjectId = new (require("mongoose").Types.ObjectId)(
    //   tournamentId,
    // );
    // await this.matchupRepository.create(
    //   matchup.toDatabasePayload(draftObjectId, owner, tournamentId),
    // );
  }

  async getMatchup(tournamentId: string, matchupId: string, owner: string) {
    const tournament = await this.tournamentRepository.findByTournamentAndOwner(
      tournamentId,
      owner,
    );
    const ruleset = getRuleset(tournament.ruleset);
    const doc = await this.matchupRepository.findById(matchupId);
    return Matchup.fromDatabase(doc, ruleset).toClientPayload();
  }

  async getMatchupOpponent(
    tournamentId: string,
    matchupId: string,
    owner: string,
  ) {
    // const matchup = await this.matchupRepository.findById(matchupId);
    // const matchupInstance = await Matchup.fromData(matchup.toObject());
    // return matchupInstance.toOpponent().toClient();
  }

  async updateMatchupOpponent(
    matchupId: string,
    owner: string,
    opponentData: MatchupDto,
  ) {
    //   const updatedMatchup = await this.matchupRepository.update(
    //     matchupId,
    //     opponentData,
    //   );
    //   if (!updatedMatchup) throw new PDZError(ErrorCodes.MATCHUP.NOT_FOUND);
    //   return updatedMatchup;
    // }
    // async getMatchupSchedule(tournamentId: string, matchupId: string) {
    //   const matchup = await this.matchupRepository.findById(matchupId);
    //   return {
    //     gameTime: matchup.gameTime,
    //     reminder: matchup.reminder,
    //   };
  }
}
