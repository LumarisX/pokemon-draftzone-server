import { User } from "@core/decorators/user.decorator";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import {
  Controller,
  Delete,
  Get,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ArchiveService } from "./archive.service";

@Controller("archive")
@UseGuards(JwtAuthGuard)
export class ArchiveController {
  constructor(private readonly archiveService: ArchiveService) {}

  @Get("teams")
  async listArchives(@User() sub: string) {
    return this.archiveService.listArchivesForOwner(sub);
  }

  @Delete(":teamId")
  async deleteArchive(@Param("teamId") teamId: string) {
    await this.archiveService.deleteArchive(teamId);
    return { message: "Draft deleted" };
  }

  @Get(":teamId/stats")
  async getArchiveStats(@Param("teamId") teamId: string) {
    return this.archiveService.getArchiveStats(teamId);
  }
}
