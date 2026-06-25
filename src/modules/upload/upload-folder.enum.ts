/**
 * Allow-list of upload destinations. Add an entry here whenever a new
 * module needs image uploads - it's the only change required to extend
 * the generic /uploads endpoint to a new entity type.
 */
export enum UploadFolder {
  TEAM_LOGOS = "team-logos",
  TOURNAMENT_LOGOS = "tournament-logos",
  LEAGUE_LOGOS = "league-logos",
  COACH_AVATARS = "coach-avatars",
  TIER_LIST_IMAGES = "tier-list-images",
}
