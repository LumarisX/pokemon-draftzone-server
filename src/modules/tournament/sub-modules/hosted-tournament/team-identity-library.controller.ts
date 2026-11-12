import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { SavedIdentity } from "@modules/team-identity/domain/saved-identities";
import { RenameTeamIdentityDto } from "@modules/team-identity/team-identity.dto";
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  UseGuards,
} from "@nestjs/common";
import { HostedTournamentService } from "./hosted-tournament.service";

@Controller("team-identities/mine")
@UseGuards(JwtAuthGuard)
export class TeamIdentityLibraryController {
  constructor(private readonly tournaments: HostedTournamentService) {}

  @Patch(":id")
  rename(
    @Param("id") id: string,
    @User() sub: string,
    @Body() body: RenameTeamIdentityDto,
  ): Promise<SavedIdentity> {
    return this.tournaments.renameIdentity(sub, id, body.name);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string, @User() sub: string): Promise<void> {
    return this.tournaments.removeIdentity(sub, id);
  }
}
