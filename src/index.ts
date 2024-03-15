#!/usr/bin/env node

/**
 * Module dependencies.
 */

import app from "./app";
import debug from "debug";
import http from "http";
import { AddressInfo } from "net";

const debugLogger = debug("tpl-express-pro:server");

/**
 * Get port from environment and store in Express.
 */

const port: string = normalizePort(process.env.PORT || "9960");
console.log(port);
app.set("port", port);

/**
 * Create HTTP server.
 */

const server: http.Server = http.createServer(app);

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
      break;
    case "EADDRINUSE":
      console.error(bind + " is already in use");
      process.exit(1);
      break;
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
