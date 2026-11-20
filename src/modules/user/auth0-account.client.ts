import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ManagementClient } from "auth0";

const NOT_FOUND = 404;

@Injectable()
export class Auth0AccountClient {
  private client?: ManagementClient;

  constructor(private readonly config: ConfigService) {}

  async deleteUser(signIn: string): Promise<void> {
    try {
      await this.management().users.delete(signIn);
    } catch (error) {
      if ((error as { statusCode?: number } | null)?.statusCode === NOT_FOUND) {
        return;
      }
      throw error;
    }
  }

  private management(): ManagementClient {
    if (!this.client) {
      this.client = new ManagementClient({
        domain: this.config.getOrThrow<string>("AUTH0_API_DOMAIN"),
        clientId: this.config.getOrThrow<string>("AUTH0_API_CLIENT_ID"),
        clientSecret: this.config.getOrThrow<string>("AUTH0_API_CLIENT_SECRET"),
      });
    }
    return this.client;
  }
}
