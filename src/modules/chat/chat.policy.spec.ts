import {
  authorRoleOf,
  canReadChannel,
  canWriteChannel,
  channelNeedsTarget,
  ChatViewer,
  isChannelEnabled,
} from "./chat.policy";

const anonymous: ChatViewer = { isOrganizer: false };
const spectator: ChatViewer = { sub: "auth0|fan", isOrganizer: false };
const organizer: ChatViewer = { sub: "auth0|to", isOrganizer: true };
const coach: ChatViewer = {
  sub: "auth0|coach",
  isOrganizer: false,
  teamId: "team-1",
  draftId: "draft-1",
};

describe("chat policy", () => {
  describe("spectator channel", () => {
    it("is readable without a session", () => {
      expect(canReadChannel("spectator", "", anonymous)).toBe(true);
    });

    it("refuses posts without a session", () => {
      expect(canWriteChannel("spectator", "", anonymous)).toBe(false);
    });

    it("lets any signed-in user post", () => {
      expect(canWriteChannel("spectator", "", spectator)).toBe(true);
    });

    it("lets a coach post too", () => {
      expect(canWriteChannel("spectator", "", coach)).toBe(true);
    });
  });

  describe("tournament channel", () => {
    it("is closed to signed-in non-participants", () => {
      expect(canReadChannel("tournament", "", spectator)).toBe(false);
      expect(canWriteChannel("tournament", "", spectator)).toBe(false);
    });

    it("is open to a coach in the tournament", () => {
      expect(canReadChannel("tournament", "", coach)).toBe(true);
      expect(canWriteChannel("tournament", "", coach)).toBe(true);
    });

    it("is open to organizers", () => {
      expect(canReadChannel("tournament", "", organizer)).toBe(true);
    });
  });

  describe("matchup channel", () => {
    const inMatch: ChatViewer = {
      ...coach,
      matchupTeamIds: ["team-1", "team-2"],
    };
    const outOfMatch: ChatViewer = {
      ...coach,
      teamId: "team-9",
      matchupTeamIds: ["team-1", "team-2"],
    };

    it("admits a coach playing the match", () => {
      expect(canReadChannel("matchup", "matchup-1", inMatch)).toBe(true);
      expect(canWriteChannel("matchup", "matchup-1", inMatch)).toBe(true);
    });

    it("refuses a coach from another team", () => {
      expect(canReadChannel("matchup", "matchup-1", outOfMatch)).toBe(false);
      expect(canWriteChannel("matchup", "matchup-1", outOfMatch)).toBe(false);
    });

    it("refuses a spectator", () => {
      expect(canReadChannel("matchup", "matchup-1", spectator)).toBe(false);
    });

    it("admits organizers", () => {
      expect(canReadChannel("matchup", "matchup-1", organizer)).toBe(true);
    });
  });

  describe("draft channel", () => {
    it("admits a coach in that draft only", () => {
      expect(canReadChannel("draft", "draft-1", coach)).toBe(true);
      expect(canReadChannel("draft", "draft-2", coach)).toBe(false);
    });

    it("refuses a coach with no draft assigned", () => {
      expect(
        canReadChannel("draft", "draft-1", { ...coach, draftId: undefined }),
      ).toBe(false);
    });
  });

  describe("targets", () => {
    it("marks the room-scoped channels", () => {
      expect(channelNeedsTarget("matchup")).toBe(true);
      expect(channelNeedsTarget("draft")).toBe(true);
      expect(channelNeedsTarget("tournament")).toBe(false);
      expect(channelNeedsTarget("spectator")).toBe(false);
    });
  });

  describe("tournament toggles", () => {
    it("closes the matchup room when the organizer turns chat off", () => {
      expect(isChannelEnabled("matchup", { matchupChat: false })).toBe(false);
    });

    it("leaves the other rooms alone", () => {
      const off = { matchupChat: false };
      expect(isChannelEnabled("tournament", off)).toBe(true);
      expect(isChannelEnabled("draft", off)).toBe(true);
      expect(isChannelEnabled("spectator", off)).toBe(true);
    });

    it("is enabled by default", () => {
      expect(isChannelEnabled("matchup", { matchupChat: true })).toBe(true);
    });
  });

  describe("author role", () => {
    it("prefers organizer over coach", () => {
      expect(authorRoleOf({ ...coach, isOrganizer: true })).toBe("organizer");
    });

    it("labels a team's coach", () => {
      expect(authorRoleOf(coach)).toBe("coach");
    });

    it("falls back to spectator", () => {
      expect(authorRoleOf(spectator)).toBe("spectator");
    });
  });
});
