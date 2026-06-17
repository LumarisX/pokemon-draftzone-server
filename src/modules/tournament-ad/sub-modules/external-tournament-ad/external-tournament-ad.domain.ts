import { ExternalTournamentAdDto } from "./external-tournament-ad.dto";
import { ExternalTournamentAdDocument } from "./external-tournament-ad.schema";
export class ExternalTournamentAd {
  constructor() {}

  public toDatabasePayload() {
    return {};
  }

  public toClientPayload() {
    return {};
  }

  public static fromForm(
    dto: ExternalTournamentAdDto,
    userId: string,
  ): ExternalTournamentAd {
    return new ExternalTournamentAd();
  }

  public static fromDatabase(
    doc: ExternalTournamentAdDocument,
  ): ExternalTournamentAd {
    return new ExternalTournamentAd();
  }
}
