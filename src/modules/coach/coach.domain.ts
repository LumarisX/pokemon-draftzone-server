import { CoachDocument } from "./coach.schema";

export function isOwnedBy(
  coach: CoachDocument,
  sub: string | undefined,
): boolean {
  if (!sub) return false;
  return coach.auth0Id === sub;
}
