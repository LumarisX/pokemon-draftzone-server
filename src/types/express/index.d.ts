import { AuthResult } from "express-oauth2-jwt-bearer";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthResult;
      user?: {
        sub: string;
      };
    }
  }
}
