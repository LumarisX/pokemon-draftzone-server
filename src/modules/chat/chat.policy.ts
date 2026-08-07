import { ChatAuthorRole, ChatChannel } from "./chat.schema";

export type ChatViewer = {
  sub?: string;
  isOrganizer: boolean;
  teamId?: string;
  draftId?: string;
  matchupTeamIds?: string[];
};

export type ChatSettings = {
  matchupChat: boolean;
};

const TARGETED_CHANNELS: ChatChannel[] = ["matchup", "draft"];

export function channelNeedsTarget(channel: ChatChannel): boolean {
  return TARGETED_CHANNELS.includes(channel);
}

export function isChannelEnabled(
  channel: ChatChannel,
  settings: ChatSettings,
): boolean {
  if (channel === "matchup") return settings.matchupChat;
  return true;
}

function coachesTournament(viewer: ChatViewer): boolean {
  return !!viewer.teamId;
}

function coachesThisMatchup(viewer: ChatViewer): boolean {
  return (
    !!viewer.teamId && (viewer.matchupTeamIds ?? []).includes(viewer.teamId)
  );
}

function coachesThisDraft(viewer: ChatViewer, target: string): boolean {
  return !!viewer.draftId && viewer.draftId === target;
}

export function canReadChannel(
  channel: ChatChannel,
  target: string,
  viewer: ChatViewer,
): boolean {
  if (channel === "spectator") return true;
  if (viewer.isOrganizer) return true;

  switch (channel) {
    case "tournament":
      return coachesTournament(viewer);
    case "matchup":
      return coachesThisMatchup(viewer);
    case "draft":
      return coachesThisDraft(viewer, target);
  }
}

export function canWriteChannel(
  channel: ChatChannel,
  target: string,
  viewer: ChatViewer,
): boolean {
  if (!viewer.sub) return false;
  if (channel === "spectator") return true;
  return canReadChannel(channel, target, viewer);
}

export function authorRoleOf(viewer: ChatViewer): ChatAuthorRole {
  if (viewer.isOrganizer) return "organizer";
  if (viewer.teamId) return "coach";
  return "spectator";
}
