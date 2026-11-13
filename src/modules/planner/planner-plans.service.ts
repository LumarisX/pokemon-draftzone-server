import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import { HostedTournamentRepository } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.repository";
import { Injectable } from "@nestjs/common";
import {
  isPlanKey,
  MAX_PLAN_KEYS,
  sanitizePlans,
  tournamentOfKey,
} from "./planner-plans.domain";
import { PlannerPlansRepository } from "./planner-plans.repository";

@Injectable()
export class PlannerPlansService {
  constructor(
    private readonly plansRepo: PlannerPlansRepository,
    private readonly tournamentRepo: HostedTournamentRepository,
  ) {}

  async get(sub: string, key: unknown) {
    const doc = await this.plansRepo.find(sub, this.key(key));
    return { plans: doc?.plans ?? null, revision: doc?.revision ?? 0 };
  }

  async save(sub: string, key: unknown, revision: unknown, plans: unknown) {
    const planKey = this.key(key);
    const base =
      typeof revision === "number" && Number.isInteger(revision) && revision > 0
        ? revision
        : 0;
    const clean = sanitizePlans(plans);

    if (base === 0 && (await this.plansRepo.countByOwner(sub)) >= MAX_PLAN_KEYS)
      throw new PDZError(ErrorCodes.PLANNER.TOO_MANY);

    const next =
      base === 0
        ? await this.plansRepo.insert(sub, planKey, clean)
        : await this.plansRepo.replace(sub, planKey, base, clean);
    if (next === null) throw new PDZError(ErrorCodes.PLANNER.STALE);
    return { revision: next };
  }

  async list(sub: string) {
    const docs = await this.plansRepo.findAllByOwner(sub);
    return {
      planners: await Promise.all(
        docs
          .filter((doc) => doc.plans.some((plan) => plan.team.length > 0))
          .map(async (doc) => ({
            key: doc.key,
            updatedAt: doc.updatedAt ?? null,
            tournament: await this.tournament(doc.key),
            plans: doc.plans
              .filter((plan) => plan.team.length > 0)
              .map((plan) => ({
                name: plan.draftName,
                format: plan.format,
                ruleset: plan.ruleset,
                size: plan.team.length,
              })),
          })),
      ),
    };
  }

  private key(key: unknown): string {
    if (!isPlanKey(key))
      throw new PDZError(ErrorCodes.VALIDATION.INVALID_PARAMS, { key });
    return key;
  }

  private async tournament(key: string) {
    const slugs = tournamentOfKey(key);
    if (!slugs) return null;
    try {
      const tournament = await this.tournamentRepo.findBySlug(
        slugs.leagueSlug,
        slugs.tournamentSlug,
      );
      return {
        ...slugs,
        name: tournament.name,
        leagueName: tournament.leagueName,
      };
    } catch {
      return { ...slugs, name: null, leagueName: null };
    }
  }
}
