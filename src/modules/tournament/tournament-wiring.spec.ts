import { AppCacheModule } from "@core/cache/app-cache.module";
import { DatabaseModule } from "@core/database/database.module";
import { StorageModule } from "@core/storage/storage.module";
import { AGENDA_CLIENT } from "@modules/agenda/agenda.constants";
import { ChatModule } from "@modules/chat/chat.module";
import { DraftModule } from "@modules/draft/draft.module";
import { LeagueModule } from "@modules/league/league.modules";
import { StageModule } from "@modules/stage/stage.module";
import { HostedTournamentModule } from "@modules/tournament/sub-modules/hosted-tournament/hosted-tournament.module";
import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { getConnectionToken } from "@nestjs/mongoose";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";

jest.mock("@agendajs/mongo-backend", () => ({ MongoBackend: class {} }));
jest.mock("agenda", () => ({ Agenda: class {} }));

const fakeConnection = {
  models: {},
  model: () => ({}),
  plugin: () => undefined,
  base: { set: () => undefined },
};

@Global()
@Module({
  providers: [{ provide: getConnectionToken(), useValue: fakeConnection }],
  exports: [getConnectionToken()],
})
class FakeDatabase {}

describe("tournament module wiring", () => {
  it("resolves every provider without a database", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        EventEmitterModule.forRoot(),
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
        FakeDatabase,
        DatabaseModule,
        StorageModule,
        AppCacheModule,
        StageModule,
        DraftModule,
        HostedTournamentModule,
        ChatModule,
        LeagueModule,
      ],
    })
      .overrideProvider(AGENDA_CLIENT)
      .useValue({})
      .compile();

    expect(moduleRef).toBeDefined();
  });
});
