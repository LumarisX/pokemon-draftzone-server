import { HostedTournament } from "./hosted-tournament.domain";
import { SignUpDto } from "./hosted-tournament.dto";
import { SubmittedAnswer } from "./signup-questions";

export const TOURNAMENT_EVENTS = {
  applicationSubmitted: "tournament.application.submitted",
  coachSeated: "tournament.coach.seated",
} as const;

export type ApplicationSubmittedEvent = {
  tournament: HostedTournament;
  signUp: Omit<SignUpDto, "discordName"> & {
    teamName: string;
    discordName: string;
  };
  answers: SubmittedAnswer[];
};

export type CoachSeatedEvent = {
  tournament: HostedTournament;
  discordName?: string;
};
