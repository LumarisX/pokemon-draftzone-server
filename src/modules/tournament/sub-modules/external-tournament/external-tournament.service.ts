import { PokemonService } from "@modules/pokemon/pokemon.service";
import { Injectable } from "@nestjs/common";
import { ID, toID } from "@pkmn/data";
import { ClientSession } from "mongoose";
import { ExternalMatchup } from "../../../matchup/sub-modules/external-matchup/external-matchup.domain";
import { ExternalTournament } from "./external-tournament.domain";
import { ExternalTournamentRepository } from "./external-tournament.repository";

@Injectable()
export class ExternalTournamentService {
  constructor(
    private readonly tournamentRepository: ExternalTournamentRepository,
    private readonly pokedexService: PokemonService,
  ) {}

  async getTournaments(sub: string): Promise<ExternalTournament[]> {
    const tournaments = await this.tournamentRepository.findByOwner(sub);
    return tournaments;
  }

  async getArchivedTournaments(sub: string): Promise<ExternalTournament[]> {
    return this.tournamentRepository.findArchivedByOwner(sub);
  }

  async archiveTournament(teamId: string, sub: string): Promise<void> {
    await this.tournamentRepository.setArchived(teamId, sub, new Date());
  }

  async unarchiveTournament(teamId: string, sub: string): Promise<void> {
    await this.tournamentRepository.setArchived(teamId, sub, null);
  }

  async getTournament(
    teamId: string,
    sub: string,
  ): Promise<ExternalTournament> {
    const tournament = await this.tournamentRepository.findBySlugAndOwner(
      teamId,
      sub,
    );

    return tournament;
  }

  async createTournament(tournament: ExternalTournament): Promise<void> {
    await this.tournamentRepository.create(tournament);
  }

  async updateTournament(
    teamId: string,
    sub: string,
    tournament: ExternalTournament,
  ): Promise<void> {
    await this.tournamentRepository.updateBySlugAndOwner(
      teamId,
      sub,
      tournament,
    );
  }

  async deleteTournament(teamId: string, sub: string, session?: ClientSession) {
    return this.tournamentRepository.deleteBySlugAndOwner(teamId, sub, session);
  }

  async getTournamentStats(tournamentId: string, sub: string) {
    const tournament = await this.tournamentRepository.findBySlugAndOwner(
      tournamentId,
      sub,
    );

    return this.compileStats(tournament.matchups);
  }

  async getTournamentStatsById(id: string) {
    const tournament = await this.tournamentRepository.findById(id);
    return this.compileStats(tournament.matchups);
  }

  private compileStats(matchups: ExternalMatchup[]) {
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
          if (teamStats.status === "brought") continue;
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

    for (const id in stats) {
      stats[id].kdr = stats[id].kills + stats[id].indirect - stats[id].deaths;
      stats[id].kpg =
        stats[id].brought > 0
          ? (stats[id].kills + stats[id].indirect) / stats[id].brought
          : 0;
    }
    return { pokemon: Object.values(stats) };
  }
}
