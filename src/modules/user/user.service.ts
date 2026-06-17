import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ManagementClient } from "auth0";

@Injectable()
export class UserService {
  constructor(private configService: ConfigService) {}

  async getManagementToken(): Promise<ManagementClient> {
    return new ManagementClient({
      clientId: this.configService.get<string>("AUTH0_API_CLIENT_ID") ?? "",
      clientSecret:
        this.configService.get<string>("AUTH0_API_CLIENT_SECRET") ?? "",
      domain: this.configService.get<string>("AUTH0_API_DOMAIN") ?? "",
    });
  }
}
