import {
  ArgumentsHost,
  ForbiddenException,
  HttpException,
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
    const exception = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND, { leagueKey: "spring" });

    filter.catch(exception, buildHost(response));

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({
      error: {
        code: "LR-001",
        message: "League not found",
        details: { leagueKey: "spring" },
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

  it("includes an ISO timestamp in meta", () => {
    const response = buildResponse();
    const exception = new PDZError(ErrorCodes.LEAGUE.NOT_FOUND);

    filter.catch(exception, buildHost(response));

    const body = response.json.mock.calls[0][0];
    expect(() => new Date(body.meta.timestamp).toISOString()).not.toThrow();
    expect(new Date(body.meta.timestamp).toISOString()).toBe(body.meta.timestamp);
  });
});
