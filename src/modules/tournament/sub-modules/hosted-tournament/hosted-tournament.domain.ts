import { StageDocument } from "@modules/stage/stage.schema";

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

  /**
   * Resolves the playoffs/bracket stage by `type` rather than by name (no
   * more bespoke "Playoffs" stage name to match on). If more than one
   * bracket-typed stage exists, prefers the one with the highest `order`.
   */
  getPlayoffsStage(): StageDocument | undefined {
    const bracketStages = this.stages.filter(
      (stage) =>
        stage.type === "single-elimination" || stage.type === "double-elimination",
    );
    if (bracketStages.length === 0) return undefined;
    return bracketStages.reduce((highest, stage) =>
      stage.order > highest.order ? stage : highest,
    );
  }
}
