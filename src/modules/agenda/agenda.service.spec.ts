import { ConfigService } from "@nestjs/config";
import type { Agenda } from "agenda";

// The real `agenda` package is ESM-only and breaks Jest's CJS transform.
// AgendaService never constructs an Agenda itself (one is injected), but
// `@Inject(AGENDA_CLIENT) ...: Agenda` still forces a runtime import via
// emitDecoratorMetadata, so the package must be mocked before loading the SUT.
jest.mock("agenda", () => ({}));

import { AgendaService } from "./agenda.service";

function buildService(nodeEnv: string) {
  const agenda = {
    define: jest.fn(),
    start: jest.fn().mockResolvedValue(undefined),
    every: jest.fn().mockResolvedValue(undefined),
    stop: jest.fn(),
    cancel: jest.fn(),
    schedule: jest.fn(),
  } as unknown as jest.Mocked<Agenda>;

  const configService = {
    get: jest.fn().mockReturnValue(nodeEnv),
  } as unknown as jest.Mocked<ConfigService>;

  const service = new AgendaService(
    agenda,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    configService,
    {} as any,
  );

  return { service, agenda };
}

describe("AgendaService.onModuleInit", () => {
  it("does not schedule the recurring cleanup-file-uploads cron in development", async () => {
    const { service, agenda } = buildService("development");

    await service.onModuleInit();

    expect(agenda.every).not.toHaveBeenCalled();
  });

  it("TEMPORARILY DISABLED: does not schedule cleanup-file-uploads even outside development", async () => {
    // confirmUpload() isn't wired into any module that persists upload keys
    // yet, so this cron would delete every upload (not just orphans) if it
    // ran. Re-enable in agenda.service.ts once that's fixed, and update this
    // test to expect the schedule call.
    const { service, agenda } = buildService("production");

    await service.onModuleInit();

    expect(agenda.every).not.toHaveBeenCalled();
  });

  it("still defines the cleanup-file-uploads job handler regardless of environment", async () => {
    const { service, agenda } = buildService("production");

    await service.onModuleInit();

    expect(agenda.define).toHaveBeenCalledWith(
      "cleanup-file-uploads",
      expect.any(Function),
    );
  });

  it("starts the agenda client in both environments", async () => {
    const { service, agenda } = buildService("production");

    await service.onModuleInit();

    expect(agenda.start).toHaveBeenCalled();
  });
});
