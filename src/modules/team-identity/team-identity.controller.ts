import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { Controller, Get, UseGuards } from "@nestjs/common";
import { IdentityPackView, identityCatalog } from "./domain/catalog";
import { SavedIdentity } from "./domain/saved-identities";
import { TeamIdentityRepository } from "./team-identity.repository";

@Controller("team-identities")
export class TeamIdentityController {
  constructor(private readonly identities: TeamIdentityRepository) {}

  @Get()
  getPacks(): IdentityPackView[] {
    return identityCatalog();
  }

  @Get("mine")
  @UseGuards(JwtAuthGuard)
  getMine(@User() sub: string): Promise<SavedIdentity[]> {
    return this.identities.listForOwner(sub);
  }
}
