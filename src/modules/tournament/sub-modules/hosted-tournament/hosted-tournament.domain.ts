import { getFormat, Format } from "@core/data/formats/formats";
import { getRuleset, Ruleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { StageDocument } from "@modules/stage/stage.schema";
import { DraftCount, TierList } from "@modules/tier-list/tier-list.domain";
import {
  TournamentRoundEntity,
  TournamentTradeEntity,
} from "./hosted-tournament.schema";

export class TierRequirement {
  tierName: string;
  required: number;

  constructor(props: { tierName: string; required: number }) {
    this.tierName = props.tierName;
    this.required = props.required;
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
  coachRoleId?: string;
  signUpChannelId?: string;

  constructor(props: {
    guildId?: string;
    coachRoleId?: string;
    signUpChannelId?: string;
  }) {
    this.guildId = props.guildId;
    this.coachRoleId = props.coachRoleId;
    this.signUpChannelId = props.signUpChannelId;
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
  /** The league's URL slug — needed to build client links (/leagues/:leagueSlug/...). */
  leagueSlug: string;
  organizers: string[];
  tierListId: string;
  rules: TournamentRule[];
  logo?: string;
  discord?: string;
  discordSettings?: TournamentDiscordSettings;
  stages: StageDocument[];
  /**
   * The schedule every stage is laid out against. Empty on tournaments that
   * predate the sections-to-stages migration — their stages still carry their
   * own rounds, and `stageRounds()` is what picks between the two.
   */
  rounds: TournamentRoundEntity[];
  /** Index into `rounds`; -1 before the season starts. */
  currentRoundIndex: number;
  trades: TournamentTradeEntity[];
  forfeit: TournamentForfeit;
  diffMode: "pokemon" | "game";
  format: Format;
  ruleset: Ruleset;
  draftCount: DraftCount;
  pointTotal?: number;
  tradePointLimit?: number;
  tierRequirements: TierRequirement[];
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
    organizers: string[];
    tierListId: string;
    rules: TournamentRule[];
    logo?: string;
    discord?: string;
    discordSettings?: TournamentDiscordSettings;
    stages: StageDocument[];
    rounds?: TournamentRoundEntity[];
    currentRoundIndex?: number;
    trades?: TournamentTradeEntity[];
    forfeit: TournamentForfeit;
    diffMode: "pokemon" | "game";
    format: string;
    ruleset: string;
    draftCount: DraftCount;
    pointTotal?: number;
    tradePointLimit?: number;
    tierRequirements: TierRequirement[];
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
    this.organizers = props.organizers;
    this.tierListId = props.tierListId;
    this.rules = props.rules;
    this.logo = props.logo;
    this.discord = props.discord;
    this.discordSettings = props.discordSettings;
    this.stages = props.stages;
    this.rounds = props.rounds ?? [];
    this.currentRoundIndex = props.currentRoundIndex ?? -1;
    this.trades = props.trades ?? [];
    this.forfeit = props.forfeit;
    this.diffMode = props.diffMode;
    this.format = getFormat(props.format);
    this.ruleset = getRuleset(props.ruleset);
    this.draftCount = props.draftCount;
    this.pointTotal = props.pointTotal;
    this.tradePointLimit = props.tradePointLimit;
    this.tierRequirements = props.tierRequirements;
    this.adSettings = props.adSettings;
    this.matchSettings = props.matchSettings;
  }

  validateTierListMatch(tierList: TierList): void {
    if (tierList.format.name !== this.format.name) {
      throw new PDZError(ErrorCodes.TOURNAMENT.FORMAT_MISMATCH, {
        tournamentFormat: this.format.name,
        tierListFormat: tierList.format.name,
      });
    }
    if (tierList.ruleset.name !== this.ruleset.name) {
      throw new PDZError(ErrorCodes.TOURNAMENT.RULESET_MISMATCH, {
        tournamentRuleset: this.ruleset.name,
        tierListRuleset: tierList.ruleset.name,
      });
    }
  }

  getRoles(sub: string | undefined): string[] {
    if (!sub) return [];
    const roles: string[] = [];
    const isOwner = this.owner === sub;
    if (isOwner) roles.push("owner");
    if (isOwner || this.organizers.includes(sub)) roles.push("organizer");
    return roles;
  }

  isOrganizer(sub: string | undefined): boolean {
    return this.getRoles(sub).includes("organizer");
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
