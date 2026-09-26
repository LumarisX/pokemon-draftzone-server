import { TEAM_STATUSES, TeamStatus } from "@modules/team/team.schema";
import {
  SIGNUP_ACCESS_MODES,
  SIGNUP_QUESTION_TYPES,
  SignUpAccessMode,
  SignUpQuestionType,
} from "./hosted-tournament.schema";
import { DraftCountDto } from "@modules/tier-list/tier-list.dto";
import {
  TOURNAMENT_APPLICATION_INTENTS,
  TOURNAMENT_APPLICATION_STATUSES,
  TournamentApplicationIntent,
  TournamentApplicationStatus,
} from "@modules/tournament-application/tournament-application.schema";
import { Transform, Type } from "class-transformer";
import { TIEBREAKERS, Tiebreaker } from "@modules/stage/domain/scoring";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const trimString = ({ value }: { value: unknown }) =>
  typeof value === "string" ? value.trim() : value;

export const SIGN_UP_LIMITS = {
  name: 64,
  gameName: 32,
  discordName: 64,
  teamName: 64,
  timezone: 64,
  logo: 256,
  experience: 500,
  reason: 500,
  answer: 2000,
  answerCount: 50,
} as const;

export class SignUpDto {
  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.name)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.gameName)
  gameName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.discordName)
  discordName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.teamName)
  teamName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.timezone)
  timezone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.logo)
  @IsOptional()
  logo?: string;

  @IsBoolean()
  confirm!: boolean;

  @IsIn(TOURNAMENT_APPLICATION_INTENTS)
  @IsOptional()
  intent?: TournamentApplicationIntent;

  @IsArray()
  @ArrayMaxSize(SIGN_UP_LIMITS.answerCount)
  @ValidateNested({ each: true })
  @Type(() => SignUpAnswerDto)
  @IsOptional()
  answers?: SignUpAnswerDto[];
}

export class SignUpAnswerDto {
  @IsString()
  @MinLength(1)
  questionId!: string;

  @IsArray()
  @ArrayMaxSize(SIGN_UP_LIMITS.answerCount)
  @IsString({ each: true })
  @MaxLength(SIGN_UP_LIMITS.answer, { each: true })
  values!: string[];
}

export class SignUpQuestionDependencyDto {
  @IsString()
  @MinLength(1)
  questionId!: string;

  @IsString()
  equals!: string;
}

export class SignUpQuestionDto {
  @IsString()
  @MinLength(1)
  id!: string;

  @IsString()
  @MinLength(1)
  label!: string;

  @IsString()
  @IsOptional()
  help?: string;

  @IsIn(SIGNUP_QUESTION_TYPES)
  type!: SignUpQuestionType;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  options?: string[];

  @IsBoolean()
  required!: boolean;

  @IsInt()
  @Min(1)
  @Max(SIGN_UP_LIMITS.answer)
  @IsOptional()
  maxLength?: number;

  @ValidateNested()
  @Type(() => SignUpQuestionDependencyDto)
  @IsOptional()
  dependsOn?: SignUpQuestionDependencyDto;

  @IsBoolean()
  @IsOptional()
  archived?: boolean;
}

export class ReplaceCoachDto {
  @IsString()
  @MinLength(1)
  applicationId!: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  outgoingCoachId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.teamName)
  @IsOptional()
  teamName?: string;

  @IsString()
  @MaxLength(SIGN_UP_LIMITS.reason)
  @IsOptional()
  reason?: string;
}

export class DecideApplicationDto {
  @IsIn(TOURNAMENT_APPLICATION_STATUSES)
  status!: TournamentApplicationStatus;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.teamName)
  @IsOptional()
  teamName?: string;
}

export class UpdateTeamDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.teamName)
  @IsOptional()
  teamName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.logo)
  @IsOptional()
  logo?: string;
}

export class UpdateCoachDetailsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.name)
  @IsOptional()
  name?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(SIGN_UP_LIMITS.gameName)
  @IsOptional()
  gameName?: string;

  @IsString()
  @MaxLength(SIGN_UP_LIMITS.discordName)
  @IsOptional()
  discordName?: string;

  @IsString()
  @MaxLength(SIGN_UP_LIMITS.timezone)
  @IsOptional()
  timezone?: string;

  @IsString()
  @MaxLength(SIGN_UP_LIMITS.experience)
  @IsOptional()
  experience?: string;
}

export class TeamAssignmentDto {
  @IsString()
  @MinLength(1)
  teamSlug!: string;

  @IsString()
  @MinLength(1)
  @IsOptional()
  poolSlug?: string | null;

  @IsIn(TEAM_STATUSES)
  @IsOptional()
  status?: TeamStatus;
}

export class AssignTeamsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamAssignmentDto)
  assignments!: TeamAssignmentDto[];
}

export class RuleSectionDto {
  @IsString()
  title!: string;

  @IsString()
  body!: string;
}

export class UpdateRulesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RuleSectionDto)
  ruleSections!: RuleSectionDto[];
}

export class TierRequirementDto {
  @IsString()
  @MinLength(1)
  tierId!: string;

  @IsInt()
  @Min(0)
  required!: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  max?: number | null;
}

export class PrizeShareDto {
  @IsInt()
  @Min(1)
  place!: number;

  @IsInt()
  @Min(0)
  percent!: number;
}

const DISCORD_SNOWFLAKE = /^\d{17,20}$/;

export class TournamentDiscordSettingsDto {
  @Matches(DISCORD_SNOWFLAKE, { message: "coachRoleId must be a Discord ID" })
  @IsOptional()
  coachRoleId?: string;

  @Matches(DISCORD_SNOWFLAKE, {
    message: "signUpChannelId must be a Discord ID",
  })
  @IsOptional()
  signUpChannelId?: string;

  @IsBoolean()
  @IsOptional()
  autoGrantCoachRole?: boolean;
}

export class AdSkillLevelRangeDto {
  @IsString()
  from!: string;

  @IsString()
  to!: string;
}

export class TournamentAdSettingsDto {
  @IsBoolean()
  advertise!: boolean;

  @ValidateNested()
  @Type(() => AdSkillLevelRangeDto)
  @IsOptional()
  skillLevelRange?: AdSkillLevelRangeDto;

  @IsIn(["0", "1", "2", "3", "4"])
  @IsOptional()
  prizeValue?: "0" | "1" | "2" | "3" | "4";

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  platforms?: string[];
}

export const MAX_STANDINGS_POINTS = 10;

export class StandingsPointsDto {
  @IsInt()
  @Min(0)
  @Max(MAX_STANDINGS_POINTS)
  win!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_STANDINGS_POINTS)
  draw!: number;

  @IsInt()
  @Min(0)
  @Max(MAX_STANDINGS_POINTS)
  loss!: number;
}

export class StandingsRulesDto {
  @ValidateNested()
  @Type(() => StandingsPointsDto)
  @IsOptional()
  points?: StandingsPointsDto;

  @IsArray()
  @IsIn(TIEBREAKERS, { each: true })
  @ArrayUnique()
  @ArrayMaxSize(TIEBREAKERS.length)
  @IsOptional()
  tiebreakers?: Tiebreaker[];
}

export class TournamentForfeitDto {
  @IsInt()
  @Min(0)
  gameDiff!: number;

  @IsInt()
  @Min(0)
  pokemonDiff!: number;
}

export class TournamentMatchSettingsDto {
  @IsBoolean()
  @IsOptional()
  chat?: boolean;

  @IsBoolean()
  @IsOptional()
  coachReporting?: boolean;
}

export class UpdateHostedTournamentSettingsDto {
  @IsString()
  @MinLength(1)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  signUpDeadline?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  draftStart?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  draftEnd?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  seasonStart?: Date;

  @IsDate()
  @Type(() => Date)
  @IsOptional()
  seasonEnd?: Date;

  @IsString()
  @IsOptional()
  discord?: string;

  @IsString()
  @IsOptional()
  logo?: string | null;

  @ValidateNested()
  @Type(() => TournamentDiscordSettingsDto)
  @IsOptional()
  discordSettings?: TournamentDiscordSettingsDto;

  @ValidateNested()
  @Type(() => TournamentForfeitDto)
  @IsOptional()
  forfeit?: TournamentForfeitDto;

  @IsIn(["pokemon", "game"])
  @IsOptional()
  diffMode?: "pokemon" | "game";

  @ValidateNested()
  @Type(() => StandingsRulesDto)
  @IsOptional()
  standingsRules?: StandingsRulesDto;

  @IsString()
  @MinLength(1)
  @IsOptional()
  tierListId?: string;

  @ValidateNested()
  @Type(() => DraftCountDto)
  @IsOptional()
  draftCount?: DraftCountDto;

  @IsInt()
  @Min(0)
  @IsOptional()
  pointTotal?: number | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxTeams?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SignUpQuestionDto)
  @IsOptional()
  signUpQuestions?: SignUpQuestionDto[];

  @IsIn(SIGNUP_ACCESS_MODES)
  @IsOptional()
  signUpAccess?: SignUpAccessMode;

  @IsInt()
  @Min(0)
  @IsOptional()
  tradePointLimit?: number | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TierRequirementDto)
  @IsOptional()
  tierRequirements?: TierRequirementDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PrizeShareDto)
  @IsOptional()
  prizeSplit?: PrizeShareDto[];

  @ValidateNested()
  @Type(() => TournamentAdSettingsDto)
  @IsOptional()
  adSettings?: TournamentAdSettingsDto;

  @ValidateNested()
  @Type(() => TournamentMatchSettingsDto)
  @IsOptional()
  matchSettings?: TournamentMatchSettingsDto;

  @IsBoolean()
  @IsOptional()
  archived?: boolean;
}

export class AddOrganizerDto {
  @IsString()
  @MinLength(1)
  coachId!: string;
}

export const ORGANIZER_NAME_MIN = 3;
export const ORGANIZER_NAME_MAX = 24;
export const ORGANIZER_NAME_PATTERN = /^[\p{L}\p{N}](?:[^\p{C}]*[\p{L}\p{N}])?$/u;


export class OrganizerNameDto {
  @Transform(trimString)
  @IsString()
  @Length(ORGANIZER_NAME_MIN, ORGANIZER_NAME_MAX)
  @Matches(ORGANIZER_NAME_PATTERN, {
    message: "name must start and end with a letter or number",
  })
  name!: string;
}

export class CreateOrganizerInviteDto extends OrganizerNameDto {}

export class OrganizerInviteTokenDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  token!: string;
}

export class AcceptOrganizerInviteDto extends OrganizerInviteTokenDto {
  @Transform(trimString)
  @IsString()
  @Length(ORGANIZER_NAME_MIN, ORGANIZER_NAME_MAX)
  @Matches(ORGANIZER_NAME_PATTERN, {
    message: "name must start and end with a letter or number",
  })
  @IsOptional()
  name?: string;
}
