import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars: string[] = [
  "MONGODB_USER",
  "MONGODB_PASS",
  "AUTH0_AUDIENCE",
  "AUTH0_ISSUER",
  "PORT",
];

const optionalEnvVars: string[] = [
  "DISCORD_TOKEN",
  "OPENAI_API_KEY",
  "DISCORD_DISABLED",
];

type Config = { [key in (typeof requiredEnvVars)[number]]: string };

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
