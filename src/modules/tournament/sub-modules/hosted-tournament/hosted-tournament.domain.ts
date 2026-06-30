import { getFormat, Format } from "@core/data/formats/formats";
import { getRuleset, Ruleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { StageDocument } from "@modules/stage/stage.schema";
import { DraftCount, TierList } from "@modules/tier-list/tier-list.domain";

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

export class HostedTournament {
  id: string;
  name: string;
  tournamentKey: string;
  description?: string;
  signUpDeadline: Date;
  draftStart?: Date;
  draftEnd?: Date;
  seasonStart?: Date;
  seasonEnd?: Date;
  owner: string;
  leagueId: string;
  organizers: string[];
  tierListId: string;
  rules: TournamentRule[];
  logo?: string;
  discord?: string;
  stages: StageDocument[];
  forfeit: TournamentForfeit;
  diffMode: "pokemon" | "game";
  format: Format;
  ruleset: Ruleset;
  draftCount: DraftCount;
  pointTotal?: number;
  tierRequirements: TierRequirement[];

  constructor(props: {
    id: string;
    name: string;
    tournamentKey: string;
    description?: string;
    signUpDeadline: Date;
    draftStart?: Date;
    draftEnd?: Date;
    seasonStart?: Date;
    seasonEnd?: Date;
    owner: string;
    leagueId: string;
    organizers: string[];
    tierListId: string;
    rules: TournamentRule[];
    logo?: string;
    discord?: string;
    stages: StageDocument[];
    forfeit: TournamentForfeit;
    diffMode: "pokemon" | "game";
    format: string;
    ruleset: string;
    draftCount: DraftCount;
    pointTotal?: number;
    tierRequirements: TierRequirement[];
  }) {
    this.id = props.id;
    this.name = props.name;
    this.tournamentKey = props.tournamentKey;
    this.description = props.description;
    this.signUpDeadline = props.signUpDeadline;
    this.draftStart = props.draftStart;
    this.draftEnd = props.draftEnd;
    this.seasonStart = props.seasonStart;
    this.seasonEnd = props.seasonEnd;
    this.owner = props.owner;
    this.leagueId = props.leagueId;
    this.organizers = props.organizers;
    this.tierListId = props.tierListId;
    this.rules = props.rules;
    this.logo = props.logo;
    this.discord = props.discord;
    this.stages = props.stages;
    this.forfeit = props.forfeit;
    this.diffMode = props.diffMode;
    this.format = getFormat(props.format);
    this.ruleset = getRuleset(props.ruleset);
    this.draftCount = props.draftCount;
    this.pointTotal = props.pointTotal;
    this.tierRequirements = props.tierRequirements;
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
