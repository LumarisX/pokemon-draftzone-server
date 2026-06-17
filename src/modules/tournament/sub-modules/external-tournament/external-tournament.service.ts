import { PokemonService } from "@modules/pokemon/pokemon.service";
import { Injectable } from "@nestjs/common";
import { ID, toID } from "@pkmn/data";
import { ClientSession } from "mongoose";
import { ErrorCodes } from "../../../../errors/error-codes";
import { PDZError } from "../../../../errors/pdz-error";
import { ExternalMatchupRepository } from "./external-matchup/external-matchup.repository";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentDto } from "./external-tournament.dto";
import { ExternalTournamentRepository } from "./external-tournament.repository";
import { ExternalMatchupDocument } from "./external-matchup/external-matchup.schema";

@Injectable()
export class ExternalTournamentService {
  constructor(
    private readonly tournamentRepository: ExternalTournamentRepository,
    private readonly matchupRepository: ExternalMatchupRepository,
    private readonly pokedexService: PokemonService,
  ) {}

  async getTournaments(sub: string) {
    const tournamentDocs = await this.tournamentRepository.findByOwner(sub);
    const tournaments = await Promise.all(
      tournamentDocs.map(async (tournament) => {
        const matchups = await this.matchupRepository.findByTournamentId(
          tournament._id,
        );
        return ExternalTournament.fromDatabase(tournament).toClientPayload(
          matchups,
        );
      }),
    );
    return { drafts: tournaments, tournaments: [] };
  }

  async getTournament(teamId: string, sub: string) {
    const doc = await this.tournamentRepository.findByTournamentAndOwner(
      teamId,
      sub,
    );
    const tournament = ExternalTournament.fromDatabase(doc);
    const matchups = await this.matchupRepository.findByTournamentId(doc._id);
    return tournament.toClientPayload(matchups);
  }

  async createTournament(body: ExternalTournamentDto, sub: string) {
    const tournament = ExternalTournament.fromForm(body, sub);
    await this.tournamentRepository.create(tournament.toDatabasePayload());
    return { message: "Tournament Added" };
  }

  async updateTournament(
    teamId: string,
    sub: string,
    team: ExternalTournamentDto,
  ) {
    await this.tournamentRepository.findByTournamentAndOwner(teamId, sub);
    const tournamentData = ExternalTournament.fromForm(
      team,
      sub,
    ).toDatabasePayload();
    const updatedTournament =
      await this.tournamentRepository.updateByLeagueAndOwner(
        teamId,
        sub,
        tournamentData,
      );
    if (!updatedTournament) throw new PDZError(ErrorCodes.DRAFT.NOT_FOUND);
    return updatedTournament;
  }

  async deleteTournament(teamId: string, sub: string, session?: ClientSession) {
    await this.tournamentRepository.findByTournamentAndOwner(teamId, sub);
    return this.tournamentRepository.deleteByLeagueAndOwner(
      teamId,
      sub,
      session,
    );
  }

  async getTournamentStats(tournamentId: string, sub: string) {
    const tournament = await this.tournamentRepository.findByTournamentAndOwner(
      tournamentId,
      sub,
    );
    const matchups = await this.matchupRepository.findByTournamentId(
      tournament._id,
    );
    const stats = this.compileStats(matchups);
    return { pokemon: Object.values(stats) };
  }

  private compileStats(matchups: ExternalMatchupDocument[]) {
    const stats: Record<
      string,
      {
        pokemon: { id: ID; name: string };
        kills: number;
        brought: number;
        indirect: number;
        deaths: number;
        kdr: number;
        kpg: number;
      }
    > = {};

    for (const matchup of matchups) {
      const matches = Array.isArray(matchup.matches) ? matchup.matches : [];
      for (const game of matches) {
        for (const [pid, teamStats] of game.aTeam.stats) {
          const id = toID(pid);
          if (!(id in stats)) {
            stats[id] = {
              pokemon: { id, name: this.pokedexService.getName(pid) },
              kills: 0,
              brought: 0,
              indirect: 0,
              deaths: 0,
              kdr: 0,
              kpg: 0,
            };
          }
          stats[id].kills += teamStats.kills ?? 0;
          stats[id].brought += teamStats.brought ?? 0;
          stats[id].indirect += teamStats.indirect ?? 0;
          stats[id].deaths += teamStats.deaths ?? 0;
        }
      }
    }

    for (let id in stats) {
      stats[id].kdr = stats[id].kills + stats[id].indirect - stats[id].deaths;
      stats[id].kpg =
        stats[id].brought > 0
          ? (stats[id].kills + stats[id].indirect) / stats[id].brought
          : 0;
    }
    return stats;
  }
}
