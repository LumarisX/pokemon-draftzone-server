import { CoachRepository } from "@modules/coach/coach.repository";
import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TournamentApplicationRepository } from "@modules/tournament-application/tournament-application.repository";
import { Types } from "mongoose";
import { DiscordNameSyncService } from "./discord-name-sync.service";

const ACCOUNT = "65f0c0ffee0000000000abcd";
const NEW_NAME = "new#0001";

function id() {
  return new Types.ObjectId();
}

describe("DiscordNameSyncService.propagateToRunningSignUps", () => {
  let coachRepo: jest.Mocked<CoachRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let applicationRepo: jest.Mocked<TournamentApplicationRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let service: DiscordNameSyncService;

  const live = { tournament: id(), team: id(), coach: id() };
  const finished = { tournament: id(), team: id(), coach: id() };

  beforeEach(() => {
    coachRepo = {
      findRunningByAuth0Id: jest.fn().mockResolvedValue([]),
      setDiscordName: jest.fn().mockResolvedValue(0),
      setDiscordIdentity: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<CoachRepository>;
    teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<TeamRepository>;
    applicationRepo = {
      findAllByApplicant: jest.fn().mockResolvedValue([]),
      setDiscordName: jest.fn().mockResolvedValue(0),
      setDiscordIdentity: jest.fn().mockResolvedValue(0),
    } as unknown as jest.Mocked<TournamentApplicationRepository>;
    tournamentRepo = {
      findFinishedIds: jest.fn().mockResolvedValue(new Set()),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    service = new DiscordNameSyncService(
      coachRepo,
      teamRepo,
      applicationRepo,
      tournamentRepo,
    );
  });

  it("updates running coach rows and their applications", async () => {
    const application = {
      _id: id(),
      tournamentId: live.tournament,
      status: "approved",
      resultingCoachId: live.coach,
    };
    coachRepo.findRunningByAuth0Id.mockResolvedValue([
      { _id: live.coach, teamId: live.team },
    ] as any);
    teamRepo.findManyByIds.mockResolvedValue([
      { _id: live.team, tournamentId: live.tournament },
    ] as any);
    applicationRepo.findAllByApplicant.mockResolvedValue([application] as any);

    await service.propagateToRunningSignUps(ACCOUNT, NEW_NAME);

    expect(coachRepo.findRunningByAuth0Id).toHaveBeenCalledWith(ACCOUNT);
    expect(coachRepo.setDiscordName).toHaveBeenCalledWith(
      [live.coach.toString()],
      NEW_NAME,
    );
    expect(applicationRepo.setDiscordName).toHaveBeenCalledWith(
      [application._id.toString()],
      NEW_NAME,
    );
  });

  it("includes pending and waitlisted applications that have no coach row", async () => {
    const pending = {
      _id: id(),
      tournamentId: live.tournament,
      status: "pending",
    };
    const waitlisted = {
      _id: id(),
      tournamentId: live.tournament,
      status: "waitlisted",
    };
    applicationRepo.findAllByApplicant.mockResolvedValue([
      pending,
      waitlisted,
    ] as any);

    await service.propagateToRunningSignUps(ACCOUNT, NEW_NAME);

    expect(applicationRepo.setDiscordName).toHaveBeenCalledWith(
      [pending._id.toString(), waitlisted._id.toString()],
      NEW_NAME,
    );
    expect(coachRepo.setDiscordName).toHaveBeenCalledWith([], NEW_NAME);
  });

  it("leaves sign-ups in a completed tournament alone", async () => {
    coachRepo.findRunningByAuth0Id.mockResolvedValue([
      { _id: finished.coach, teamId: finished.team },
    ] as any);
    teamRepo.findManyByIds.mockResolvedValue([
      { _id: finished.team, tournamentId: finished.tournament },
    ] as any);
    const approved = {
      _id: id(),
      tournamentId: finished.tournament,
      status: "approved",
      resultingCoachId: finished.coach,
    };
    const pending = {
      _id: id(),
      tournamentId: finished.tournament,
      status: "pending",
    };
    applicationRepo.findAllByApplicant.mockResolvedValue([
      approved,
      pending,
    ] as any);
    tournamentRepo.findFinishedIds.mockResolvedValue(
      new Set([finished.tournament.toString()]),
    );

    await service.propagateToRunningSignUps(ACCOUNT, NEW_NAME);

    expect(coachRepo.setDiscordName).toHaveBeenCalledWith([], NEW_NAME);
    expect(applicationRepo.setDiscordName).toHaveBeenCalledWith([], NEW_NAME);
  });

  it("leaves denied applications and approvals whose coach is not running", async () => {
    const denied = {
      _id: id(),
      tournamentId: live.tournament,
      status: "denied",
    };
    const approvedButLeft = {
      _id: id(),
      tournamentId: live.tournament,
      status: "approved",
      resultingCoachId: id(),
    };
    const approvedWithoutCoach = {
      _id: id(),
      tournamentId: live.tournament,
      status: "approved",
    };
    applicationRepo.findAllByApplicant.mockResolvedValue([
      denied,
      approvedButLeft,
      approvedWithoutCoach,
    ] as any);

    await service.propagateToRunningSignUps(ACCOUNT, NEW_NAME);

    expect(applicationRepo.setDiscordName).toHaveBeenCalledWith([], NEW_NAME);
  });

  it("only asks for coach rows that have not left or completed", async () => {
    await service.propagateToRunningSignUps(ACCOUNT, NEW_NAME);

    expect(coachRepo.findRunningByAuth0Id).toHaveBeenCalledTimes(1);
    expect(tournamentRepo.findFinishedIds).toHaveBeenCalledWith([]);
  });

  it("carries the Discord id to running coach rows and applications", async () => {
    const application = {
      _id: id(),
      tournamentId: live.tournament,
      status: "pending",
    };
    coachRepo.findRunningByAuth0Id.mockResolvedValue([
      { _id: live.coach, teamId: live.team },
    ] as any);
    teamRepo.findManyByIds.mockResolvedValue([
      { _id: live.team, tournamentId: live.tournament },
    ] as any);
    applicationRepo.findAllByApplicant.mockResolvedValue([application] as any);

    await service.propagateToRunningSignUps(ACCOUNT, NEW_NAME, "123456789012345678");

    expect(coachRepo.setDiscordIdentity).toHaveBeenCalledWith(
      [live.coach.toString()],
      NEW_NAME,
      "123456789012345678",
    );
    expect(applicationRepo.setDiscordIdentity).toHaveBeenCalledWith(
      [application._id.toString()],
      NEW_NAME,
      "123456789012345678",
    );
  });
});

describe("DiscordNameSyncService.clearRunningDiscordIds", () => {
  it("removes the id from running coach rows and applications only", async () => {
    const live = { tournament: id(), team: id(), coach: id() };
    const finished = { tournament: id(), team: id(), coach: id() };
    const coachRepo = {
      findRunningByAuth0Id: jest.fn().mockResolvedValue([
        { _id: live.coach, teamId: live.team },
        { _id: finished.coach, teamId: finished.team },
      ]),
      clearDiscordId: jest.fn().mockResolvedValue(1),
    };
    const teamRepo = {
      findManyByIds: jest.fn().mockResolvedValue([
        { _id: live.team, tournamentId: live.tournament },
        { _id: finished.team, tournamentId: finished.tournament },
      ]),
    };
    const pending = { _id: id(), tournamentId: live.tournament, status: "pending" };
    const oldPending = {
      _id: id(),
      tournamentId: finished.tournament,
      status: "pending",
    };
    const applicationRepo = {
      findAllByApplicant: jest.fn().mockResolvedValue([pending, oldPending]),
      clearDiscordId: jest.fn().mockResolvedValue(1),
    };
    const tournamentRepo = {
      findFinishedIds: jest
        .fn()
        .mockResolvedValue(new Set([finished.tournament.toString()])),
    };
    const service = new DiscordNameSyncService(
      coachRepo as unknown as CoachRepository,
      teamRepo as unknown as TeamRepository,
      applicationRepo as unknown as TournamentApplicationRepository,
      tournamentRepo as unknown as HostedTournamentRepository,
    );

    await service.clearRunningDiscordIds(ACCOUNT);

    expect(coachRepo.clearDiscordId).toHaveBeenCalledWith([live.coach.toString()]);
    expect(applicationRepo.clearDiscordId).toHaveBeenCalledWith([
      pending._id.toString(),
    ]);
  });
});
