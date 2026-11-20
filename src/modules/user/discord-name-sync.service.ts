import { CoachRepository } from "@modules/coach/coach.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TournamentApplicationRepository } from "@modules/tournament-application/tournament-application.repository";
import { Injectable } from "@nestjs/common";

export interface DiscordNameSyncResult {
  coaches: number;
  applications: number;
}

@Injectable()
export class DiscordNameSyncService {
  constructor(
    private readonly coachRepo: CoachRepository,
    private readonly teamRepo: TeamRepository,
    private readonly applicationRepo: TournamentApplicationRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
  ) {}

  async propagateToRunningSignUps(
    accountId: string,
    discordName: string,
    discordId?: string,
  ): Promise<DiscordNameSyncResult> {
    const { runningCoachIds, runningApplicationIds } =
      await this.findRunning(accountId);
    const [coachCount, applicationCount] = await Promise.all(
      discordId
        ? [
            this.coachRepo.setDiscordIdentity(
              runningCoachIds,
              discordName,
              discordId,
            ),
            this.applicationRepo.setDiscordIdentity(
              runningApplicationIds,
              discordName,
              discordId,
            ),
          ]
        : [
            this.coachRepo.setDiscordName(runningCoachIds, discordName),
            this.applicationRepo.setDiscordName(
              runningApplicationIds,
              discordName,
            ),
          ],
    );
    return { coaches: coachCount, applications: applicationCount };
  }

  async clearRunningDiscordIds(
    accountId: string,
  ): Promise<DiscordNameSyncResult> {
    const { runningCoachIds, runningApplicationIds } =
      await this.findRunning(accountId);
    const [coachCount, applicationCount] = await Promise.all([
      this.coachRepo.clearDiscordId(runningCoachIds),
      this.applicationRepo.clearDiscordId(runningApplicationIds),
    ]);
    return { coaches: coachCount, applications: applicationCount };
  }

  private async findRunning(accountId: string): Promise<{
    runningCoachIds: string[];
    runningApplicationIds: string[];
  }> {
    const [coaches, applications] = await Promise.all([
      this.coachRepo.findRunningByAuth0Id(accountId),
      this.applicationRepo.findAllByApplicant(accountId),
    ]);

    const teams = await this.teamRepo.findManyByIds(
      coaches.map((coach) => coach.teamId),
    );
    const tournamentByTeam = new Map(
      teams.map((team) => [team._id.toString(), team.tournamentId.toString()]),
    );

    const candidateTournamentIds = new Set<string>([
      ...tournamentByTeam.values(),
      ...applications.map((application) => application.tournamentId.toString()),
    ]);
    const finished = await this.tournamentRepo.findFinishedIds([
      ...candidateTournamentIds,
    ]);

    const runningCoachIds = coaches
      .filter((coach) => {
        const tournamentId = tournamentByTeam.get(coach.teamId.toString());
        return tournamentId !== undefined && !finished.has(tournamentId);
      })
      .map((coach) => coach._id.toString());
    const runningCoachSet = new Set(runningCoachIds);

    const runningApplicationIds = applications
      .filter((application) => {
        if (finished.has(application.tournamentId.toString())) return false;
        if (application.status === "pending") return true;
        if (application.status === "waitlisted") return true;
        return (
          application.status === "approved" &&
          !!application.resultingCoachId &&
          runningCoachSet.has(application.resultingCoachId.toString())
        );
      })
      .map((application) => application._id.toString());

    return { runningCoachIds, runningApplicationIds };
  }
}
