import { ExternalTournamentService } from "@modules/tournament/sub-modules/external-tournament/external-tournament.service";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

@Injectable()
export class IsDraftOwnerGuard implements CanActivate {
  constructor(private draftService: ExternalTournamentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    return false;
  }
}
