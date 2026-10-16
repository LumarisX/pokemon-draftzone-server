import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { HostedTournamentRepository } from "./hosted-tournament.repository";

type CompletedRequest = {
  method: string;
  params?: Record<string, string | undefined>;
  body?: unknown;
};

type CompletedExemption = (request: CompletedRequest) => boolean;

const ALLOW_WHILE_COMPLETED = "tournament:allowWhileCompleted";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const AllowWhileCompleted = (when: CompletedExemption = () => true) =>
  SetMetadata(ALLOW_WHILE_COMPLETED, when);

export const reopensTournament: CompletedExemption = (request) =>
  (request.body as { completed?: unknown } | undefined)?.completed === false;

@Injectable()
export class TournamentOpenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tournamentRepo: HostedTournamentRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<CompletedRequest>();
    if (READ_METHODS.has(request.method.toUpperCase())) return true;

    const leagueSlug = request.params?.["leagueSlug"];
    const tournamentSlug = request.params?.["tournamentSlug"];
    if (!leagueSlug || !tournamentSlug) return true;

    const exemption = this.reflector.getAllAndOverride<
      CompletedExemption | undefined
    >(ALLOW_WHILE_COMPLETED, [context.getHandler(), context.getClass()]);
    if (exemption?.(request)) return true;

    if (!(await this.tournamentRepo.isCompleted(leagueSlug, tournamentSlug)))
      return true;

    throw new PDZError(ErrorCodes.TOURNAMENT.COMPLETED, { tournamentSlug });
  }
}
