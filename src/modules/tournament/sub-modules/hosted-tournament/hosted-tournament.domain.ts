export class TournamentRule {
  title: string;
  body: string;

  constructor(props: { title: string; body: string }) {
    this.title = props.title;
    this.body = props.body;
  }
}

export class TournamentRound {
  id: string;
  name: string;
  matchDeadline?: Date;

  constructor(props: { id: string; name: string; matchDeadline?: Date }) {
    this.id = props.id;
    this.name = props.name;
    this.matchDeadline = props.matchDeadline;
  }
}

export class TournamentStage {
  id: string;
  name: string;
  type: "round-robin" | "single-elimination" | "double-elimination" | "custom";
  rounds: TournamentRound[];

  constructor(props: {
    id: string;
    name: string;
    type: "round-robin" | "single-elimination" | "double-elimination" | "custom";
    rounds: TournamentRound[];
  }) {
    this.id = props.id;
    this.name = props.name;
    this.type = props.type;
    this.rounds = props.rounds;
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

export const PLAYOFFS_STAGE_NAME = "Playoffs";

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
  playoffTeamIds: string[];
  stages: TournamentStage[];
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
    playoffTeamIds: string[];
    stages: TournamentStage[];
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
    this.playoffTeamIds = props.playoffTeamIds;
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

  getPlayoffsStage(): TournamentStage | undefined {
    return this.stages.find((stage) => stage.name === PLAYOFFS_STAGE_NAME);
  }
}
