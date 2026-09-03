import { getRuleset } from "@core/data/rulesets/rulesets";
import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { Injectable } from "@nestjs/common";
import {
  createSet,
  getStatSystem,
  LegalityIssue,
  StatSystem,
  validateSet,
} from "@pdz/sets";
import { SaveTeamDto } from "./teambuilder-team.dto";
import { TeambuilderTeamRepository } from "./teambuilder-team.repository";
import {
  PokemonSetEntity,
  TEAM_MAX_SETS,
  TeambuilderTeamDocument,
  TeamContextType,
} from "./teambuilder-team.schema";

export interface TeamView {
  slug: string;
  name: string;
  ruleset: string;
  level: number;
  context: { type: TeamContextType; id: string };
  sets: PokemonSetEntity[];
  issues: { index: number; issues: LegalityIssue[] }[];
}

@Injectable()
export class TeambuilderTeamService {
  constructor(private readonly teamRepo: TeambuilderTeamRepository) {}

  async listByContext(
    userSub: string,
    type: TeamContextType,
    id: string,
  ): Promise<TeamView[]> {
    const teams = await this.teamRepo.findByContext(userSub, type, id);
    return teams.map((team) => this.toView(team));
  }

  async get(userSub: string, slug: string): Promise<TeamView> {
    const team = await this.teamRepo.findBySlug(userSub, slug);
    if (!team) {
      throw new PDZError(ErrorCodes.TEAMBUILDER.TEAM_NOT_FOUND, { slug });
    }
    return this.toView(team);
  }

  async create(userSub: string, dto: SaveTeamDto): Promise<TeamView> {
    const team = await this.teamRepo.create(userSub, this.toEntity(dto));
    return this.toView(team);
  }

  async save(
    userSub: string,
    slug: string,
    dto: SaveTeamDto,
  ): Promise<TeamView> {
    const team = await this.teamRepo.upsertBySlug(
      userSub,
      slug,
      this.toEntity(dto),
    );
    return this.toView(team);
  }

  private toEntity(dto: SaveTeamDto) {
    if (dto.sets.length > TEAM_MAX_SETS) {
      throw new PDZError(ErrorCodes.TEAMBUILDER.TOO_MANY_SETS, {
        max: TEAM_MAX_SETS,
      });
    }
    getRuleset(dto.ruleset);

    return {
      context: { type: dto.context.type, id: dto.context.id ?? "" },
      name: dto.name ?? "",
      ruleset: dto.ruleset,
      level: dto.level,
      sets: dto.sets as PokemonSetEntity[],
    };
  }

  async remove(userSub: string, slug: string): Promise<void> {
    const deleted = await this.teamRepo.deleteBySlug(userSub, slug);
    if (!deleted) {
      throw new PDZError(ErrorCodes.TEAMBUILDER.TEAM_NOT_FOUND, { slug });
    }
  }

  private statRulesFor(rulesetId: string): StatSystem {
    try {
      return getRuleset(rulesetId).statRules;
    } catch {
      return getStatSystem(undefined);
    }
  }

  private toView(team: TeambuilderTeamDocument): TeamView {
    const statRules = this.statRulesFor(team.ruleset);
    return {
      slug: team.slug,
      name: team.name,
      ruleset: team.ruleset,
      level: team.level,
      context: { type: team.context.type, id: team.context.id },
      sets: team.sets,
      issues: team.sets.map((set, index) => ({
        index,
        issues: validateSet(createSet(set), statRules),
      })),
    };
  }
}
