import { config } from "../src/config";
import mongoose from "mongoose";
import { draftCountReport } from "./draftCount";

mongoose
  .connect(
    `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`
  )
  .then(async () => {
    console.log("Connected to Database");
    await draftCountReport();
  })
  .catch((error) => {
    console.error(`Failed to connect to the database: ${error.message}`);
  });
