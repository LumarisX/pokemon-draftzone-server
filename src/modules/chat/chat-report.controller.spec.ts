import { UserThrottlerGuard } from "@core/guards/user-throttler.guard";
import { AdminController } from "@modules/admin/admin.controller";
import { JwtAuthGuard } from "@modules/auth/jwt-auth.guard";
import { ROLES_KEY } from "@modules/auth/roles.decorator";
import { RolesGuard } from "@modules/auth/roles.guard";
import { UserRole } from "@modules/user/user.schema";
import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { ResetDisplayNameDto } from "@modules/admin/admin.dto";
import { ChatController } from "./chat.controller";
import { ReportChatMessageDto, ResolveChatReportDto } from "./chat.dto";

const GUARDS = "__guards__";
const THROTTLE_LIMIT = "THROTTLER:LIMITdefault";

function guardsOf(target: object): unknown[] {
  return Reflect.getMetadata(GUARDS, target) ?? [];
}

describe("chat report routes", () => {
  it("requires sign-in on the organizer list and resolve routes", () => {
    expect(guardsOf(ChatController.prototype.getReports)).toContain(JwtAuthGuard);
    expect(guardsOf(ChatController.prototype.resolveReport)).toContain(
      JwtAuthGuard,
    );
  });

  it("requires sign-in and a user throttle to report", () => {
    const guards = guardsOf(ChatController.prototype.reportMessage);

    expect(guards).toEqual([JwtAuthGuard, UserThrottlerGuard]);
    expect(
      Reflect.getMetadata(THROTTLE_LIMIT, ChatController.prototype.reportMessage),
    ).toBe(6);
  });

  it("is registered before the channel route so reports is not read as a channel", () => {
    const names = Object.getOwnPropertyNames(ChatController.prototype);

    expect(names.indexOf("getReports")).toBeLessThan(names.indexOf("getMessages"));
  });
});

describe("admin moderation routes", () => {
  it("sit behind the admin and owner roles", () => {
    expect(guardsOf(AdminController)).toEqual([JwtAuthGuard, RolesGuard]);
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([
      UserRole.ADMIN,
      UserRole.OWNER,
    ]);
  });

  it("does not override the class roles on the new handlers", () => {
    for (const handler of [
      AdminController.prototype.resetDisplayName,
      AdminController.prototype.getChatReports,
      AdminController.prototype.resolveChatReport,
    ]) {
      expect(Reflect.getMetadata(ROLES_KEY, handler)).toBeUndefined();
    }
  });
});

describe("moderation DTOs", () => {
  async function errorsFor<T extends object>(
    type: new () => T,
    value: Record<string, unknown>,
  ) {
    const instance = plainToInstance(type, value);
    return { instance, errors: await validate(instance) };
  }

  it("trims a report reason and bounds it to 1 to 300 characters", async () => {
    const ok = await errorsFor(ReportChatMessageDto, { reason: "  spam  " });
    expect(ok.errors).toHaveLength(0);
    expect(ok.instance.reason).toBe("spam");

    expect((await errorsFor(ReportChatMessageDto, { reason: "   " })).errors).not.toHaveLength(0);
    expect(
      (await errorsFor(ReportChatMessageDto, { reason: "x".repeat(301) })).errors,
    ).not.toHaveLength(0);
    expect(
      (await errorsFor(ReportChatMessageDto, { reason: "x".repeat(300) })).errors,
    ).toHaveLength(0);
  });

  it("accepts only dismiss or remove", async () => {
    expect((await errorsFor(ResolveChatReportDto, { action: "remove" })).errors).toHaveLength(0);
    expect((await errorsFor(ResolveChatReportDto, { action: "dismiss" })).errors).toHaveLength(0);
    expect((await errorsFor(ResolveChatReportDto, { action: "ban" })).errors).not.toHaveLength(0);
  });

  it("requires a profile id and a note of 1 to 300 characters to reset a display name", async () => {
    expect(
      (await errorsFor(ResetDisplayNameDto, { profileId: "ash", note: "slur" })).errors,
    ).toHaveLength(0);
    expect((await errorsFor(ResetDisplayNameDto, { profileId: "ash" })).errors).not.toHaveLength(0);
    expect(
      (await errorsFor(ResetDisplayNameDto, { profileId: "ash", note: "  " })).errors,
    ).not.toHaveLength(0);
    expect(
      (await errorsFor(ResetDisplayNameDto, { profileId: "ash", note: "x".repeat(301) })).errors,
    ).not.toHaveLength(0);
  });
});
