import { TransactionRunner } from "@core/database/transaction-runner";
import { nullIfNotFound, PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { LeagueRepository } from "@modules/league/league.repository";
import { TierListRepository } from "@modules/tier-list/tier-list.repository";
import { TierListDocument } from "@modules/tier-list/tier-list.schema";
import { Injectable } from "@nestjs/common";
import { Types } from "mongoose";
import { assertRosterRules } from "./hosted-tournament.domain";
import { CreateTournamentDto } from "./hosted-tournament.dto";
import { HostedTournamentRepository } from "./hosted-tournament.repository";
import {
  HostedTournamentEntity,
  SignUpQuestionEntity,
} from "./hosted-tournament.schema";

export function carriedQuestions(
  questions: readonly SignUpQuestionEntity[],
): SignUpQuestionEntity[] {
  const kept = questions.filter((question) => !question.archived);
  const keptIds = new Set(kept.map((question) => question.id));
  return kept.map(({ dependsOn, ...question }) =>
    dependsOn && keptIds.has(dependsOn.questionId)
      ? { ...question, dependsOn }
      : question,
  );
}

export function carriedSettings(
  source: HostedTournamentEntity,
): Partial<HostedTournamentEntity> {
  return {
    description: source.description,
    logo: source.logo,
    discord: source.discord,
    rules: source.rules,
    signUpQuestions: carriedQuestions(source.signUpQuestions ?? []),
    maxTeams: source.maxTeams,
    forfeit: source.forfeit,
    diffMode: source.diffMode,
    standingsRules: source.standingsRules,
    draftCount: source.draftCount,
    pointTotal: source.pointTotal,
    tradePointLimit: source.tradePointLimit,
    prizeSplit: source.prizeSplit,
    matchSettings: source.matchSettings,
    adSettings: source.adSettings
      ? { ...source.adSettings, advertise: false }
      : undefined,
  };
}

@Injectable()
export class TournamentCreationService {
  constructor(
    private readonly leagueRepo: LeagueRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
    private readonly tierListRepo: TierListRepository,
    private readonly transactions: TransactionRunner,
  ) {}

  async createTournament(
    leagueSlug: string,
    sub: string,
    dto: CreateTournamentDto,
  ) {
    const league = await this.leagueRepo.findBySlug(leagueSlug);
    if (league.owner !== sub)
      throw new PDZError(ErrorCodes.LEAGUE.NOT_OWNER, { leagueSlug });

    const source = dto.copyFrom
      ? await this.tournamentRepo.findPlainInLeague(league._id, dto.copyFrom)
      : null;
    if (dto.copyFrom && !source)
      throw new PDZError(ErrorCodes.TOURNAMENT.COPY_SOURCE_INVALID, {
        copyFrom: dto.copyFrom,
      });

    const sourceTierList = source?.tierList
      ? await nullIfNotFound(
          this.tierListRepo.findDocument(source.tierList.toString()),
        )
      : null;

    const draftCount = dto.draftCount ?? source?.draftCount;
    const diffMode = dto.diffMode ?? source?.diffMode;
    if (!draftCount || !diffMode)
      throw new PDZError(ErrorCodes.TOURNAMENT.INVALID_SETTINGS, {
        reason: "A draft count and a differential mode are required",
      });

    const tierRequirements = sourceTierList
      ? (source?.tierRequirements ?? [])
      : [];
    assertRosterRules({
      tierIds: sourceTierList
        ? new Set(sourceTierList.tiers.map((tier) => tier._id.toString()))
        : null,
      draftCount,
      tierRequirements: tierRequirements.map((requirement) => ({
        tierId: requirement.tierId.toString(),
        required: requirement.required,
        max: requirement.max,
      })),
    });

    const created = await this.transactions.run(async () => {
      const tierListId = sourceTierList
        ? await this.copyTierList(sourceTierList, sub)
        : undefined;

      return this.tournamentRepo.create({
        ...(source ? carriedSettings(source) : {}),
        name: dto.name,
        league: league._id,
        owner: sub,
        ownerName: { sub, name: dto.ownerName },
        staff: [],
        signUpDeadline: dto.signUpDeadline,
        signUpAccess: "closed",
        forfeit: source?.forfeit ?? { gameDiff: 0, pokemonDiff: 0 },
        diffMode,
        draftCount: { min: draftCount.min, max: draftCount.max },
        tierList: tierListId,
        tierRequirements,
      });
    });

    return { tournamentSlug: created.slug };
  }

  private async copyTierList(
    source: TierListDocument,
    sub: string,
  ): Promise<Types.ObjectId> {
    const copy = await this.tierListRepo.create({
      name: source.name,
      description: source.description,
      createdBy: sub,
      format: source.format,
      ruleset: source.ruleset,
      copiedFrom: source._id,
      tiers: source.tiers,
      pokemon: source.pokemon,
      banned: source.banned,
    });
    return new Types.ObjectId(copy.id);
  }
}
