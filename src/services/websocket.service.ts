import { Socket } from "socket.io";

export type JsonRpcRequest<TParams = any> = {
  jsonrpc: "2.0";
  method: string;
  params: TParams;
  id: number;
};

export type JsonRpcResponse<TResult = any> = {
  jsonrpc: "2.0";
  result?: TResult;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: number;
};

export type JsonRpcNotification<TParams = any> = {
  jsonrpc: "2.0";
  method: string;
  params?: TParams;
};

export const sendError = (
  socket: Socket,
  code: number,
  message: string,
  id: number | undefined
) => {
  const errorResponse: JsonRpcResponse = {
    jsonrpc: "2.0",
    error: {
      code,
      message,
    },
    id,
  };
  socket.emit("message", errorResponse);
};

export const sendResponse = <TResult = any>(
  socket: Socket,
  result: TResult,
  id: number
) => {
  const response: JsonRpcResponse<TResult> = {
    jsonrpc: "2.0",
    result,
    id,
  };
  socket.emit("message", response);
};

export const sendNotification = <TParams = any>(
  socket: Socket,
  method: string,
  params?: TParams
) => {
  const notification: JsonRpcNotification<TParams> = {
    jsonrpc: "2.0",
    method,
    params,
  };
  socket.emit("message", notification);
};
