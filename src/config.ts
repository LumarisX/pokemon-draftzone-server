import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars: string[] = [
  "MONGODB_USER",
  "MONGODB_PASS",
  "AUTH0_AUDIENCE",
  "AUTH0_ISSUER",
  "PORT",
  "DISCORD_TOKEN",
  "APPLICATION_ID",
  "OPENAI_API_KEY",
];

type Config = { [key in (typeof requiredEnvVars)[number]]: string };

export const config: Config = Object.fromEntries(
  requiredEnvVars.map((key) => {
    const value = process.env[key];
    if (!value) throw new Error(`Missing environment variable: ${key}`);
    return [key, value];
  })
) as Config;
