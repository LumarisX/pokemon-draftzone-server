import {
  SignUpAccessMode,
  SignUpQuestionEntity,
} from "./hosted-tournament.schema";
import { getFormat, Format } from "@core/data/formats/formats";
import { getRuleset, Ruleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { StageDocument } from "@modules/stage/stage.schema";
import { DraftCount } from "@modules/tier-list/tier-list.domain";
import {
  rolesOf,
  StaffMember,
  TournamentRole,
} from "@modules/tournament/tournament-policy";
import {
  TournamentRoundEntity,
  TournamentTradeEntity,
} from "./hosted-tournament.schema";

export class TierRequirement {
  tierId: string;
  required: number;
  max?: number;

  constructor(props: { tierId: string; required: number; max?: number }) {
    this.tierId = props.tierId;
    this.required = props.required;
    this.max = props.max;
  }
}

export class PrizeShare {
  place: number;
  percent: number;

  constructor(props: { place: number; percent: number }) {
    this.place = props.place;
    this.percent = props.percent;
  }
}

export class TournamentRule {
  title: string;
  body: string;

  constructor(props: { title: string; body: string }) {
    this.title = props.title;
    this.body = props.body;
  }
}

export class TournamentForfeit {
  gameDiff: number;
  pokemonDiff: number;

  constructor(props: { gameDiff: number; pokemonDiff: number }) {
    this.gameDiff = props.gameDiff;
    this.pokemonDiff = props.pokemonDiff;
  }
}

export class TournamentDiscordSettings {
  guildId?: string;
  guildName?: string;
  linkedAt?: Date;
  coachRoleId?: string;
  signUpChannelId?: string;
  autoGrantCoachRole?: boolean;

  constructor(props: {
    guildId?: string;
    guildName?: string;
    linkedAt?: Date;
    coachRoleId?: string;
    signUpChannelId?: string;
    autoGrantCoachRole?: boolean;
  }) {
    this.guildId = props.guildId;
    this.guildName = props.guildName;
    this.linkedAt = props.linkedAt;
    this.coachRoleId = props.coachRoleId;
    this.signUpChannelId = props.signUpChannelId;
    this.autoGrantCoachRole = props.autoGrantCoachRole;
  }
}

export class TournamentAdSettings {
  advertise: boolean;
  skillLevelRange?: { from: string; to: string };
  prizeValue?: "0" | "1" | "2" | "3" | "4";
  platforms: string[];

  constructor(props: {
    advertise: boolean;
    skillLevelRange?: { from: string; to: string };
    prizeValue?: "0" | "1" | "2" | "3" | "4";
    platforms?: string[];
  }) {
    this.advertise = props.advertise;
    this.skillLevelRange = props.skillLevelRange;
    this.prizeValue = props.prizeValue;
    this.platforms = props.platforms ?? [];
  }
}

export class TournamentMatchSettings {
  chat: boolean;
  coachReporting: boolean;

  constructor(props: { chat?: boolean; coachReporting?: boolean }) {
    this.chat = props.chat !== false;
    this.coachReporting = props.coachReporting !== false;
  }
}

export class HostedTournament {
  id: string;
  name: string;
  slug: string;
  description?: string;
  signUpDeadline: Date;
  draftStart?: Date;
  draftEnd?: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  owner: string;
  leagueId: string;
  leagueSlug: string;
  leagueName: string;
  archived: boolean;
  staff: StaffMember[];
  ownerName?: { sub: string; name: string };
  tierListId: string;
  rules: TournamentRule[];
  logo?: string;
  discord?: string;
  discordSettings?: TournamentDiscordSettings;
  stages: StageDocument[];
  rounds: TournamentRoundEntity[];
  currentRoundIndex: number;
  trades: TournamentTradeEntity[];
  tradesVersion: number;
  forfeit: TournamentForfeit;
  diffMode: "pokemon" | "game";
  format: Format | null;
  ruleset: Ruleset | null;
  draftCount: DraftCount;
  pointTotal?: number;
  maxTeams?: number;
  signUpQuestions: SignUpQuestionEntity[];
  signUpAccess: SignUpAccessMode;
  signUpToken?: string;
  tradePointLimit?: number;
  tierRequirements: TierRequirement[];
  prizeSplit: PrizeShare[];
  adSettings?: TournamentAdSettings;
  matchSettings?: TournamentMatchSettings;

  constructor(props: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    signUpDeadline: Date;
    draftStart?: Date;
    draftEnd?: Date;
    seasonStart?: Date;
    seasonEnd?: Date;
    owner: string;
    leagueId: string;
    leagueSlug: string;
    leagueName: string;
    archived?: boolean;
    staff?: StaffMember[];
    ownerName?: { sub: string; name: string };
    tierListId: string;
    rules: TournamentRule[];
    logo?: string;
    discord?: string;
    discordSettings?: TournamentDiscordSettings;
    stages: StageDocument[];
    rounds?: TournamentRoundEntity[];
    currentRoundIndex?: number;
    trades?: TournamentTradeEntity[];
    tradesVersion?: number;
    forfeit: TournamentForfeit;
    diffMode: "pokemon" | "game";
    format?: string | null;
    ruleset?: string | null;
    draftCount: DraftCount;
    pointTotal?: number;
    maxTeams?: number;
    signUpQuestions?: SignUpQuestionEntity[];
    signUpAccess?: SignUpAccessMode;
    signUpToken?: string;
    tradePointLimit?: number;
    tierRequirements: TierRequirement[];
    prizeSplit?: PrizeShare[];
    adSettings?: TournamentAdSettings;
    matchSettings?: TournamentMatchSettings;
  }) {
    this.id = props.id;
    this.name = props.name;
    this.slug = props.slug;
    this.description = props.description;
    this.signUpDeadline = props.signUpDeadline;
    this.draftStart = props.draftStart;
    this.draftEnd = props.draftEnd;
    this.seasonStart = props.seasonStart;
    this.seasonEnd = props.seasonEnd;
    this.owner = props.owner;
    this.leagueId = props.leagueId;
    this.leagueSlug = props.leagueSlug;
    this.leagueName = props.leagueName;
    this.archived = props.archived ?? false;
    this.staff = props.staff ?? [];
    this.ownerName = props.ownerName;
    this.tierListId = props.tierListId;
    this.rules = props.rules;
    this.logo = props.logo;
    this.discord = props.discord;
    this.discordSettings = props.discordSettings;
    this.stages = props.stages;
    this.rounds = props.rounds ?? [];
    this.currentRoundIndex = props.currentRoundIndex ?? -1;
    this.trades = props.trades ?? [];
    this.tradesVersion = props.tradesVersion ?? 0;
    this.forfeit = props.forfeit;
    this.diffMode = props.diffMode;
    this.format = props.format ? getFormat(props.format) : null;
    this.ruleset = props.ruleset ? getRuleset(props.ruleset) : null;
    this.draftCount = props.draftCount;
    this.pointTotal = props.pointTotal;
    this.maxTeams = props.maxTeams;
    this.signUpQuestions = props.signUpQuestions ?? [];
    this.signUpAccess = props.signUpAccess ?? "open";
    this.signUpToken = props.signUpToken;
    this.tradePointLimit = props.tradePointLimit;
    this.tierRequirements = props.tierRequirements;
    this.prizeSplit = props.prizeSplit ?? [];
    this.adSettings = props.adSettings;
    this.matchSettings = props.matchSettings;
  }

  get hasTierList(): boolean {
    return this.tierListId !== "";
  }

  requireTierList(operation: string): void {
    if (!this.hasTierList) {
      throw new PDZError(ErrorCodes.TOURNAMENT.TIER_LIST_REQUIRED, {
        tournamentSlug: this.slug,
        operation,
      });
    }
  }

  requireRuleset(operation: string): Ruleset {
    this.requireTierList(operation);
    if (!this.ruleset) {
      throw new PDZError(ErrorCodes.TOURNAMENT.TIER_LIST_REQUIRED, {
        tournamentSlug: this.slug,
        operation,
      });
    }
    return this.ruleset;
  }

  requireFormat(operation: string): Format {
    this.requireTierList(operation);
    if (!this.format) {
      throw new PDZError(ErrorCodes.TOURNAMENT.TIER_LIST_REQUIRED, {
        tournamentSlug: this.slug,
        operation,
      });
    }
    return this.format;
  }

  getRoles(sub: string | undefined): TournamentRole[] {
    return rolesOf(this, sub);
  }

  staffName(sub: string): string | null {
    if (sub === this.owner)
      return this.ownerName?.sub === sub ? this.ownerName.name : null;
    return this.staff.find((member) => member.sub === sub)?.name ?? null;
  }

  getPlayoffsStage(): StageDocument | undefined {
    const bracketStages = this.stages.filter(
      (stage) =>
        stage.type === "single-elimination" ||
        stage.type === "double-elimination",
    );
    if (bracketStages.length === 0) return undefined;
    return bracketStages.reduce((highest, stage) =>
      stage.order > highest.order ? stage : highest,
    );
  }
}
