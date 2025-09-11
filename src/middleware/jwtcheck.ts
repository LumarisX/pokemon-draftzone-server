import { auth } from "express-oauth2-jwt-bearer";
import { config } from "../config";

export const jwtCheck = auth({
  audience: config.AUTH0_AUDIENCE,
  issuerBaseURL: config.AUTH0_ISSUER,
  tokenSigningAlg: "RS256",
});
