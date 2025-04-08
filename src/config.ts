import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = [
  "MONGODB_USER",
  "MONGODB_PASS",
  "AUTH0_AUDIENCE",
  "AUTH0_ISSUER",
  "AUTH0_API_CLIENT_ID",
  "AUTH0_API_CLIENT_SECRET",
  "PORT",
] as const;

const optionalEnvVars = [
  "DISCORD_TOKEN",
  "OPENAI_API_KEY",
  "APPLICATION_ID",
  "DISCORD_DISABLED",
] as const;

type Config = { [key in (typeof requiredEnvVars)[number]]: string } & Partial<{
  [key in (typeof optionalEnvVars)[number]]: string;
}>;

export const config: Config = Object.fromEntries([
  ...requiredEnvVars.map((key) => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing environment variable: ${key}`);
    return [key, value];
  }),
  ...optionalEnvVars
    .map((key) => {
      const value = process.env[key];
      return value ? [key, value] : null;
    })
    .filter((entry): entry is [string, string] => entry !== null),
]) as Config;
