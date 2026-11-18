import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AccountIdMode = "auth0" | "internal";

@Injectable()
export class AccountIdentityService {
  constructor(private readonly configService: ConfigService) {}

  get mode(): AccountIdMode {
    return this.configService.get<string>("ACCOUNT_ID_MODE") === "internal"
      ? "internal"
      : "auth0";
  }

  get internal(): boolean {
    return this.mode === "internal";
  }
}
