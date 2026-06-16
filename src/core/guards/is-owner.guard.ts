import { DraftService } from "@modules/draft/draft.service";
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

@Injectable()
export class IsDraftOwnerGuard implements CanActivate {
  constructor(private draftService: DraftService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    return false;
  }
}
