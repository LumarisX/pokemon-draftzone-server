import { MongoBackend } from "@agendajs/mongo-backend";
import { DiscordModule } from "@modules/discord/discord.module";
import { DraftModule } from "@modules/draft/draft.module";
import { HostedTournamentCoreModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament-core.module";
import { TierListModule } from "@modules/tier-list/tier-list.module";
import { UploadsModule } from "@modules/uploads/uploads.module";
import { forwardRef, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Agenda } from "agenda";
import { AGENDA_CLIENT } from "./agenda.constants";
import { AgendaService } from "./agenda.service";

@Module({
  imports: [
    forwardRef(() => DraftModule),
    HostedTournamentCoreModule,
    TierListModule,
    DiscordModule,
    UploadsModule,
  ],
  providers: [
    {
      provide: AGENDA_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const dbUser = configService.get<string>("MONGODB_USER");
        const dbPass = configService.get<string>("MONGODB_PASS");
        const address = `mongodb+srv://${dbUser}:${dbPass}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;
        return new Agenda({
          backend: new MongoBackend({ address, collection: "jobs" }),
        });
      },
    },
    AgendaService,
  ],
  exports: [AgendaService],
})
export class AgendaModule {}
