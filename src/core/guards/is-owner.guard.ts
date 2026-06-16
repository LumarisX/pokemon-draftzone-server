import { TournamentService } from "@modules/tournament/tournament.service";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

@Injectable()
export class IsDraftOwnerGuard implements CanActivate {
  constructor(private draftService: TournamentService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    return false;
  }
}
