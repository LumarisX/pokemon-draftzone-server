import { ManagementClient } from "auth0";
import { config } from "../../config";

export async function getManagementToken(): Promise<ManagementClient> {
  return new ManagementClient({
    clientId: config.AUTH0_API_CLIENT_ID,
    clientSecret: config.AUTH0_API_CLIENT_SECRET,
    domain: config.AUTH0_ISSUER,
  });
}
