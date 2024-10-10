export type JsonRpcRequest = {
  jsonrpc: "2.0";
  method: string;
  params: any;
  id: number;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id?: number;
};

// Function to send an error response
export const sendError = (
  socket: any,
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
  socket.send(JSON.stringify(errorResponse));
};

// Function to send a JSON-RPC response
export const sendResponse = (socket: any, result: any, id: number) => {
  const response: JsonRpcResponse = {
    jsonrpc: "2.0",
    result,
    id,
  };
  socket.send(JSON.stringify(response));
};
