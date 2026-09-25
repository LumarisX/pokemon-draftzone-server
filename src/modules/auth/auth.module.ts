import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { JwtStrategy } from "./jwt.strategy";
import { ConfigModule } from "@nestjs/config";
import { WsAuthService } from "./ws-auth.service";

@Module({
  imports: [ConfigModule, PassportModule.register({ defaultStrategy: "jwt" })],
  providers: [JwtStrategy, WsAuthService],
  exports: [PassportModule, WsAuthService],
})
export class AuthModule {}
