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

type ArchivedRequest = {
  method: string;
  params?: Record<string, string | undefined>;
  body?: unknown;
};

type ArchivedExemption = (request: ArchivedRequest) => boolean;

const ALLOW_WHILE_ARCHIVED = "tournament:allowWhileArchived";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export const AllowWhileArchived = (when: ArchivedExemption = () => true) =>
  SetMetadata(ALLOW_WHILE_ARCHIVED, when);

export const unarchivesTournament: ArchivedExemption = (request) =>
  (request.body as { archived?: unknown } | undefined)?.archived === false;

@Injectable()
export class TournamentOpenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tournamentRepo: HostedTournamentRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;

    const request = context.switchToHttp().getRequest<ArchivedRequest>();
    if (READ_METHODS.has(request.method.toUpperCase())) return true;

    const leagueSlug = request.params?.["leagueSlug"];
    const tournamentSlug = request.params?.["tournamentSlug"];
    if (!leagueSlug || !tournamentSlug) return true;

    const exemption = this.reflector.getAllAndOverride<
      ArchivedExemption | undefined
    >(ALLOW_WHILE_ARCHIVED, [context.getHandler(), context.getClass()]);
    if (exemption?.(request)) return true;

    if (!(await this.tournamentRepo.isArchived(leagueSlug, tournamentSlug)))
      return true;

    throw new PDZError(ErrorCodes.TOURNAMENT.ARCHIVED, { tournamentSlug });
  }
}
