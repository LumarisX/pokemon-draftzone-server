import { CoachDocument, CoachEntity } from "@modules/coach/coach.schema";
import { TeamDocument } from "@modules/team/team.schema";

export type Capability = "draft" | "report" | "chat" | "manageRoster";

export type Seat = {
  teamId: string;
  coachId: string;
  role?: string;
  active: boolean;
};

export type TeamWithCoaches = TeamDocument & { coaches: CoachDocument[] };

export function can(seat: Seat, capability: Capability): boolean {
  return seat.active;
}

export function isActiveCoach(coach: Pick<CoachEntity, "leftAt">): boolean {
  return !coach.leftAt;
}

export function seatFor(coach: CoachDocument, teamId: string): Seat {
  return {
    teamId,
    coachId: coach._id.toString(),
    role: coach.role,
    active: isActiveCoach(coach),
  };
}

export function seatsOnTeam(
  team: TeamWithCoaches,
  sub: string | undefined,
): Seat[] {
  if (!sub) return [];
  const teamId = team._id.toString();

  return (team.coaches ?? [])
    .filter((coach) => coach.auth0Id === sub)
    .map((coach) => seatFor(coach, teamId));
}

export function activeCoaches(team: TeamWithCoaches): CoachDocument[] {
  return (team.coaches ?? []).filter(isActiveCoach);
}

export function actingCoach(
  team: TeamWithCoaches,
  sub: string | undefined,
  capability: Capability,
): CoachDocument | undefined {
  if (!sub) return undefined;
  const teamId = team._id.toString();
  return (team.coaches ?? []).find(
    (coach) => coach.auth0Id === sub && can(seatFor(coach, teamId), capability),
  );
}

export function canOnTeam(
  team: TeamWithCoaches,
  sub: string | undefined,
  capability: Capability,
): boolean {
  return seatsOnTeam(team, sub).some((seat) => can(seat, capability));
}
