/**
 * Golden-fixture tests for the full v2 replay pipeline (parse -> states ->
 * analysis). Fixtures in __fixtures__ are real Showdown replay logs (plus
 * one synthetic log for edge cases that are hard to find in the wild:
 * Perish Song faints, self-KO after taking damage, ties).
 *
 * The snapshots ARE the spec: any change to attribution, luck, events, or
 * totals shows up as a snapshot diff. Review the diff carefully before
 * updating (`npx jest replay-pipeline -u`) - these fixtures encode edge
 * cases that both the legacy analyzer and earlier v2 versions got wrong.
 */
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { ReplayParseService } from "./replay-parse.service";
import { ReplayStatesService } from "./replay-states.service";
import {
  ReplayAnalysisService,
  ReplayAnalysisResult,
} from "./replay-analysis.service";

const FIXTURES_DIR = join(__dirname, "__fixtures__");

const fixtureNames = readdirSync(FIXTURES_DIR)
  .filter((file) => file.endsWith(".log"))
  .sort();

function runPipeline(log: string) {
  const parsed = new ReplayParseService().parse(log);
  const built = new ReplayStatesService().build(parsed);
  const analysis = new ReplayAnalysisService().analyze(built);
  return { parsed, built, analysis };
}

describe("replay analyzer pipeline", () => {
  describe.each(fixtureNames)("%s", (fixtureName) => {
    const log = readFileSync(join(FIXTURES_DIR, fixtureName), "utf8");
    let analysis: ReplayAnalysisResult;
    let parsed: ReturnType<ReplayParseService["parse"]>;
    let built: ReturnType<ReplayStatesService["build"]>;

    beforeAll(() => {
      ({ parsed, built, analysis } = runPipeline(log));
    });

    it("handles every protocol line without unknown actions or handler errors", () => {
      expect(parsed.unknownActions).toEqual({});
      expect(built.warnings).toEqual([]);
    });

    it("keeps aggregate stats internally consistent", () => {
      const totalKills = analysis.players.reduce(
        (sum, player) => sum + player.total.kills,
        0,
      );
      const totalDeaths = analysis.players.reduce(
        (sum, player) => sum + player.total.deaths,
        0,
      );
      // Self-KOs and unattributed faints produce deaths without kills, so
      // kills can be lower but never higher.
      expect(totalKills).toBeLessThanOrEqual(totalDeaths);

      analysis.players.forEach((player) => {
        [player.luck.moves, player.luck.crits].forEach((luck) => {
          expect(luck.hits).toBeLessThanOrEqual(luck.total);
          expect(luck.expected).toBeGreaterThanOrEqual(0);
          expect(luck.expected).toBeLessThanOrEqual(1);
          expect(luck.actual).toBeGreaterThanOrEqual(0);
          expect(luck.actual).toBeLessThanOrEqual(1);
        });
        player.team.forEach((mon) => {
          [mon.damageDealt, mon.damageTaken, mon.kills].forEach(
            (breakdown) => {
              expect(breakdown.direct).toBeGreaterThanOrEqual(0);
              expect(breakdown.indirect).toBeGreaterThanOrEqual(0);
              expect(breakdown.teammate).toBeGreaterThanOrEqual(0);
            },
          );
          expect(mon.hpRestored).toBeGreaterThanOrEqual(0);
        });
      });

      // Every death should surface as a faint event.
      const faintEvents = analysis.events.filter((event) =>
        event.message.includes("fainted"),
      );
      expect(faintEvents.length).toBe(totalDeaths);
    });

    it("matches the golden analysis snapshot", () => {
      expect(analysis).toMatchSnapshot();
    });

    it("matches the golden parse-warnings snapshot", () => {
      expect(parsed.argValidationWarnings).toMatchSnapshot();
    });
  });
});
