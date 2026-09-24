import { Injectable } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { Connection } from "mongoose";

@Injectable()
export class TransactionRunner {
  constructor(@InjectConnection() private readonly connection: Connection) {
    connection.base.set("transactionAsyncLocalStorage", true);
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.connection.transaction(() => work());
  }
}
