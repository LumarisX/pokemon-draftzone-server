import { ArchiveMapper } from "@modules/archive/archive.mapper";
import { ArchiveRepository } from "@modules/archive/archive.repository";
import { MySeasonsService } from "@modules/league/my-seasons.service";
import { PokemonMapper } from "@modules/pokemon/pokemon.mapper";
import { ExternalTournament } from "@modules/tournament/sub-modules/external-tournament/external-tournament.domain";
import { ExternalTournamentRepository } from "@modules/tournament/sub-modules/external-tournament/external-tournament.repository";
import { Injectable } from "@nestjs/common";
import {
  achievementsFrom,
  careerFrom,
  orderSeasons,
  ProfileRecord,
  ProfileSeason,
} from "./profile.domain";

function externalRecord(tournament: ExternalTournament): ProfileRecord {
  const score = tournament.getScore();
  return { wins: score.wins, draws: 0, losses: score.losses };
}

@Injectable()
export class ProfileService {
  constructor(
    private readonly seasons: MySeasonsService,
    private readonly externalRepo: ExternalTournamentRepository,
    private readonly archiveRepo: ArchiveRepository,
  ) {}

  async getProfile(sub: string) {
    const [hosted, externalActive, externalCompleted, archives] =
      await Promise.all([
        this.seasons.hosted(sub),
        this.externalRepo.findByOwner(sub),
        this.externalRepo.findCompletedByOwner(sub),
        this.archiveRepo.findAllByOwner(sub),
      ]);

    const hostedRecord = (
      season: (typeof hosted.tournaments)[number],
    ): ProfileRecord | null =>
      season.score
        ? {
            wins: season.score.wins,
            draws: season.score.draws,
            losses: season.score.losses,
          }
        : null;

    const completed: ProfileSeason[] = [
      ...hosted.tournaments
        .filter((season) => season.phase === "completed")
        .map(
          (season): ProfileSeason => ({
            id: `hosted:${season.teamId}`,
            kind: "hosted",
            teamName: season.teamName,
            logo: season.logo ?? null,
            leagueName: season.leagueName,
            tournamentName: season.tournamentName,
            pokemon: season.draft,
            record: hostedRecord(season),
            outcome: season.outcome
              ? {
                  placement: season.outcome.placement,
                  of: season.outcome.of,
                  label: season.outcome.label,
                  champion: season.outcome.champion,
                }
              : null,
            completedAt: season.completedAt
              ? season.completedAt.toISOString()
              : null,
            hosted: {
              leagueSlug: season.leagueSlug,
              tournamentSlug: season.tournamentSlug,
              teamSlug: season.teamSlug,
            },
            external: null,
            archive: null,
          }),
        ),
      ...externalCompleted.map(
        (tournament): ProfileSeason => ({
          id: `external:${tournament.slug}`,
          kind: "external",
          teamName: tournament.teamName,
          logo: null,
          leagueName: tournament.leagueName,
          tournamentName: null,
          pokemon: tournament.team.map(PokemonMapper.toClientPayload),
          record: externalRecord(tournament),
          outcome: null,
          completedAt: tournament.completedAt
            ? tournament.completedAt.toISOString()
            : null,
          hosted: null,
          external: { slug: tournament.slug },
          archive: null,
        }),
      ),
      ...archives.map((archive): ProfileSeason => {
        const item = ArchiveMapper.toListItem(archive);
        return {
          id: `archive:${item._id}`,
          kind: "archive",
          teamName: item.teamName || item.leagueName,
          logo: null,
          leagueName: item.leagueName,
          tournamentName: null,
          pokemon: item.team,
          record: item.score
            ? { wins: item.score.wins, draws: 0, losses: item.score.losses }
            : null,
          outcome: null,
          completedAt: item.completedAt ? item.completedAt.toISOString() : null,
          hosted: null,
          external: null,
          archive: { id: String(item._id) },
        };
      }),
    ];

    return {
      career: careerFrom(
        [
          ...hosted.tournaments.map(hostedRecord),
          ...externalActive.map(externalRecord),
          ...completed
            .filter((season) => season.kind !== "hosted")
            .map((season) => season.record),
        ],
        hosted.tournaments.map((season) => season.outcome),
      ),
      completed: orderSeasons(completed),
      achievements: achievementsFrom(
        hosted.tournaments.flatMap(
          (season) => season.outcome?.achievements ?? [],
        ),
      ),
    };
  }
}
