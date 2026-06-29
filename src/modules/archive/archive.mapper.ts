import { getRuleset } from "@core/data/rulesets/rulesets";
import {
  Archive,
  ArchiveMatchTeamV2,
  ArchiveMatchupStats,
  ArchiveMatchupStatsTeam,
  ArchiveMatchupV2,
  ArchiveMatchV1,
  ArchiveMatchV2,
  ArchiveScore,
  ArchiveV1,
  ArchiveV2,
  Stat,
} from "./archive.domain";
import {
  ArchiveDocument,
  ArchiveStatEntity,
  ArchiveStatTuple,
  ArchiveV1Document,
  ArchiveV2Document,
} from "./archive.schema";

// Legacy/raw-inserted archive docs (see migration history) can have missing or
// malformed stat collections, so these helpers tolerate nullish input rather
// than letting a single bad document throw and 500 the whole archives list.
function statTuplesToMap(
  tuples: ArchiveStatTuple[] | null | undefined,
): Map<string, Stat> {
  if (!Array.isArray(tuples)) return new Map();
  return new Map(tuples.map(([pid, stat]) => [pid, new Stat(stat)]));
}

function statEntityMapToDomain(
  map: Map<string, ArchiveStatEntity> | null | undefined,
): Map<string, Stat> {
  if (!map) return new Map();
  return new Map(
    Array.from(map.entries()).map(([pid, stat]) => [pid, new Stat(stat)]),
  );
}

export class ArchiveMapper {
  static fromDatabase(doc: ArchiveDocument): Archive {
    if (doc.archiveType === "ArchiveV2") {
      return ArchiveMapper.v2FromDocument(doc as unknown as ArchiveV2Document);
    }
    return ArchiveMapper.v1FromDocument(doc as unknown as ArchiveV1Document);
  }

  private static identityFromDocument(doc: ArchiveDocument) {
    return {
      id: doc._id.toString(),
      leagueName: doc.leagueName,
      teamName: doc.teamName,
      owner: doc.owner,
      format: doc.format,
      ruleset: doc.ruleset,
      team: (doc.team ?? []).map((pokemon) => pokemon.id),
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  private static v1FromDocument(doc: ArchiveV1Document): ArchiveV1 {
    return new ArchiveV1({
      ...ArchiveMapper.identityFromDocument(doc),
      matches: (doc.matches ?? []).map(
        (match) =>
          new ArchiveMatchV1({
            winner: match.winner,
            teamName: match.teamName,
            stage: match.stage,
            stats: statTuplesToMap(match.stats),
            score: match.score,
            replay: match.replay,
          }),
      ),
    });
  }

  private static v2FromDocument(doc: ArchiveV2Document): ArchiveV2 {
    return new ArchiveV2({
      ...ArchiveMapper.identityFromDocument(doc),
      leagueId: doc.leagueId,
      doc: doc.doc,
      stats: statEntityMapToDomain(doc.stats),
      score: new ArchiveScore(doc.score ?? { wins: 0, losses: 0, diff: "0" }),
      matchups: (doc.matchups ?? []).map(
        (matchup) =>
          new ArchiveMatchupV2({
            teamName: matchup.teamName,
            coach: matchup.coach,
            team: matchup.team,
            paste: matchup.paste,
            pastes: matchup.pastes,
            stage: matchup.stage,
            matches: (matchup.matches ?? []).map(
              (match) =>
                new ArchiveMatchV2({
                  aTeam: new ArchiveMatchTeamV2({
                    stats: statTuplesToMap(match.aTeam?.stats),
                    score: match.aTeam?.score ?? 0,
                  }),
                  bTeam: new ArchiveMatchTeamV2({
                    stats: statTuplesToMap(match.bTeam?.stats),
                    score: match.bTeam?.score ?? 0,
                  }),
                  replay: match.replay,
                  winner: match.winner,
                }),
            ),
            stats: new ArchiveMatchupStats({
              winner: matchup.stats?.winner,
              aTeam: new ArchiveMatchupStatsTeam({
                wins: matchup.stats?.aTeam?.wins ?? 0,
                stats: statEntityMapToDomain(matchup.stats?.aTeam?.stats),
                differential: matchup.stats?.aTeam?.differential ?? 0,
              }),
              bTeam: new ArchiveMatchupStatsTeam({
                wins: matchup.stats?.bTeam?.wins ?? 0,
                stats: statEntityMapToDomain(matchup.stats?.bTeam?.stats),
                differential: matchup.stats?.bTeam?.differential ?? 0,
              }),
            }),
          }),
      ),
    });
  }

  /** Shape consumed by the draft-archives list page (pokemon-draftzone-client Archive model). */
  static toListItem(archive: Archive) {
    return {
      _id: archive.id,
      leagueName: archive.leagueName,
      teamName: archive.teamName,
      owner: archive.owner,
      format: archive.format,
      ruleset: archive.ruleset,
      team: archive.team.map((id) => ({
        id,
        name: getRuleset("Gen9 NatDex").species.get(id)?.name ?? "",
      })),
      score: archive.archiveType === "ArchiveV2" ? archive.score : undefined,
    };
  }

  /** Plain props for constructing a new ArchiveV2 discriminator document. */
  static toV2EntityProps(archive: ArchiveV2) {
    return {
      leagueName: archive.leagueName,
      teamName: archive.teamName,
      owner: archive.owner,
      format: archive.format,
      ruleset: archive.ruleset,
      team: archive.team.map((id) => ({ id })),
      leagueId: archive.leagueId,
      doc: archive.doc,
      stats: archive.stats,
      score: archive.score,
      matchups: archive.matchups.map((matchup) => ({
        teamName: matchup.teamName,
        coach: matchup.coach,
        team: matchup.team,
        paste: matchup.paste,
        pastes: matchup.pastes,
        stage: matchup.stage,
        matches: matchup.matches.map((match) => ({
          aTeam: {
            stats: Array.from(
              match.aTeam.stats.entries(),
            ) as ArchiveStatTuple[],
            score: match.aTeam.score,
          },
          bTeam: {
            stats: Array.from(
              match.bTeam.stats.entries(),
            ) as ArchiveStatTuple[],
            score: match.bTeam.score,
          },
          replay: match.replay,
          winner: match.winner,
        })),
        stats: matchup.stats,
      })),
    };
  }
}
