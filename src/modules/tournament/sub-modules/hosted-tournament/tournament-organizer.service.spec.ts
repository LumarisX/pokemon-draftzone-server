import { ErrorCodes } from "@core/pdz-error-codes";
import { CoachRepository } from "@modules/coach/coach.repository";
import { DraftCount } from "@modules/tier-list/tier-list.domain";
import { TeamRepository } from "@modules/team/team.repository";
import { Types } from "mongoose";
import { HostedTournament } from "./hosted-tournament.domain";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import { OrganizerInviteRepository } from "./organizer-invite.repository";
import {
  hashInviteToken,
  MAX_PENDING_ORGANIZER_INVITES,
  TournamentOrganizerService,
} from "./tournament-organizer.service";

const LEAGUE_KEY = "spring-league";
const TOURNAMENT_KEY = "spring-cup";
const OWNER = "auth0|owner";
const ORGANIZER = "auth0|organizer";
const OTHER_ORGANIZER = "auth0|other-organizer";
const OUTSIDER = "auth0|outsider";

function buildTournament(
  overrides: Partial<ConstructorParameters<typeof HostedTournament>[0]> = {},
) {
  return new HostedTournament({
    id: new Types.ObjectId().toString(),
    name: "Spring Cup",
    slug: TOURNAMENT_KEY,
    signUpDeadline: new Date("2099-01-01"),
    owner: OWNER,
    leagueId: "league-1",
    leagueSlug: LEAGUE_KEY,
    leagueName: "Spring League",
    staff: [
      { sub: ORGANIZER, name: "Nurse Joy", role: "organizer" },
      { sub: OTHER_ORGANIZER, role: "organizer" },
    ],
    ownerName: { sub: OWNER, name: "Brock" },
    tierListId: "tier-1",
    rules: [],
    stages: [],
    forfeit: { gameDiff: 1, pokemonDiff: 6 },
    diffMode: "pokemon",
    format: "Singles",
    ruleset: "Gen9 NatDex",
    draftCount: new DraftCount({ min: 1, max: 6 }),
    tierRequirements: [],
    signUpQuestions: [],
    ...overrides,
  });
}

function buildInvite(
  tournament: HostedTournament,
  overrides: Record<string, unknown> = {},
) {
  return {
    _id: new Types.ObjectId(),
    tournamentId: new Types.ObjectId(tournament.id),
    tokenHash: hashInviteToken("tok"),
    name: "Misty",
    createdBy: OWNER,
    expiresAt: new Date(Date.now() + 60_000),
    ...overrides,
  } as any;
}

function coach(auth0Id: string, name: string, leftAt?: Date) {
  return { _id: new Types.ObjectId(), auth0Id, name, leftAt } as any;
}

describe("TournamentOrganizerService", () => {
  let tournament: HostedTournament;
  let tournamentRepo: jest.Mocked<HostedTournamentRepository>;
  let inviteRepo: jest.Mocked<OrganizerInviteRepository>;
  let teamRepo: jest.Mocked<TeamRepository>;
  let coachRepo: jest.Mocked<CoachRepository>;
  let service: TournamentOrganizerService;

  beforeEach(() => {
    tournament = buildTournament();
    tournamentRepo = {
      findBySlug: jest.fn().mockResolvedValue(tournament),
      addStaff: jest.fn().mockResolvedValue(undefined),
      setStaffName: jest.fn().mockResolvedValue(undefined),
      setOwnerName: jest.fn().mockResolvedValue(undefined),
      removeStaff: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<HostedTournamentRepository>;
    inviteRepo = {
      create: jest.fn().mockImplementation(async (input) => ({
        _id: new Types.ObjectId(),
        ...input,
      })),
      findPendingByTournament: jest.fn().mockResolvedValue([]),
      countPendingByTournament: jest.fn().mockResolvedValue(0),
      findByTokenHash: jest.fn().mockResolvedValue(null),
      claim: jest.fn(),
      release: jest.fn(),
      deletePending: jest.fn().mockResolvedValue(true),
    } as unknown as jest.Mocked<OrganizerInviteRepository>;
    teamRepo = {
      findAllByTournament: jest.fn().mockResolvedValue([]),
      findByIdOrNull: jest.fn(),
    } as unknown as jest.Mocked<TeamRepository>;
    coachRepo = {
      findByIdOrNull: jest.fn(),
    } as unknown as jest.Mocked<CoachRepository>;

    service = new TournamentOrganizerService(
      tournamentRepo,
      inviteRepo,
      teamRepo,
      coachRepo,
    );
  });

  describe("getOrganizers", () => {
    it("names organizers by their tournament name, never their account", async () => {
      const result = await service.getOrganizers(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        ORGANIZER,
      );

      expect(result.organizers).toEqual([
        { sub: OWNER, name: "Brock", isOwner: true, isYou: false },
        { sub: ORGANIZER, name: "Nurse Joy", isOwner: false, isYou: true },
        { sub: OTHER_ORGANIZER, name: null, isOwner: false, isYou: false },
      ]);
    });

    it("does not show a previous owner's stored name to a new owner", async () => {
      tournament = buildTournament({
        ownerName: { sub: "auth0|previous-owner", name: "Giovanni" },
      });
      tournamentRepo.findBySlug.mockResolvedValue(tournament);

      const result = await service.getOrganizers(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OWNER,
      );

      expect(result.organizers[0]).toMatchObject({ sub: OWNER, name: null });
    });

    it("lists the owner once even if they also appear on the staff list", async () => {
      tournament = buildTournament({
        staff: [{ sub: OWNER, role: "organizer" }],
      });
      tournamentRepo.findBySlug.mockResolvedValue(tournament);

      const result = await service.getOrganizers(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OWNER,
      );

      expect(result.organizers.map((entry) => entry.sub)).toEqual([OWNER]);
    });

    it("hides invites and candidates from organizers who are not the owner", async () => {
      const result = await service.getOrganizers(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        ORGANIZER,
      );

      expect(result.canEdit).toBe(false);
      expect(result.invites).toEqual([]);
      expect(result.candidates).toEqual([]);
      expect(inviteRepo.findPendingByTournament).not.toHaveBeenCalled();
      expect(teamRepo.findAllByTournament).not.toHaveBeenCalled();
    });

    it("offers each active coach once, skipping anyone who already organizes", async () => {
      const misty = coach("auth0|misty", "Misty");
      teamRepo.findAllByTournament.mockResolvedValue([
        { teamName: "Cerulean", coaches: [coach(OWNER, "Owner Coach"), misty] },
        { teamName: "Pewter", coaches: [coach(ORGANIZER, "Organizer Coach")] },
        {
          teamName: "Other",
          coaches: [coach("auth0|gone", "Gone", new Date()), { ...misty }],
        },
      ] as any);

      const result = await service.getOrganizers(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OWNER,
      );

      expect(result.candidates).toEqual([
        { coachId: misty._id.toString(), name: "Misty", teamName: "Cerulean" },
      ]);
    });

    it("rejects anyone who is not an organizer", async () => {
      await expect(
        service.getOrganizers(LEAGUE_KEY, TOURNAMENT_KEY, OUTSIDER),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
    });
  });

  describe("addOrganizer", () => {
    it("promotes a coach under their sign-up name, as an organizer", async () => {
      const misty = { ...coach("auth0|misty", "Misty"), teamId: "team-1" };
      coachRepo.findByIdOrNull.mockResolvedValue(misty);
      teamRepo.findByIdOrNull.mockResolvedValue({
        tournamentId: new Types.ObjectId(tournament.id),
      } as any);

      await service.addOrganizer(LEAGUE_KEY, TOURNAMENT_KEY, OWNER, {
        coachId: misty._id.toString(),
      });

      expect(tournamentRepo.addStaff).toHaveBeenCalledWith(tournament.id, {
        sub: "auth0|misty",
        name: "Misty",
        role: "organizer",
      });
    });
  });

  describe("removeOrganizer", () => {
    it("pulls the organizer from the staff list", async () => {
      await service.removeOrganizer(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OWNER,
        ORGANIZER,
      );

      expect(tournamentRepo.removeStaff).toHaveBeenCalledWith(
        tournament.id,
        ORGANIZER,
      );
    });
  });

  describe("renameOrganizer", () => {
    it("lets an organizer rename themselves", async () => {
      await service.renameOrganizer(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        ORGANIZER,
        ORGANIZER,
        "Joy",
      );

      expect(tournamentRepo.setStaffName).toHaveBeenCalledWith(
        tournament.id,
        ORGANIZER,
        "Joy",
      );
    });

    it("lets the owner rename any organizer", async () => {
      await service.renameOrganizer(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OWNER,
        OTHER_ORGANIZER,
        "Officer Jenny",
      );

      expect(tournamentRepo.setStaffName).toHaveBeenCalledWith(
        tournament.id,
        OTHER_ORGANIZER,
        "Officer Jenny",
      );
    });

    it("stores the owner's own name on the owner, not the staff list", async () => {
      await service.renameOrganizer(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OWNER,
        OWNER,
        "Gym Leader Brock",
      );

      expect(tournamentRepo.setOwnerName).toHaveBeenCalledWith(
        tournament.id,
        OWNER,
        "Gym Leader Brock",
      );
      expect(tournamentRepo.setStaffName).not.toHaveBeenCalled();
    });

    it("stops an organizer renaming someone else", async () => {
      await expect(
        service.renameOrganizer(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          ORGANIZER,
          OTHER_ORGANIZER,
          "Nope",
        ),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
      expect(tournamentRepo.setStaffName).not.toHaveBeenCalled();
    });

    it("will not name someone who is not an organizer", async () => {
      await expect(
        service.renameOrganizer(
          LEAGUE_KEY,
          TOURNAMENT_KEY,
          OWNER,
          OUTSIDER,
          "Nope",
        ),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.ORGANIZER_NOT_FOUND.code,
      });
    });
  });

  describe("createInvite", () => {
    it("stores the name and only the hash of the token it returns", async () => {
      const result = await service.createInvite(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OWNER,
        { name: "Misty" },
      );

      const stored = inviteRepo.create.mock.calls[0][0];
      expect(result.created.token).toHaveLength(32);
      expect(stored.tokenHash).toBe(hashInviteToken(result.created.token));
      expect(stored).not.toHaveProperty("token");
      expect(stored.name).toBe("Misty");
    });

    it("is owner-only", async () => {
      await expect(
        service.createInvite(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, {
          name: "Misty",
        }),
      ).rejects.toMatchObject({ code: ErrorCodes.AUTH.FORBIDDEN.code });
      expect(inviteRepo.create).not.toHaveBeenCalled();
    });

    it("caps the number of pending invites", async () => {
      inviteRepo.countPendingByTournament.mockResolvedValue(
        MAX_PENDING_ORGANIZER_INVITES,
      );

      await expect(
        service.createInvite(LEAGUE_KEY, TOURNAMENT_KEY, OWNER, {
          name: "Misty",
        }),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.ORGANIZER_INVITE_LIMIT.code,
      });
    });
  });

  describe("acceptInvite", () => {
    it("adds the caller under the invite's name and consumes the invite", async () => {
      const invite = buildInvite(tournament);
      inviteRepo.findByTokenHash.mockResolvedValue(invite);
      inviteRepo.claim.mockResolvedValue(invite);

      await service.acceptInvite(LEAGUE_KEY, TOURNAMENT_KEY, OUTSIDER, "tok");

      expect(inviteRepo.claim).toHaveBeenCalledWith(
        hashInviteToken("tok"),
        OUTSIDER,
      );
      expect(tournamentRepo.addStaff).toHaveBeenCalledWith(tournament.id, {
        sub: OUTSIDER,
        name: "Misty",
        role: "organizer",
      });
    });

    it("uses the name the invitee chose over the suggested one", async () => {
      const invite = buildInvite(tournament);
      inviteRepo.findByTokenHash.mockResolvedValue(invite);
      inviteRepo.claim.mockResolvedValue(invite);

      await service.acceptInvite(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OUTSIDER,
        "tok",
        "Gym Leader Misty",
      );

      expect(tournamentRepo.addStaff).toHaveBeenCalledWith(
        tournament.id,
        expect.objectContaining({ name: "Gym Leader Misty" }),
      );
    });

    it("rejects an invite issued for a different tournament", async () => {
      inviteRepo.findByTokenHash.mockResolvedValue(
        buildInvite(tournament, { tournamentId: new Types.ObjectId() }),
      );

      await expect(
        service.acceptInvite(LEAGUE_KEY, TOURNAMENT_KEY, OUTSIDER, "tok"),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.ORGANIZER_INVITE_INVALID.code,
      });
      expect(tournamentRepo.addStaff).not.toHaveBeenCalled();
    });

    it("rejects an expired invite", async () => {
      inviteRepo.findByTokenHash.mockResolvedValue(
        buildInvite(tournament, { expiresAt: new Date(Date.now() - 1) }),
      );

      await expect(
        service.acceptInvite(LEAGUE_KEY, TOURNAMENT_KEY, OUTSIDER, "tok"),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.ORGANIZER_INVITE_INVALID.code,
      });
    });

    it("rejects when another request claimed the invite first", async () => {
      inviteRepo.findByTokenHash.mockResolvedValue(buildInvite(tournament));
      inviteRepo.claim.mockResolvedValue(null);

      await expect(
        service.acceptInvite(LEAGUE_KEY, TOURNAMENT_KEY, OUTSIDER, "tok"),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.ORGANIZER_INVITE_INVALID.code,
      });
      expect(tournamentRepo.addStaff).not.toHaveBeenCalled();
    });

    it("leaves the invite unused when the caller is already an organizer", async () => {
      inviteRepo.findByTokenHash.mockResolvedValue(buildInvite(tournament));

      await expect(
        service.acceptInvite(LEAGUE_KEY, TOURNAMENT_KEY, ORGANIZER, "tok"),
      ).rejects.toMatchObject({
        code: ErrorCodes.TOURNAMENT.ALREADY_ORGANIZER.code,
      });
      expect(inviteRepo.claim).not.toHaveBeenCalled();
    });

    it("releases the claim if adding the organizer fails", async () => {
      const invite = buildInvite(tournament);
      inviteRepo.findByTokenHash.mockResolvedValue(invite);
      inviteRepo.claim.mockResolvedValue(invite);
      tournamentRepo.addStaff.mockRejectedValue(new Error("db down"));

      await expect(
        service.acceptInvite(LEAGUE_KEY, TOURNAMENT_KEY, OUTSIDER, "tok"),
      ).rejects.toThrow("db down");
      expect(inviteRepo.release).toHaveBeenCalledWith(invite._id);
    });
  });

  describe("previewInvite", () => {
    it("names the inviter by their organizer name and suggests the invitee's", async () => {
      inviteRepo.findByTokenHash.mockResolvedValue(buildInvite(tournament));

      const result = await service.previewInvite(
        LEAGUE_KEY,
        TOURNAMENT_KEY,
        OUTSIDER,
        "tok",
      );

      expect(result).toMatchObject({
        tournamentName: "Spring Cup",
        leagueName: "Spring League",
        invitedBy: "Brock",
        suggestedName: "Misty",
        alreadyOrganizer: false,
      });
      expect(inviteRepo.claim).not.toHaveBeenCalled();
    });
  });
});
