import { TeamRepository } from "@modules/team/team.repository";
import { HostedTournament } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.domain";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { TournamentLogRepository } from "./tournament-log.repository";
import { TournamentLogService } from "./tournament-log.service";

function tournament(overrides: Record<string, unknown> = {}) {
  return {
    id: "tournament-1",
    slug: "spring-cup",
    owner: "auth0|owner",
    staff: [{ sub: "auth0|organizer", role: "organizer" }],
    ...overrides,
  } as unknown as HostedTournament;
}

function entry(seq: number) {
  return {
    seq,
    createdAt: new Date("2026-10-01"),
    actor: "auth0|organizer",
    actorName: "Erika",
    type: "tier-list.edited",
    summary: "Moved 1 Pokémon",
  };
}

describe("TournamentLogService", () => {
  let logRepo: jest.Mocked<TournamentLogRepository>;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let service: TournamentLogService;

  beforeEach(() => {
    logRepo = {
      list: jest.fn().mockResolvedValue([entry(3), entry(2), entry(1)]),
    } as unknown as jest.Mocked<TournamentLogRepository>;
    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(tournament()),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    teamRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([
        {
          _id: "team-1",
          status: "approved",
          coaches: [{ _id: "coach-1", auth0Id: "auth0|coach" }],
        },
        {
          _id: "team-2",
          status: "pending",
          coaches: [{ _id: "coach-2", auth0Id: "auth0|applicant" }],
        },
      ]),
    } as unknown as jest.Mocked<TeamRepository>;
    service = new TournamentLogService(logRepo, tournamentRepo, teamRepo);
  });

  it("shows the log to the tournament's coaches and organizers", async () => {
    await expect(service.list("l", "t", "auth0|coach", {})).resolves.toBeDefined();
    await expect(service.list("l", "t", "auth0|organizer", {})).resolves.toBeDefined();
  });

  it("keeps it from applicants and strangers unless it is public", async () => {
    await expect(service.list("l", "t", "auth0|applicant", {})).rejects.toMatchObject({
      code: "TRN-024",
    });
    await expect(service.list("l", "t", undefined, {})).rejects.toMatchObject({
      code: "TRN-024",
    });

    tournamentRepo.findBySlug.mockResolvedValue(tournament({ logVisibility: "public" }));
    await expect(service.list("l", "t", undefined, {})).resolves.toBeDefined();
  });

  it("pages newest first and never exposes who acted by account", async () => {
    const result = await service.list("l", "t", "auth0|coach", { limit: 2 });

    expect(logRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ tournamentId: "tournament-1", limit: 3 }),
    );
    expect(result.entries.map((view) => view.seq)).toEqual([3, 2]);
    expect(result.next).toBe(2);
    expect(JSON.stringify(result)).not.toContain("auth0|organizer");
    expect(result.entries[0].actorName).toBe("Erika");
  });

  it("ignores filter types it doesn't know", async () => {
    await service.list("l", "t", "auth0|coach", {
      types: ["tier-list.swapped", "nonsense"],
    });

    expect(logRepo.list).toHaveBeenCalledWith(
      expect.objectContaining({ types: ["tier-list.swapped"] }),
    );
  });
});
