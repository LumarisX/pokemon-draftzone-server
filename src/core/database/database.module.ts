import { Global, Module } from "@nestjs/common";
import { TransactionRunner } from "./transaction-runner";

@Global()
@Module({
  providers: [TransactionRunner],
  exports: [TransactionRunner],
})
export class DatabaseModule {}
