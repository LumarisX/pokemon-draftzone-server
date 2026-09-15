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
  mods/        custom Pokémon dex mods (champions regulations, insurgence, radical red)
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

## Vendored Showdown mods

`src/mods/ps-vendor.ts` fetches a mod's data tables straight from
`raw.githubusercontent.com/smogon/pokemon-showdown` at a **pinned commit** and emits
them as TypeScript. Two mods use it today: `src/mods/champions/` and
`src/mods/legends/`. Both are **generated** — run `npm run gen:champions` /
`npm run gen:legends`, never hand-edit the output. Every generated directory exports
a `SOURCE` naming the upstream path and ref it came from, and the specs assert it.

Two traps when composing a vendored mod into a `Dex.mod`:

- The species table key is **`Species`**, not `Pokedex` as the upstream file is
  named, and the parent dex comes from `Scripts` — a mod with no `Scripts.gen`
  resolves its parent wrong and silently inherits nothing.
- A table entry **replaces** the parent entry unless it carries `inherit: true`.
  Upstream files use that flag inconsistently: `gen9legends` formats-data entries set
  only `isNonstandard`, so applying them verbatim strips every `tier`. `legends/index.ts`
  adds `inherit: true` to that table for exactly this reason.

## Champions regulations

Each regulation is its own dex mod, not one dex filtered by an allowlist. The data
lives in `src/mods/champions/{ma,mb,mc}/`.

Composition is a chain, newest first: M-C is the head regulation (upstream keeps it
in `data/mods/champions`), M-B is a delta over M-C, M-A a delta over M-B. Legality
comes from upstream's own `isNonstandard`/`tier` data, so a regulation gates its own
species, items and moves — Iron Ball is absent in M-A, Salamencite only in M-C, and
`strengthsap` has different PP either side of M-C.

Two rules keep this honest:

- **Never derive an older regulation from a moving base.** `@pkmn/mods/champions`
  tracks whatever regulation is current upstream; anything pinned to it silently
  rewrites itself when the package updates. Only the head regulation may float.
- **Upstream keeps just one historical regulation.** When M-C landed, PS renamed
  `championsregma` to `championsregmb` and the M-A data stopped existing upstream.
  M-A is pinned to its final commit for that reason. When the next regulation lands,
  vendor the outgoing one *before* bumping `@pkmn/mods`.

`CHAMPIONS_EXISTS` treats any `isNonstandard` item as illegal, unlike `_exists`,
which exempts `Past` items that have an `itemUser` — that exemption is right for
NatDex and wrong for a regulation, where `Past` means "not in this regulation".

## ZA National Dex

A full national dex roster (1304 species) playing under Legends: Z-A data where that
data exists. The 503 species native to Z-A use Z-A movepools — roughly half the size
of gen 9's — and Mega Starmie, Mega Mawile and Mega Medicham use Z-A's higher Attack.
Everything else falls back to gen 9, movepools included.

**Do not apply `legends/za/formats-data.ts` as ruleset legality.** It marks the 588
non-Z-A species `isNonstandard: "Past"`, which would cut the roster to ~500 and break
every stored draft using a mon outside Z-A — 510 documents at the last sweep. It is
exported as `LEGENDS_ZA_NATIVE_SPECIES` for the "is this native to Z-A" question only.

It is unrelated to Champions: `gen9legends` declares `inherit: 'gen9'`, and the
`champions` mod ships no pokedex override, so Champions legitimately uses the *base*
mega stats. The two mods model the same game for different purposes; do not
cross-apply their data.

## Ruleset changes touch live data

Narrowing any ruleset can orphan stored picks — one unresolvable species 404s the
whole request. Before shipping one, run:

```
npx ts-node -r tsconfig-paths/register scripts/diagnose-ruleset-legality.ts
```

It is read-only and reports every stored species, item, ability and move its own
document's ruleset no longer resolves. There is a standing baseline of ~66 references
across ~37 documents in rulesets nobody has touched (Z-A megas saved under Gen9
NatDex, a Gmax pick, one malformed id) — that is drift from ruleset switching, not a
regression. Judge a change by whether it *adds* to that.

Battle-only formes are not all equal: Palafin-Hero (162 stored picks) and
Aegislash-Blade are deliberately drafted and must stay legal, unlike Morpeko-Hangry
or Mimikyu-Busted. Do not add them to `IRRELEVANT_BATTLE_ONLY_SPECIES`.

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
