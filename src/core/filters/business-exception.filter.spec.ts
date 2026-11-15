import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { PDZError } from "../pdz-error";
import { ErrorCodes } from "../pdz-error-codes";
import { BusinessExceptionFilter } from "./business-exception.filter";

function buildResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function buildHost(response: ReturnType<typeof buildResponse>): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
}

describe("BusinessExceptionFilter", () => {
  let filter: BusinessExceptionFilter;

  beforeEach(() => {
    filter = new BusinessExceptionFilter();
  });

  it("uses the PDZError's own code/message/details and status", () => {
    const response = buildResponse();
    const exception = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueSlug: "spring" });

    filter.catch(exception, buildHost(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: "LR-001",
        message: "League not found",
        details: { leagueSlug: "spring" },
      },
      meta: { timestamp: expect.any(String) },
    });
  });

  it("falls back to ERR-<status> and the exception's message for a plain HttpException", () => {
    const response = buildResponse();
    const exception = new HttpException("Forbidden", 403);

    filter.catch(exception, buildHost(response));

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({
      error: { code: "ERR-403", message: "Forbidden" },
      meta: { timestamp: expect.any(String) },
    });
  });

  it("uses the response body's message for a built-in Nest exception with a custom message", () => {
    const response = buildResponse();
    const exception = new ForbiddenException("Custom forbidden message");

    filter.catch(exception, buildHost(response));

    expect(response.json).toHaveBeenCalledWith({
      error: { code: "ERR-403", message: "Custom forbidden message" },
      meta: { timestamp: expect.any(String) },
    });
  });

  it("treats a default (no custom body) 404 as an unrouted request, using SYSTEM.NOT_FOUND", () => {
    const response = buildResponse();
    const exception = new NotFoundException();

    filter.catch(exception, buildHost(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCodes.SYSTEM.NOT_FOUND.code,
        message: ErrorCodes.SYSTEM.NOT_FOUND.message,
      },
      meta: { timestamp: expect.any(String) },
    });
  });

  it("does NOT treat a 404 PDZError (e.g. a real not-found entity) as an unrouted request", () => {
    const response = buildResponse();
    const exception = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);

    filter.catch(exception, buildHost(response));

    const body = response.json.mock.calls[0][0];
    expect(body.error.code).toBe("LR-001");
    expect(body.error.code).not.toBe(ErrorCodes.SYSTEM.NOT_FOUND.code);
  });

  it("falls back to the exception's own message when the response body has no message at all", () => {
    const response = buildResponse();
    const exception = new HttpException({ foo: "bar" }, 400);

    filter.catch(exception, buildHost(response));

    expect(response.json).toHaveBeenCalledWith({
      error: { code: "ERR-400", message: "Http Exception" },
      meta: { timestamp: expect.any(String) },
    });
  });

  it("turns a Mongoose CastError into a 400 INVALID_PARAMS in the same envelope", () => {
    const response = buildResponse();
    const error = new Error('Cast to ObjectId failed for value "abc"');
    error.name = "CastError";

    filter.catch(error, buildHost(response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCodes.VALIDATION.INVALID_PARAMS.code,
        message: ErrorCodes.VALIDATION.INVALID_PARAMS.message,
      },
      meta: { timestamp: expect.any(String) },
    });
  });

  it("turns a URIError into a 400 INVALID_PARAMS", () => {
    const response = buildResponse();

    filter.catch(new URIError("URI malformed"), buildHost(response));

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json.mock.calls[0][0].error.code).toBe(
      ErrorCodes.VALIDATION.INVALID_PARAMS.code,
    );
  });

  it("turns an unknown error into a generic 500 without leaking the message or stack, and logs it", () => {
    const response = buildResponse();
    const logSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    const error = new Error("secret db password in message");

    filter.catch(error, buildHost(response));

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: ErrorCodes.SYSTEM.INTERNAL_ERROR.code,
        message: ErrorCodes.SYSTEM.INTERNAL_ERROR.message,
      },
      meta: { timestamp: expect.any(String) },
    });
    expect(JSON.stringify(response.json.mock.calls[0][0])).not.toContain(
      "secret",
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("secret db password"),
      error.stack,
    );
    logSpy.mockRestore();
  });

  it("keeps the status of an exposed 4xx error from the HTTP stack", () => {
    const response = buildResponse();
    const error: any = new Error("request entity too large");
    error.status = 413;
    error.expose = true;

    filter.catch(error, buildHost(response));

    expect(response.status).toHaveBeenCalledWith(413);
    expect(response.json.mock.calls[0][0].error.code).toBe("ERR-413");
  });

  it("logs an HttpException with a 5xx status", () => {
    const response = buildResponse();
    const logSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    filter.catch(new HttpException("Boom", 503), buildHost(response));

    expect(response.status).toHaveBeenCalledWith(503);
    expect(logSpy).toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("does not log an HttpException below 500", () => {
    const response = buildResponse();
    const logSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);

    filter.catch(new HttpException("Forbidden", 403), buildHost(response));

    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("includes an ISO timestamp in meta", () => {
    const response = buildResponse();
    const exception = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);

    filter.catch(exception, buildHost(response));

    const body = response.json.mock.calls[0][0];
    expect(() => new Date(body.meta.timestamp).toISOString()).not.toThrow();
    expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
  });
});
