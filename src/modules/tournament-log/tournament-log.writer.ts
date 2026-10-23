import { Injectable } from "@nestjs/common";
import { NewLogEntry, TournamentLogRepository } from "./tournament-log.repository";

export type LogTournament = {
  id: string;
  staffName(sub: string): string | null;
};

@Injectable()
export class TournamentLogWriter {
  constructor(private readonly logRepo: TournamentLogRepository) {}

  async record(
    tournament: LogTournament,
    sub: string,
    entry: Omit<NewLogEntry, "tournamentId" | "actor" | "actorName">,
  ): Promise<void> {
    await this.logRepo.append({
      ...entry,
      tournamentId: tournament.id,
      actor: sub,
      actorName: tournament.staffName(sub) ?? undefined,
    });
  }
}
