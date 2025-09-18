
import Agenda from "agenda";
import { config } from "./config";

const mongoConnectionString = `mongodb+srv://${config.MONGODB_USER}:${config.MONGODB_PASS}@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase`;

export const agenda = new Agenda({
  db: { address: mongoConnectionString, collection: "jobs" },
});

// Graceful shutdown
async function graceful() {
  await agenda.stop();
  process.exit(0);
}

process.on("SIGTERM", graceful);
process.on("SIGINT", graceful);
