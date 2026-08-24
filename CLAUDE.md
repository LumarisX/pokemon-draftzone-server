# Pokemon DraftZone — Server

NestJS + Mongoose API. The SPA lives in the sibling repo `pokemon-draftzone-client`.

## Commands

| Task | Command |
| --- | --- |
| Dev server (watch) | `npm run start:dev` |
| Typecheck only | `npm run typecheck` |
| Build | `npm run build` |
| Production start | `npm run start:prod` |

Prefer `npm run typecheck` over a full build when you only need to know it compiles.

### Testing

**Never run bare `jest` or `npm test`.** `jest.config.ts` pins `maxWorkers: 4` and a
1GB `workerIdleMemoryLimit` for exactly this reason, but the bare command is still
blocked by a PreToolUse hook. Use:

```
npm run test:safe                             # --runInBand --silent
npx jest --runInBand src/modules/draft        # targeted, preferred
```

Specs sit next to their subject (`league.service.spec.ts`). `jest-extended` matchers
are available globally.

## Layout

```
src/
  main.ts, app.module.ts, config.ts
  core/        cross-cutting: PDZError, slug, cache, filters, decorators,
               logging, storage, static data (formats, rulesets)
  modules/     one folder per domain (see below)
  mods/        custom Pokémon dex mods (insurgence, radical red)
  tests/       fixtures and manual harnesses
scripts/complete/   one-off migration + backfill scripts, already run
docs/               schema notes
```

Import via aliases, not relative paths: `@core/*`, `@modules/*`.
Both `tsconfig.json` paths and Jest `moduleNameMapper` are configured for them.

`strict` is on. Decorators and `emitDecoratorMetadata` are enabled (Nest requires them).

## Module conventions

A domain module is a folder under `src/modules/` with this shape:

```
league.controller.ts     routes, guards, param decorators — no business logic
league.service.ts        business logic
league.repository.ts     all Mongoose access
league.schema.ts         @Schema entity + exported Schema
league.modules.ts        the wiring module
league-core.module.ts    (when needed — see below)
```

**The `-core.module.ts` split matters.** A core module registers only the schema and
repository and exports the repository. Other modules import the *core* module to get
data access without pulling in the full service graph. This is how `draft`, `league`,
and `hosted-tournament` avoid circular imports. When module A needs B's data, import
`BCoreModule`, not `BModule`.

Larger domains nest under `sub-modules/` (e.g.
`tournament/sub-modules/hosted-tournament/`, `matchup/sub-modules/league-matchup/`).

### Controllers

```ts
@Controller("leagues")
export class LeagueController {
  @Get(":leagueSlug")
  async getLeague(@Param("leagueSlug") leagueSlug: string) { ... }

  @Get()
  @UseGuards(JwtAuthGuard)
  async getLeagues(@User() sub: string) { ... }
}
```

- `JwtAuthGuard` for authenticated routes, `RolesGuard` + `@Roles()` for role gates,
  `@OptionalAuth()` when a route serves both.
- `@User()` yields the Auth0 `sub`, not a user document.
- Keep controllers thin — validation and orchestration belong in the service.

### Errors

Throw `PDZError` with a definition from the `ErrorCodes` tree in
`src/core/pdz-error-codes.ts`, never a bare `HttpException` or string:

```ts
throw new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);
throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { teamId });
```

`ErrorCodes` is grouped by domain (`LEAGUE`, `DIVISION`, `ARCHIVE`, `CHAT`,
`VALIDATION`, …), and each leaf carries `code` / `status` / `message`. Add a new leaf
to the right group rather than inventing a status inline.
`BusinessExceptionFilter` shapes the response; a `details.reason` overrides the
default message.

## Identifiers

- A document's own id is a bare `slug`; references to other documents keep a prefix
  (`draftSlug`, `leagueSlug`, `matchupSlug`). ObjectIds were left untouched.
- Generate slugs only with `generateSlug()` from `@core/slug` — it uses
  `crypto.randomBytes` with rejection sampling, because slugs are the only thing
  protecting an unlisted draft's URL. Never `Math.random()`.
- Matchups live at tournament level: `matchups/:matchupSlug`.

## Migrations

`scripts/complete/` holds migration, backfill, rollback, and diagnostic scripts.
Conventions when adding one:

- Write the script and a rollback counterpart; prefer reversible operations.
- **Write and review the script, then let the user run it.** Do not execute
  migrations against a live database yourself.
- Name it by intent: `migrate-*`, `backfill-*`, `rollback-*`, `diagnose-*`, `fix-*`.

## Domain gotchas

- **Legacy draft status:** never compare `=== "PRE_DRAFT"`. Check
  `!["IN_PROGRESS", "PAUSED", "COMPLETED"].includes(status)` — old documents predate
  the explicit value.
- **Optional booleans default to visible.** Flags like a stage's `public` and the
  matchup `matchSettings` toggles are checked as `!== false`, so a missing field
  reads as enabled.
- **Coach↔team links are fragile.** There is no reassignment flow; deleting a coach
  orphans the team and 500s every page in that tournament. See
  `find-orphaned-team-coaches.ts` / `repair-team-coach.ts`.
- **Auth token expiry is expected.** Stock 15/30-day refresh lifetimes; `fertft` log
  noise is normal and is not a tenant misconfiguration.
- **Chat** is one `tournamentmessages` collection with four channels governed by a
  policy table. It is REST-polled by design, not pushed.
- `displayName` overrides the Auth0 `username` default; there was no migration, so
  treat it as optional.
