import debug from "debug";
import http from "http";
import { AddressInfo } from "net";
import { app } from "./app";
import { config } from "./config";
import { startDiscordBot } from "./discord";

const debugLogger = debug("tpl-express-pro:server");
/**
 * Get port from environment and store in Express.
 */
const port: string = normalizePort(config.PORT || "9960");
console.log(`[server]: Server is running on port ${port}`);
app.set("port", port);

/**
 * Create HTTP server.
 */
const server: http.Server = http.createServer(app);

// const wss = new WebSocket.Server({ server });

// wss.on("connection", (ws, req) => {
//   console.log(`${req.headers["user-agent"]} => ${req.url}`);

//   if (req.url) {
//     const [_, main, ...paths] = req.url.split("/");
//     const path = `/${main}`;
//     const subpath = `/${paths.join("/")}`;
//     if (ROUTES[path]) {
//       if (ROUTES[path].ws?.onConnect) {
//         let { emitter, data } = ROUTES[path].ws.onConnect();
//         if (ROUTES[path].subpaths[subpath]?.ws) {
//           ws.on("message", (message) => {
//             ROUTES[path].subpaths[subpath].ws!(
//               ws,
//               message.toString(),
//               emitter,
//               data
//             );
//           });
//         }
//       }
//     }
//   }

//   ws.on("close", () => {
//     console.log("WebSocket connection closed");
//   });
// });

/**
 * Listen on provided port, on all network interfaces.
 */

server.listen(port);
server.on("error", onError);
server.on("listening", onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val: string | number): string {
  return val.toString();
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error: NodeJS.ErrnoException): void {
  if (error.syscall !== "listen") {
    throw error;
  }

  const bind: string =
    typeof port === "string" ? "Pipe " + port : "Port " + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case "EACCES":
      console.error(bind + " requires elevated privileges");
      process.exit(1);
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening(): void {
  const addr: string | AddressInfo | null = server.address();
  const bind: string =
    typeof addr === "string" ? "pipe " + addr : "port " + addr?.port;
  debugLogger("Listening on " + bind);
}

export const bot = startDiscordBot();
