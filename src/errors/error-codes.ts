export interface ErrorDefinition {
  code: string;
  status: number;
  message: string;
}

export const ErrorCodes = {
  LEAGUE: {
    NOT_FOUND: {
      code: "LR-001",
      status: 404,
      message: "League not found",
    },
    UNAUTHORIZED: {
      code: "LR-002",
      status: 403,
      message: "You do not have permission to access this league",
    },
    INVALID_KEY: {
      code: "LR-003",
      status: 400,
      message: "Invalid league key format",
    },
    SIGNUP_CLOSED: {
      code: "LR-004",
      status: 400,
      message: "League signups are closed",
    },
    ALREADY_SIGNED_UP: {
      code: "LR-005",
      status: 400,
      message: "You are already signed up for this league",
    },
  },
  DIVISION: {
    NOT_FOUND: {
      code: "LR-DIV-001",
      status: 404,
      message: "Division not found",
    },
    NOT_IN_LEAGUE: {
      code: "LR-DIV-002",
      status: 404,
      message: "Division not found in this league",
    },
    INVALID_STATE: {
      code: "LR-DIV-003",
      status: 400,
      message: "Invalid division state",
    },
  },
  TEAM: {
    NOT_FOUND: {
      code: "LR-TEAM-001",
      status: 404,
      message: "Team not found",
    },
    NOT_IN_DIVISION: {
      code: "LR-TEAM-002",
      status: 404,
      message: "Team not found in this division",
    },
    INVALID_ROSTER: {
      code: "LR-TEAM-003",
      status: 400,
      message: "Invalid team roster",
    },
  },
  DRAFT: {
    NOT_YOUR_TURN: {
      code: "DR-001",
      status: 400,
      message: "It is not your turn to draft",
    },
    NOT_FOUND: {
      code: "DR-005",
      status: 404,
      message: "Draft not found",
    },
    INVALID_POKEMON: {
      code: "DR-002",
      status: 400,
      message: "Invalid Pokemon selection",
    },
    ALREADY_DRAFTED: {
      code: "DR-003",
      status: 400,
      message: "This Pokemon has already been drafted",
    },
    DRAFT_COMPLETE: {
      code: "DR-004",
      status: 400,
      message: "Draft is already complete",
    },
    TEAM_ID_NOT_FOUND: {
      code: "DR-006",
      status: 404,
      message: "Draft team ID not found",
    },
  },
  SYSTEM: {
    NO_CONTEXT: {
      code: "SYS-001",
      status: 500,
      message: "Request context not initialized",
    },
    MISSING_CONTEXT: {
      code: "SYS-002",
      status: 500,
      message: "Required context data is missing",
    },
    INTERNAL_ERROR: {
      code: "SYS-003",
      status: 500,
      message: "Internal server error",
    },
    BAD_REQUEST: {
      code: "SYS-004",
      status: 400,
      message: "Bad request",
    },
    NOT_FOUND: {
      code: "SYS-005",
      status: 404,
      message: "API path not found",
    },
  },
  VALIDATION: {
    INVALID_BODY: {
      code: "VAL-001",
      status: 400,
      message: "Invalid request body",
    },
    INVALID_PARAMS: {
      code: "VAL-002",
      status: 400,
      message: "Invalid request parameters",
    },
    MISSING_FIELD: {
      code: "VAL-003",
      status: 400,
      message: "Required field is missing",
    },
  },
  AUTH: {
    UNAUTHORIZED: {
      code: "AUTH-001",
      status: 401,
      message: "Authentication required",
    },
    FORBIDDEN: {
      code: "AUTH-002",
      status: 403,
      message: "Insufficient permissions",
    },
    INVALID_TOKEN: {
      code: "AUTH-003",
      status: 401,
      message: "Invalid authentication token",
    },
  },
  LEAGUE_AD: {
    NOT_FOUND: {
      code: "LR-AD-001",
      status: 404,
      message: "League advertisement not found",
    },
    UNAUTHORIZED_ACCESS: {
      code: "LR-AD-002",
      status: 403,
      message: "You do not have permission to manage this advertisement",
    },
    INVALID_AD_DATA: {
      code: "LR-AD-003",
      status: 400,
      message: "Invalid advertisement data",
    },
  },
  TIER_LIST: {
    NOT_FOUND: {
      code: "LR-TIER-001",
      status: 404,
      message: "Tier list not found",
    },
    INVALID_DATA: {
      code: "LR-TIER-002",
      status: 400,
      message: "Invalid tier list data",
    },
    UPDATE_FAILED: {
      code: "LR-TIER-003",
      status: 500,
      message: "Failed to update tier list",
    },
  },
  SCHEDULE: {
    NOT_FOUND: {
      code: "LR-SCHED-001",
      status: 404,
      message: "Schedule not found",
    },
    INVALID_STAGE: {
      code: "LR-SCHED-002",
      status: 400,
      message: "Invalid stage configuration",
    },
  },

  ARCHIVE: {
    NOT_FOUND: {
      code: "AR-001",
      status: 404,
      message: "Archive not found",
    },
  },

  SPECIES: {
    NOT_FOUND: {
      code: "SPC-001",
      status: 404,
      message: "Species not found",
    },
  },
  MATCHUP: {
    NOT_FOUND: {
      code: "MU-001",
      status: 404,
      message: "Matchup not found",
    },
  },
  REPLAY: {
    INVALID_URL: {
      code: "RA-001",
      status: 400,
      message: "Invalid replay URL format",
    },
    FETCH_FAILED: {
      code: "RA-002",
      status: 500,
      message: "Failed to fetch replay data",
    },
    PARSE_FAILED: {
      code: "RA-003",
      status: 500,
      message: "Failed to parse replay",
    },
  },
  PARAMS: {
    REQUIRED: {
      code: "PARAM-001",
      status: 400,
      message: "Required parameter is missing",
    },
  },
  FORMAT: {
    NOT_FOUND: {
      code: "FMT-001",
      status: 400,
      message: "Format not found",
    },
  },
  FILE: {
    SERVICE_UNAVAILABLE: {
      code: "FILE-001",
      status: 503,
      message: "File upload service is not configured",
    },
    INVALID_METADATA: {
      code: "FILE-002",
      status: 400,
      message: "Invalid file metadata",
    },
    NOT_FOUND: {
      code: "FILE-003",
      status: 404,
      message: "File not found",
    },
  },
} as const;

export type ErrorCodePath =
  | keyof typeof ErrorCodes.LEAGUE
  | keyof typeof ErrorCodes.DIVISION
  | keyof typeof ErrorCodes.TEAM
  | keyof typeof ErrorCodes.DRAFT
  | keyof typeof ErrorCodes.SYSTEM
  | keyof typeof ErrorCodes.VALIDATION
  | keyof typeof ErrorCodes.AUTH
  | keyof typeof ErrorCodes.LEAGUE_AD
  | keyof typeof ErrorCodes.TIER_LIST
  | keyof typeof ErrorCodes.SCHEDULE
  | keyof typeof ErrorCodes.ARCHIVE
  | keyof typeof ErrorCodes.SPECIES
  | keyof typeof ErrorCodes.MATCHUP
  | keyof typeof ErrorCodes.REPLAY
  | keyof typeof ErrorCodes.PARAMS
  | keyof typeof ErrorCodes.FORMAT;
