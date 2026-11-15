# Server Audit: Progress

Working file for the server audit that started 2026-11-13. A new session should read this
first; it replaces the chat history. Update it whenever a batch changes state.

**State of the tree (2026-11-14, evening):** every audit batch in section 1 is finished and
reviewed, and all ten draft timer steps in section 4 are done (server and client). All of it is
uncommitted. Both trees typecheck, the client lint is clean; commit only when the owner asks.

Rules that apply to all of it: no code comments, `PDZError` with a leaf from
`pdz-error-codes.ts`, `@core`/`@modules` aliases, never bare `jest` (use
`npx jest --runInBand <path>`), nothing is committed without the owner asking. Known failures
that are not ours: `external-tournament.controller.spec.ts` (expects `tournaments: []`),
the "Ruleset Id not found" message tests in `rulesets.spec.ts` and `data.repository.spec.ts`,
and three `Spread` tag tests in `move.domain.spec.ts`.

---

## 1. Done and reviewed

**Caching (items 8, 22).** `pokemon.domain.ts`, `rulesets.ts`, `data.repository.ts`,
`data.service.ts` and their specs.
- `getRuleset(id)` returns the same instance per id (it used to rebuild Gen 8 and older, the
  ROM hacks and CAP on every call).
- `PDZPokemon.learnset()` is cached per ruleset and species for the life of the process; each
  ruleset shares one `PDZMove` per move. Safe because nothing mutates a move after creation
  (checked) and the learnset never reads the Pokémon's modifiers.
- `GET /data/pokemon` builds each ruleset's list once; the species list is built once.
- Tests: 229 of 230 in pokemon, data and matchup/domain; the one failure is the known ruleset
  message test.

**Small fixes (items 2 to 7, 10, 11, 13, 14, and `MONGODB_URI`).**
- `main.ts`: validation errors no longer carry the request body; only messages are logged;
  `ALLOWED_ORIGINS` entries are trimmed.
- `POST external/matchups/quick`: real DTO (`quick-matchup.dto.ts`), 1 to 20 Pokémon a side.
- `GET planner`: query DTO, 1 to 20 ids.
- The public ads payload no longer returns `owner`.
- `coach.schema.ts`: `teamId` index. `user.schema.ts`: `auth0Sub` unique index (already in Atlas).
- `matchup-view.ts`: `submittedBy` removed from the report view. The client still declares it
  at `league-matchup.model.ts:44` and reads it nowhere; drop that field in the client.
- `business-exception.filter.ts`: catches everything. Cast errors and `URIError` are a 400;
  unknown errors are a 500 in the normal envelope, logged with a stack, nothing internal in
  the body. Errors with `expose: true` and a 4xx status (body too large) keep their status.
- `app.module.ts`: the unused second Mongoose connection is gone. `buildMongoUri()` in
  `core/database/mongo-uri.ts` is used by the app and by Agenda; `MONGODB_URI` overrides the
  hardcoded host.
- `agenda.service.ts`: the job runner never starts in development, including through
  `cancelSkipPick` and `resumeSkipPick`.
- Deleted `replay-analyzer/replay.service.ts` (imported nowhere).
- **Not deleted: `src/config.ts`.** Nothing in `src` imports it, but scripts under `scripts/`
  do. Owner's call.
- Tests: 399 passed across the touched areas; the quick-matchup DTO spec was fixed afterwards
  and passes alone. **Typecheck was not re-run after the last edit.**

**Integrity (items 1, 9, 12, 26, 17).** Done and reviewed 11-14. 355 of 356 tests in those
modules; the failure is the known external-tournament controller test.
- 1: `resolveStageSeedOrder` calls `assertTournamentTeams`.
- 9: outcomes are computed first, then written inside the same transaction as
  `updateSettings`; reopening clears them in the transaction. `recordOutcomes` is gone.
- 26: `decideApplication` and `seatAtRandom` re-read the application inside the transaction.
- 17: `visiblePools` removes non-public pools and their teams from `listTeams` and
  `listTeamsByPool` for outsiders. It uses the draft routes' rule (`isTournamentMember`: any
  coach or organizer in the tournament sees hidden pools), not "members of that pool".
- 12: `deleteBySlugAndOwner` deletes the tournament and its matchups in one transaction and
  throws `DRAFT.NOT_FOUND` for an unknown slug. The tournament module registers the matchup
  schema itself to avoid a circular import. Index on `aTeam._id` added.
- Not run against a real database.

**Privacy (items 16, 18).** Done and reviewed 11-14.
- 16: `stage/domain/roster-visibility.ts` wraps `canSeeTeamPicks`. `ScheduleViewOptions` has a
  required `canSeeRoster`, so the schedule and matchup detail return an empty roster for a
  side the viewer may not see. The matchup analysis route refuses (`MATCHUP.NOT_PARTICIPANT`)
  unless the viewer may see both rosters.
- 18: `affectedPicks` reads drafted Pokémon through `getLatestRoster`, never `team.picks`. The
  log entry omits the team name for a blind pool, and when the pool cannot be resolved. The
  organizer preview names a team only where `canSeeTeamPicks` allows. Pools are read through
  the Draft model registered in `TierListModule` (a `DraftCoreModule` import would be circular).
- Also fixed: `GET .../trades` listed both sides' Pokémon to anyone. It now blanks them unless
  the viewer coaches a team in the trade or may see both rosters.

**Input limits (batch 5).** Done 11-14; caps added to eleven DTO files (pokemon, external
tournament and matchup, tier list, teambuilder, ads, user settings, chat, draft, stage,
bracket, hosted tournament). Most numbers were chosen generously rather than taken from the
client; the full table is in the chat of 11-14. Ones worth a second look if a user reports a
save failing: tier list `notes` 2000, pastes 2000 (they are links), external roster 60, tier
list Pokémon per tier 2000, quick matchup and planner 20.

**State after these batches (11-14):** typecheck clean; 1,838 of 1,841 tests pass across every
touched module, the three failures being the known ones listed at the top. Nothing has been
run against a real database or a booted server. Uncommitted.

## 2. Privacy gaps found by the sweep

Worked 11-14 (evening). Settled:
1. Team pastes in the matchup detail: **not a gap** (owner, 11-14). Once added, a paste has the
   same visibility as the score: public to both sides and spectators, hidden only when the whole
   matchup is (a hidden stage refuses the matchup outright). A pending report's pastes go to the
   same people as its pending score.
2. Fixed: a coach can no longer submit a report while either roster is hidden from them (blind
   pool still drafting), so `NOT_ON_ROSTER` can't be used to probe. New leaf
   `MATCHUP.ROSTERS_HIDDEN` (MU-007, 403), also used by the analysis route in place of
   `NOT_PARTICIPANT` with a reason.
3. Not reachable: a coach's trade is saved `PENDING` without the roster check; only organizers,
   who see every roster, hit `assertRostersValid`.
5. Clean: every `calculatePokemonStandings` caller drops hidden stages, reads approved results
   only, and the teams list attaches records only to rosters the viewer may see.
6. Clean: `settings.changed` logs a fixed whitelist of rule fields; no other log type carries
   names or contact details, and the log never exposes who acted by account.
7. Clean: `owner` is only compared in `analyze()`, never returned; notes go to their own side.
- Chat: clean. Read rules match the policy table, matchup rooms are scoped to the tournament,
  messages expose display name and team, never the account.
- Hall of Fame / outcomes: fixed. While a season runs, the public Hall of Fame and
  `GET .../teams/:team/achievements` computed achievements from every stage, hidden ones
  included. `computeTournamentOutcomes` takes `publicOnly`; both public paths pass it. Final
  results (organizer page and the completion snapshot) still read every stage.
- Tests: stage, tournament, league, chat, log 764 of 765 (the known failure); typecheck clean.

4 and 8, decided 11-14: **the pool `public` flag is dropped** (owner). It is gone from the
schema, both DTOs, the settings update, `findPublicByTournament`, the draft routes and overview
(`loadVisibleContext`, `isMember`), `visiblePools`, `isTournamentMember`, the tournament page's
pool list and the SSE audience (`draftPublic` and the stream's `member` check). Every pool and
its teams are now visible to everyone, including pools created with the old `public: false`
default. Hiding part of a season is done with stage visibility. The client never read the flag.
Old documents still carry the field; an `$unset` is optional (owner runs scripts). Server
draft, tournament, stage, league and agenda tests 1,043 of 1,044 (the known failure).

Original notes, kept for reference:
4. Hidden pools are not filtered from the schedule or matchup payloads. Unverified whether a
   hidden pool's teams can appear in a schedule at all.
5. `calculatePokemonStandings` callers were not checked against blind or hidden rules. They
   are built from played results, so likely fine.
6. `settings.changed` log details (built in `hosted-tournament.service.ts`) were not inspected
   for Discord names or emails.
7. `StageService.getMatchupAnalysis` passes `owner: auth0Id` into the analysis; not traced
   whether it is returned.
8. Hidden pools are visible to any coach or organizer in the tournament, not only that pool's
   members. That is the existing shared rule (`isTournamentMember`); changing it is a decision.

Facts for 4 and 8 (checked 11-14): a pool is hidden by `public: false`, which only the API sets
(no settings UI). Stage seeding takes any approved team, so a hidden pool's teams can be seeded
into a public stage; the schedule, matchup detail, standings, team page and team achievements do
not check pool visibility. Only the teams list, the pool list and the draft routes do.

## 2b. Old briefs (kept for reference; all three batches below are now done)

**Privacy (items 16, 18, plus a sweep).** Files: `src/modules/stage` (not
`tournament-bracket.service.ts` or `domain/matchup-view.ts`), `tournament-tier-list.service.ts`,
`tournament-log`. It created `stage/domain/roster-visibility.ts` and
`schedule-view.spec.ts` and was editing `stage.service.ts` when it stopped.
- 16: the schedule, matchup detail and matchup analysis routes build rosters with no
  blind-draft check. Apply `canSeeTeamPicks`: a viewer who may not see a team's picks gets an
  empty roster for that side.
- 18: `affectedPicks` must read drafted Pokémon (`pickLog`), never `team.picks` (the private
  queue). The log entry lists each Pokémon whose cost changed and the teams affected; a team
  whose pool is still blind is not named. Owner's intent: a tier list may change after a draft
  starts, but it must be clearly on the record for participants.
- Sweep (report only): every place that returns a roster, a queue or pool data, checked
  against blind picks, private queues, hidden pools and hidden stages. Not yet reported.

**Input limits (batch 5).** Only `*.dto.ts` files. It had done pokemon, external tournament and
matchup, tier list, teambuilder, ads, user, chat, draft and stage DTOs and was on
`tournament-bracket.dto.ts`; `hosted-tournament.dto.ts` may be partial. No report yet, so the
limits are **unreviewed**: check each cap against what the client sends before trusting it
(a tier list covers about 1,300 species; do not cap below that).

## 3. Caching and indexes (done 11-14, late)

- **23 done.** `HallOfFameService` caches each running season's achievements (the
  `computeTournamentOutcomes` run) keyed by `achievementsFingerprint`: `seasonFingerprint`
  (per public stage matchup count + latest `updatedAt`, rules, rounds) plus `completedAt`, trade
  ids and statuses, and each public stage's type and seeds. One `fingerprintsByStages` aggregate
  covers the whole league. Team names, logos and coaches are still read fresh on every request,
  so edits show at once. Capped at 200 tournaments. `computeTournamentOutcomes` loads all
  stages' teams in one query, kept in seed order (standings tie-breaks may depend on it).
- **24 done, narrower than planned.** A cached `findBySlug` would serve stale staff lists
  (authorization) and stale `tradesVersion`/`rosterVersion` (the optimistic-concurrency retries
  would keep conflicting), so writes keep `findBySlug`. New `findBySlugCached` is opt-in for
  hot read-only paths; only chat `getMessages` (the 10 s poll) uses it so far. It stores the
  BSON bytes of the raw tournament, league fields, stages and tier list meta
  (`tournament-read-cache.ts`, 10 s TTL, 500 entries) and hydrates a fresh document per hit, so
  no caller shares a mutable object; a spec proves the rebuilt tournament matches a fresh load.
  Schema post hooks on every tournament write (save, update*, findOneAnd*, replace, delete*,
  insertMany, bulkWrite) clear the whole cache, which also catches the tier list, ad and log
  modules that write the collection directly. Not covered by a hook: stage and league writes,
  and a read that lands between a transactional write and its commit; both are bounded by the
  10 s TTL. Other candidates for the cached read: the draft board GETs and schedule/standings,
  but those share `findTournament` with write paths, so each needs a look first.
- **25 done.** Declared: `staff.sub` and `adSettings.advertise + signUpDeadline` on hosted
  tournaments, `owner + createdAt` on archives, `status + closesAt` and `owner + createdAt` on
  external ads. Mongoose `autoIndex` is on, so the next deploy builds any that are missing. The
  three unused `leaguecoaches` indexes (`logoFileKey_1`, `logo_1`, `tournamentId_1`) are not
  declared anywhere, so dropping them in Atlas sticks.
- Tests: chat, tournament, league, stage, draft, log, agenda, archive, ads all pass but the known
  failure; typecheck clean.
- **Client:** `submittedBy` is dropped from `league-matchup.model.ts` (uncommitted in the client).
  A coach whose own queue is hit by a tier list change could get a private warning on the draft
  page (not started, optional).
- **Draft timer**, section 4: all ten steps done. Left over from its defect list: D13's second
  half (an organizer moving the turn with Set Current Pick does not consume that team's queue)
  and D17's "noTimer off restarts a full timer" (kept on purpose: there was no deadline to
  resume). Found on the way: `canBeDraftedWithReason` accepts a banned or untiered Pokémon (the
  new "can still pick" check ignores them, the pick check does not).
- Leftovers noted but not planned: removing a participant leaves the team in stage seeds and
  trades; `findByParticipant` and `findByRoundsInStage` are unused; the sign-up invite token is
  stored in plain text and compared with `===`.

## 4. Draft timer review (read-only, done 2026-11-13)

From reading `draft-engine.service.ts`, `agenda.service.ts`, `domain/pick-order.ts`,
`domain/tier-cost.ts` and the Agenda 6 library source. **Nothing was run.** D1 in particular
should be proved with a test against a real Agenda before fixing.

### How it works, briefly
- Statuses: `PRE_DRAFT`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`. Play and pause are accepted from
  any status. There is no reset.
- `counter` picks the team: round `floor(counter / teams)`, position `counter % teams`,
  reversed on odd rounds for snake. `teams` is every team with that `draftId`, dropped ones
  included.
- `skipTime` is the deadline. `calculateTeamTimer` is `max(30, timerLength / 2^skipCount)`;
  `skipCount` is never reset.
- One `skip-draft-pick` job and one reminder job per draft, kept unique by `data.draftId`.
- Only picks run in a transaction, and only picks take the `pickVersion` lock. Skip, pause,
  play, set current pick, `noTimer` and undraft are plain saves.
- A skipped team may pick later out of turn (`canTeamDraft` allows it while it is behind).

### Defects, most serious first
| # | Problem | Confidence | How often |
| --- | --- | --- | --- |
| D1 | After a timer skip, the handler reschedules the same job document it is running in. Agenda then writes `nextRunAt: null` when the handler returns, so the next team's timer never fires. | Read from library source | Every skip followed by an absent coach |
| D2 | The stale-job branch calls `job.remove()`, which is the same document as the job for the new turn. | Confirmed logic, narrow window | Rare |
| D3 | `reconcileDraftJobs` only deletes. A running draft with no job stays stalled. A crash mid-skip re-runs and penalises twice. | Confirmed | Any lost job is permanent |
| D4 | The skip has no lock and no check that the draft is still on the turn it was scheduled for. A pick at the deadline can be followed by a skip that penalises the team that just picked. | Path confirmed, timing plausible | Rare |
| D5 | Scheduling runs after the pick commits; if it throws, the coach gets a 500 for a pick that worked and no timer exists. | Confirmed | Rare, unrecoverable |
| D6 | `skipToNextActiveTeam` counts slots against the number of teams. In a snake draft of three or more, a run of finished teams ends the draft while one team still has picks. | Confirmed | Occasional in points drafts |
| D7 | An organizer filling the on-clock team's slot while paused does not advance the counter. On resume that team gets a clock it cannot use and is skipped. | Confirmed | Occasional |
| D8 | Play while playing resets the clock. Pause while paused loses the banked time. Play on a completed draft reopens it. | Confirmed | Double clicks |
| D9 | Dropped teams keep their slot and their clock. Moving a team between pools mid-draft changes who `counter` points at, and reshuffles a randomly seeded order. | Confirmed | Late dropouts |
| D10 | A non-sequential draft with a timer runs a clock that means nothing and can end the draft. | Confirmed | Depends on pool setup |
| D11 | A team making up an owed pick while on the clock does not advance or reset the clock. The draft completes on `counter`, leaving skipped teams short. | Confirmed | Common when a team is skipped late |
| D12 | "Done" means roster full or below the cheapest tier cost. A team that cannot afford anything left still gets a clock; with no timer the draft stalls. | Confirmed | Common at the end of points drafts |
| D13 | A queue chain across several teams runs in one transaction with no depth limit. A team moved onto the clock by an organizer does not consume its queue. | Confirmed | Occasional |
| D15 | Deadlines use `setSeconds`, which is local server time, so a long timer is an hour off across a clock change unless the server is UTC. | Plausible | Twice a year |
| D17 | Pause cancels jobs before saving the status. `noTimer` off restarts a full timer, and schedules before it saves. | Confirmed | Small windows |
| D18 | The skip event is sent before the change is saved and carries no new deadline. `canDraftTeams` is computed before the counter advances. Linear sequential drafts send an empty list. | Confirmed | Every skip |

Also: `DS.skipPick` reports success even when the engine did nothing; `scheduleSkipPick` and
`skipTimerPenalty` are unused.

### Decisions (owner, 2026-11-14)
- **A deadline that passed while the server was down:** restart that team's clock with a full
  timer. Never skip for an outage.
- **Make-up picks:** the draft stays open while any team owes a pick. Once the turns have run
  out it shows a "waiting on owed picks" state with no clock, naming each team and how many it
  owes. From there the organizer can draft for a team (exists), replace the coach (exists), or
  use a new **Finish Draft** action that lists who is short and asks for confirmation. Coaches
  who owe a pick are told they are being waited on.
- Each owed pick gets its own clock while the draft is still in turn order (today a team that
  makes one of two owed picks stays on the old deadline).

### Progress (2026-11-14)
- **D1 proved and fixed.** `agenda.lifecycle.spec.ts` runs the real Agenda job processor over
  an in-memory job store that copies `MongoJobRepository`'s save, upsert, state and lock rules
  (installing `mongodb-memory-server` was refused, so no real Mongo). With the old key
  (`data.draftId` only) the first timeout skips and then no job is left; the test fails. Jobs
  are now unique on `data.draftId` plus `data.skipTime`, so each deadline is its own document:
  the handler schedules a new one and the running one is cancelled, never reused. That also
  closes D2 (the stale branch only removes its own document).
- `jest.config.ts` transforms the ESM-only `agenda` package so the spec can load it.
- `resumeSkipPick` and `cancelSkipPick` no longer call `agenda.start()`. Agenda's calls wait
  for the connection on their own; the runner starts once in `onModuleInit`. Before, a skip
  that finished during shutdown restarted the runner.
- **D3, startup half.** `reconcileDraftJobs` runs before the runner starts: it drops jobs for
  drafts with no running timer, reschedules every running timed draft whose deadline is ahead,
  and calls `DraftEngineService.restartClock` (a full turn from now, per the owner's decision)
  for one whose deadline passed while the server was down. The one-minute interval is not done.
- Tests: agenda 19, draft 254, all pass; typecheck clean. Agenda leaves a five-minute
  "still alive" timer per job run, so the spec sets `defaultLockLifetime: 1000`.

**Steps 2 to 5 done (2026-11-14, second session).**
- Step 2: skip jobs carry `counter`; the unique key is `draftId` + `skipTime` + `retryCount`
  (always set, 0 for a turn's own job). The handler drops a job whose counter or deadline no
  longer matches and passes `{ counter, skipTime }` to the engine.
- Step 3: `skipCurrentPick` returns `"skipped" | "stale" | "busy"`. It runs in a transaction,
  takes the `pickVersion` lock, and is `stale` unless the locked draft is still running on the
  expected counter and deadline (D4, and a crash mid-skip can no longer penalise twice). A
  write conflict is `busy`; the handler then creates a *new* retry job 5 s out (the old code
  rescheduled the running job document, the D1 trap again). `inDraftTransaction` (lock, check
  counter and status match what the request loaded, else `DRAFT.CHANGED`) now wraps
  `setCurrentPick`, play, pause, `setNoTimer`, `restartClock` and `setPickAtRound` (which can
  advance the counter). Agenda calls, SSE events and Discord in those paths run after commit
  (fixes the ordering half of D17).
- Organizer Skip: `DS.skipPick` throws `DRAFT.CHANGED` for `busy` and `INVALID_STATE` ("There
  is no turn to skip.") for `stale` instead of reporting success.
- Step 4: `flushSideEffects` runs each effect in its own try/catch and logs; `draftPokemon`
  flushes after the session ends, outside the catch, so a committed pick never returns a 500
  or calls abort after commit (D5).
- Step 5, runtime half: `ensureDraftJobs()` every minute (started after the runner, cleared on
  destroy). A running timed draft whose current deadline has no job that still counts (pending,
  running, or finished without failing) gets `resumeSkipPick`; an overdue one therefore skips
  at once, which is right because the server was up for that deadline. Drafts with no
  `skipTime` are left to startup.
- D15 partly: the deadlines touched here use `Date.now() + seconds * 1000`; `scheduleSkipPick`
  (unused) is deleted.
- Tests: draft and agenda 289, all pass; typecheck clean. New lifecycle tests: busy retry keeps
  firing, the job hands its turn to the engine, a moved turn is dropped, a lost job is
  recreated and fires, a finished deadline is not refired. Not run against real Mongo.

**Steps 6 to 10 done (2026-11-14, third session).**
- Step 6: `POST .../state` takes `play | pause | reopen | finish` (`@IsIn`). Play while running and
  pause while paused do nothing (a double click keeps the clock and the banked time). Play on a
  completed draft and pause before the start are `INVALID_STATE`. **Reopen** (new) takes a
  completed draft back to paused with no clock and logs `REOPEN`; Set Current Pick refuses a
  completed draft. Client: Draft Control shows Reopen Draft (with a confirm) instead of Play
  once complete, and play/pause failures now show a toast.
- Step 7: `getCurrentPickingTeam(draft, rounds)` returns null once every turn has run (it used to
  wrap round the order). `canStillPick` in `tier-cost.ts` replaces the old done check: a team is
  done when dropped, full, or when no undrafted, tiered, unbanned Pokémon fits its budget and
  tier requirements (D12). Advancing walks the pick order to the next team that can pick, with
  no cap and no skip penalty for the teams it passes (D6, D9's clock half). Play does the same
  before starting a clock. Filling the on-clock slot while paused advances and banks a full
  timer (D7). `assignTeams` refuses to move a team in or out of a pool drafting in turns;
  dropping it in place still works (D9's order half). `canTeamDraft` refuses a full roster, in
  any pool.
- Step 8: when the turns run out and someone still can pick, the draft stays `IN_PROGRESS` with
  no clock, posts "Every turn has been taken. Waiting on owed picks from A (2), …" to Discord, and
  completes on the last owed pick. `isDraftComplete` is "every team is done", no longer the
  counter. An on-clock team that makes one owed pick gets a fresh clock for the next (D11).
  **Finish** (new) completes a started draft and logs `FINISH` naming who was short. The pool
  overview carries `owedPicks`. Client: Draft Control shows the waiting line and a Finish Draft
  button (confirm lists who is short); the coach's draft page shows "Waiting on You · N Picks
  Owed"; the Draft Pools card says who is owed.
- Step 9: a pool without turn order never gets a clock (play, Set Current Pick, timer toggle,
  restart); skip is `stale` there; `findRunningTimed` only returns sequential pools.
- Step 10: every turn event (`added`, `updated`, `counter`, `status`) computes `canDraftTeams`,
  `canDraftCounts` and `currentPick` through `turnState()` at send time, after the advance,
  dropping teams that cannot pick. Linear pools now get real `canDraft`/`canDraftCounts` (they
  were empty). The no-mention turn ping names the team.
- Tests: draft, agenda, league, tournament and stage 1,049 of 1,050 (the known external
  tournament failure); new engine tests cover each defect above. Typecheck clean. Client dev
  build and `npm run lint` clean. Not run against real Mongo or a booted server.

### Fix order proposed
1. Stop the running job document being reused (D1, D2). Key each job by its turn, or let the
   handler finish and schedule afterwards. Prove D1 with a real-Agenda test first.
2. Jobs carry the `counter` they were scheduled for; the skip is a no-op if the draft moved
   (D4, double runs).
3. One advance function: the skip opens a transaction, takes the `pickVersion` lock, checks
   the expected counter and status, then writes. Use it for set current pick, play, pause and
   `noTimer` too (D4, D19).
4. Post-commit effects each in their own try/catch; a committed pick never returns a 500 (D5).
5. Startup, and a one-minute interval, recreate a missing job for every running timed draft
   (D3). Decided: a deadline that passed while the server was down restarts the clock. Startup
   is done; the interval is not.
6. Guard transitions: play only from pre-draft or paused, pause only while running, no
   reopening a completed draft without an explicit action (D8, D17).
7. Advancement: bound by pick order length, treat non-approved teams as done, advance past a
   team that cannot pick before starting its clock (D6, D7, D9, D12).
8. Make-up picks as decided above: hold the draft open while picks are owed, a clock per owed
   pick while in turn order, Finish Draft for the organizer (D11).
9. No timer for non-sequential pools (D10).
10. Events after saving, with the new deadline; compute who can draft after the advance;
    `Date.now() + seconds * 1000` for deadlines (D15, D18).

What coaches would notice: consecutive timeouts actually fire, a last-second pick is not
penalised, no error after a pick that worked, a double click no longer resets the clock, and
dropped or exhausted teams stop taking clock time.

### Tests the timer has none of
A real job lifecycle (all Agenda tests are mocked, which is why D1 is invisible); startup
recovery; the pick against skip race; snake back-to-back picks with a skip on the first;
several finished teams in a row; make-up picks on and off the clock; organizer edits while
paused; a dropped team; non-sequential with a timer; a queue chain that fails midway.

---

## 5. Remaining audit findings (all worked 11-14, late)

- **Report vs review race, fixed.** A coach's report saves only while the matchup is not
  approved (`$where` on save; `ALREADY_APPROVED` otherwise). Approve and reject save only while
  the stored report is the one loaded (`report.submittedAt`), and take an optional
  `submittedAt` body field: if the organizer saw a different report, `MATCHUP.REPORT_CHANGED`
  (MU-008, 409). The client sends it from the matchup page and Manage Results, and reloads on a
  409 so the newer report is in front of them with the message.
- **Result + bracket advance, fixed.** An organizer's recorded result, an approved report and an
  advancement override each save and run `applyToTournament` inside one `TransactionRunner`
  transaction (async-local-storage sessions, so the advancement's reads and bulk write join it).
- **SSE access, fixed.** A signed-in stream re-checks access every 60 s
  (`ACCESS_RECHECK_MS`): it reloads the tournament (`findBySlugCached`, for the staff list) and
  the viewer's seats. A dropped or replaced coach and a removed organizer stop getting unmasked
  blind picks within a minute; a failed re-check masks until the next one (fails closed).
- **Legacy replay route, fixed.** v1 and v2 share `replay-analyzer/replay-fetch.ts` (safe
  decode, pattern, 10 s timeout, `ok` check: a missing replay is `INVALID_URL`, a network failure
  `FETCH_FAILED`). v1 now has v2's 20-a-minute throttle. Unreadable lines are returned in
  `warnings` (the client types it as `{ message }[]`, it was always empty) and logged once per
  request. Dead `fromReplayUrl`, `fromReplayFile`, `validateUrl`, `formatUrl` removed.
- **Tier list browse, changed, NOT RUN AGAINST MONGO.** The page is an aggregation that computes
  the Pokémon count and the top tier's first eight in the database and drops the Pokémon map,
  instead of shipping 24-50 full maps. `summarizePokemon` (the JS twin, unit tested) is still
  used by `toSummary` without precomputed counts. Check the browse page's counts and sprites
  against a known list before trusting it; Docker was not running and there is no local mongod.
- **Legality report, sped up.** Each placed Pokémon is built once; the banned-move check is one
  union of learnsets (Smeargle still means every move is used); abilities are one set.
  Spec with the real Gen 9 NatDex ruleset.
- **Chat polling:** with the cached tournament read, a poll is now about four queries (seat:
  coach + teams, matchup for the matchup room, messages). Not pursued further.
- Tests: stage, draft, tier list, replay, chat, tournament, league, agenda and core 1,492 of
  1,494 (the two known failures); typecheck clean. Client dev build and lint clean.

## 6. Where things are

- Client plan for the dashboard work: `pokemon-draftzone-client/docs/dashboard-plan.md`.
- Dashboard, profile, directory, planner cloud saving and the first server follow-ups are
  committed (`657e319` on the server).
- The archive ownership fix is committed (`fb0945b`).
- A database password for user `lumaris` is in the public repo's 2024 history; the owner
  confirmed it was rotated on 2023-12-07 and is no longer valid.
