import { ConfigService } from "@nestjs/config";

export function buildMongoUri(configService: ConfigService): string {
  const override = configService.get<string>("MONGODB_URI");
  if (override) return override;

  const dbUser = encodeURIComponent(
    configService.get<string>("MONGODB_USER") ?? "",
  );
  const dbPass = encodeURIComponent(
    configService.get<string>("MONGODB_PASS") ?? "",
  );
  return `mongodb+srv://${dbUser}:${dbPass}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;
}
