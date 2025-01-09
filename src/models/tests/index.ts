import mongoose from "mongoose";
import { config } from "../../config";

export async function connectDBForTesting(dbName: string) {
  try {
    await mongoose.connect(
      `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`,
      { dbName, autoCreate: true }
    );
  } catch (error) {
    console.log("DB connect error");
  }
}

export async function disconnectDBForTesting() {
  try {
    await mongoose.connection.close();
  } catch (error) {
    console.log("DB disconnect error");
  }
}
