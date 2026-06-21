# League pipeline schema map

Hand-built from the actual schema files (not generated). This diagram reflects only the
**NestJS schema** (`src/modules/**/*.schema.ts`) — the target/current shape going forward.

`League`, `LeagueTournament`, and `TierList` are still also defined in
`src/models/league/*.model.ts` (legacy Mongoose, same MongoDB collection, kept in sync by
hand). `Coach`, `Team`, `Division`, and `Matchup` *used to* have that same dual-schema
split, but have now been fully migrated to Nest-only schemas — see "Migration in
progress" below for the transition risk that creates.

View with the "Markdown Preview Mermaid Support" VS Code extension, or paste the block
into the [Mermaid Live Editor](https://mermaid.live) if you don't have it installed.

```mermaid
erDiagram
    League {
        ObjectId _id PK
        string name
        string leagueKey UK
        string description "optional"
        string owner "auth0/google sub - plain string, NOT a ref"
        string logo "optional"
    }

    LeagueTournament {
        ObjectId _id PK
        string name
        string tournamentKey UK
        string description "optional"
        Date signUpDeadline
        Date draftStart "optional"
        Date draftEnd "optional"
        Date seasonStart "optional"
        Date seasonEnd "optional"
        string owner "auth0 sub, per-tournament"
        string_array organizers "auth0 subs"
        ObjectId league FK "-> League"
        ObjectId tierList FK "-> TierList"
        object_array rules
        string logo "optional"
        string discord "optional"
        object forfeit "gameDiff/pokemonDiff"
        string diffMode "pokemon | game"
        object playoffs "teams[] only; legacy format/matches fields stay unused, not mirrored here"
        object_array stages "embedded subdocs; their _id is what Matchup.round points to"
    }

    Division {
        ObjectId _id PK
        string divisionKey
        string name
        ObjectId tournamentId FK "-> LeagueTournament, required"
        boolean public
        object_array trades "trades[].sideN.team -> Team"
        number currentStage
        object_array stages "embedded subdocs; their _id is what Matchup.round points to"
        object draft
    }

    Team {
        ObjectId _id PK
        ObjectId tournamentId FK "-> LeagueTournament, required"
        ObjectId divisionId FK "-> Division, optional - unset until an organizer assigns it"
        ObjectId coach FK "-> Coach, required, unique (one team per coach)"
        string teamName
        string logo "optional"
        string status "approved | pending | denied - the tournament accepting this team's signup"
        object_array picks
        object_array draft "each entry .picker -> Coach"
        number skipCount
    }

    Coach {
        ObjectId _id PK
        string auth0Id "indexed"
        ObjectId teamId FK "-> Team, required - every signup gets a placeholder Team immediately"
        string name
        string gameName
        string discordName
        string timezone
        string experience
        boolean droppedBefore
        string droppedWhy "optional"
        boolean confirmed
        Date signedUpAt
    }

    LeagueMatchup {
        ObjectId _id PK
        ObjectId round "-> Division.stages[]._id, a SUBDOCUMENT id, not a top-level collection"
        ObjectId division FK "-> Division, indexed"
        object side1 "side1.team -> Team, indexed"
        object side2 "side2.team -> Team, indexed"
        object_array results
        string winner "optional"
        boolean forfeit "optional"
        string status "optional"
    }

    TierList {
        ObjectId _id PK
        string name
        string description "optional"
        string createdBy "auth0 sub"
        ObjectId copiedFrom FK "-> TierList, self-ref, optional"
        Map pokemon
        object_array tiers
        object draftCount
        string format
        string ruleset
        object settings
    }

    League ||--o{ LeagueTournament : "hosts"
    LeagueTournament ||--o{ Division : "has"
    LeagueTournament ||--o| TierList : "drafts from"
    LeagueTournament ||--o{ Team : "hosts signups"
    Division ||--o{ Team : "contains (once assigned)"
    Team ||--|| Coach : "head coach (bidirectional: Team.coach + Coach.teamId)"
    Division ||--o{ LeagueMatchup : "schedules"
    Team }o--o{ LeagueMatchup : "side1/side2 (not a DB-enforced ref)"
    TierList ||--o| TierList : "copiedFrom"
```

## What changed in this migration

- **The relationship chain is now `League ← LeagueTournament ← Division ← Team ← Coach`**,
  each child referencing its direct parent, instead of `Division.teams` being the only way
  to know which division a team is in. `Division.teams` is gone; a division's teams are
  `Team.find({ divisionId })`.
- **`Coach.tournamentId` is gone, replaced by `Coach.teamId`.** Signing up now creates a
  placeholder `Team` immediately (status `"pending"`, no `divisionId` yet) alongside the
  `Coach`, rather than only creating a `Team` once an organizer assigns a division.
- **`Coach.teamName` / `.logo` / `.status` are gone** — they live solely on `Team` now.
  These were genuinely duplicated in the legacy schema (both Coach and Team had them,
  with no guaranteed sync between updates to either) — eliminating the Coach copies closes
  that drift risk, not just tidies up redundant fields.
- **`Coach`↔`Team` is intentionally bidirectional**: `Team.coach` (the head coach) and
  `Coach.teamId` both exist, each for a different fast lookup direction. There's no
  `additionalCoaches` array — multi-coach support, if built later, falls out for free by
  having another `Coach` row point its `teamId` at an existing `Team` without becoming
  `Team.coach`. Deliberately not built yet.
- **Fixed `Coach.tournamentId`'s dead ref** (used to declare `ref: "League"`, which matched
  no registered model — now resolved structurally since the field is gone entirely).
- **Fixed the `stage`/`round` field-name bug**: every `LeagueMatchup` query now
  consistently filters by `round` (the schema's real field) instead of the nonexistent
  `stage` key some call sites used.
- **`LeagueTournament.forfeit`/`.diffMode`** are now in the Nest schema (previously
  legacy-only, same gap class as the `league` field bug from earlier this session).

## Migration in progress — transition risk

The underlying MongoDB collections (`leaguecoaches`, `leagueteams`, `leaguedivisions`,
`leaguematchups`) are unchanged — only the schema shape reading/writing them changed. The
legacy Express `/leagues` route and its `services/league-services/*.ts` helpers still read
the *old* field shapes directly off these same collections (`Coach.tournamentId`/
`teamName`/`logo`/`status`, `Division.teams`). Per an explicit decision this session, that
legacy route is allowed to break — it has not been updated and isn't expected to keep
working.

Existing data still has the *old* shape until the backfill migration runs:
`src/scripts/migrate-coach-team-division-to-nest.ts` (dry-run by default, `--apply` to
write) resolves or creates each coach's `Team`, backfills `Team.tournamentId`/`divisionId`,
and sets `Coach.teamId`. It deliberately does not delete the old fields — that's a manual
cleanup step once the new fields are verified. **Not yet run** — run it once ready to cut
over fully to the new shape.
