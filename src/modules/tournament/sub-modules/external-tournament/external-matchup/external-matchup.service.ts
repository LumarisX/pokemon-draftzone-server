import { Injectable } from "@nestjs/common";
import { getRuleset } from "../../../../../data/rulesets";
import { ExternalTournamentRepository } from "../external-tournament.repository";
import { ExternalMatchup } from "./external-matchup.domain";
import { ExternalMatchupDto } from "./external-matchup.dto";
import { ExternalMatchupRepository } from "./external-matchup.repository";

@Injectable()
export class ExternalMatchupService {
  constructor(
    private readonly externalmatchupRepository: ExternalMatchupRepository,
    private readonly tournamentRepository: ExternalTournamentRepository,
  ) {}

  async getExternalMatchups(tournamentId: string, owner: string) {
    const tournament = await this.tournamentRepository.findByTournamentAndOwner(
      tournamentId,
      owner,
    );
    const docs = await this.externalmatchupRepository.findByTournamentId(
      tournament._id,
    );
    const ruleset = getRuleset(tournament.ruleset);
    return docs.map((doc) => {
      return ExternalMatchup.fromDatabase(doc, ruleset).toClientPayload();
    });
  }

  async createExternalMatchup(
    tournamentId: string,
    owner: string,
    externalmatchupData: ExternalMatchupDto,
  ): Promise<void> {
    // const tournament = await this.tournamentRepository.findByTournamentAndOwner(
    //   tournamentId,
    //   owner,
    // );
    // const ruleset = getRuleset(tournament.ruleset);
    // const externalmatchup = ExternalMatchup.fromForm(externalmatchupData, ruleset);
    // const draftObjectId = new (require("mongoose").Types.ObjectId)(
    //   tournamentId,
    // );
    // await this.externalmatchupRepository.create(
    //   externalmatchup.toDatabasePayload(draftObjectId, owner, tournamentId),
    // );
  }

  async getExternalMatchup(
    tournamentId: string,
    externalmatchupId: string,
    owner: string,
  ) {
    const tournament = await this.tournamentRepository.findByTournamentAndOwner(
      tournamentId,
      owner,
    );
    const ruleset = getRuleset(tournament.ruleset);
    const doc =
      await this.externalmatchupRepository.findById(externalmatchupId);
    return ExternalMatchup.fromDatabase(doc, ruleset).toClientPayload();
  }

  async getExternalMatchupOpponent(
    tournamentId: string,
    externalmatchupId: string,
    owner: string,
  ) {
    // const externalmatchup = await this.externalmatchupRepository.findById(externalmatchupId);
    // const externalmatchupInstance = await ExternalMatchup.fromData(externalmatchup.toObject());
    // return externalmatchupInstance.toOpponent().toClient();
  }

  async updateExternalMatchupOpponent(
    externalmatchupId: string,
    owner: string,
    opponentData: ExternalMatchupDto,
  ) {
    //   const updatedExternalMatchup = await this.externalmatchupRepository.update(
    //     externalmatchupId,
    //     opponentData,
    //   );
    //   if (!updatedExternalMatchup) throw new PDZError(ErrorCodes.EXTERNALMATCHUP.NOT_FOUND);
    //   return updatedExternalMatchup;
    // }
    // async getExternalMatchupSchedule(tournamentId: string, externalmatchupId: string) {
    //   const externalmatchup = await this.externalmatchupRepository.findById(externalmatchupId);
    //   return {
    //     gameTime: externalmatchup.gameTime,
    //     reminder: externalmatchup.reminder,
    //   };
  }
}
