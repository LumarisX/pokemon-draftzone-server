import type { DiffMode, StandingsRules } from "@modules/stage/domain/scoring";
import type {
  PokemonRecord,
  PokemonStanding,
  StandingsRow,
} from "@modules/stage/domain/standings";
import type { TeamStatus } from "@modules/team/team.schema";

export type DraftForme = { id: string; name: string };

export type RosterRow = {
  id: string;
  name: string;
  cost: number | undefined;
  draftFormes?: DraftForme[];
  missingFromTierList?: true;
};

export type CaptainRosterRow = RosterRow & {
  capt: { tera: boolean | undefined };
};

export type TeamRecord = {
  wins: number;
  draws: number;
  losses: number;
  points: number;
  pokemonDiff: number;
  gameDiff: number;
};

export type TeamPageResponse = {
  id: string;
  slug: string;
  coachId: string;
  isCoach: boolean;
  pointTotal: number | undefined;
  picksHidden: boolean;
  pickCount: number;
  gameName?: string;
  discordName?: string;
  name: string;
  timezone: string;
  coach: string;
  logo: string | undefined;
  draft: (RosterRow & { record?: PokemonRecord })[];
  record?: TeamRecord;
};

export type StandingsView = {
  teamStandings: {
    diffMode: DiffMode;
    rules: StandingsRules;
    teams: StandingsRow[];
  };
  pokemonStandings: PokemonStanding[];
};

export type StandingsResponse = {
  filters: { value: string; label: string }[];
  views: Record<string, StandingsView>;
};

export type TeamListRosterRow = {
  id: string;
  name: string;
  cost: number | undefined;
  tier: string | undefined;
  missingFromTierList?: true;
};

export type TeamListResponse = {
  teams: {
    id: string;
    slug: string;
    teamName: string;
    coachName: string;
    logo: string | undefined;
    pickCount: number;
    status: TeamStatus;
    picksHidden: boolean;
    pool: { poolSlug: string; name: string } | null;
    roster: TeamListRosterRow[];
  }[];
};

export type PoolGroupTeam = {
  id: string;
  slug: string;
  name: string;
  coach: string;
  logo: string | undefined;
  timezone: string;
  isCoach: boolean;
  picksHidden: boolean;
  pickCount: number;
  draft: (CaptainRosterRow & { record?: PokemonRecord })[];
  record?: TeamRecord;
  diffMode?: DiffMode;
};

export type TeamsByPoolResponse = {
  pools: {
    poolSlug: string | null;
    name: string;
    allowDuplicates: boolean;
    teams: PoolGroupTeam[];
  }[];
};
