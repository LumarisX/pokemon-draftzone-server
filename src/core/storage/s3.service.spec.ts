const mockSend = jest.fn();
const mockGetSignedUrl = jest.fn();

jest.mock("@aws-sdk/client-s3", () => ({
  S3Client: jest.fn().mockImplementation((config: any) => ({ send: mockSend, config })),
  PutObjectCommand: jest.fn((input: any) => ({ commandType: "PutObjectCommand", input })),
  GetObjectCommand: jest.fn((input: any) => ({ commandType: "GetObjectCommand", input })),
  HeadObjectCommand: jest.fn((input: any) => ({ commandType: "HeadObjectCommand", input })),
  DeleteObjectCommand: jest.fn((input: any) => ({ commandType: "DeleteObjectCommand", input })),
  DeleteObjectsCommand: jest.fn((input: any) => ({ commandType: "DeleteObjectsCommand", input })),
}));

jest.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mockGetSignedUrl,
}));

jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: jest.fn(() => "fixed-uuid"),
}));

import { S3Client } from "@aws-sdk/client-s3";
import { ConfigService } from "@nestjs/config";
import { S3Service } from "./s3.service";

function buildConfigService(values: Record<string, string | undefined>) {
  return {
    get: jest.fn((key: string) => values[key]),
  } as unknown as jest.Mocked<ConfigService>;
}

function buildConfiguredService(
  overrides: Record<string, string | undefined> = {},
) {
  const service = new S3Service(
    buildConfigService({
      AWS_REGION: "us-east-1",
      AWS_S3_BUCKET: "my-bucket",
      ...overrides,
    }),
  );
  service.onModuleInit();
  return service;
}

describe("S3Service.onModuleInit / isEnabled", () => {
  it("stays disabled when AWS_REGION or AWS_S3_BUCKET is missing", () => {
    const service = new S3Service(
      buildConfigService({ AWS_REGION: undefined, AWS_S3_BUCKET: "my-bucket" }),
    );

    service.onModuleInit();

    expect(service.isEnabled()).toBe(false);
  });

  it("becomes enabled once region and bucket are present", () => {
    const service = buildConfiguredService();

    expect(service.isEnabled()).toBe(true);
  });

  it("constructs the S3Client with explicit credentials when provided", () => {
    buildConfiguredService({
      AWS_ACCESS_KEY_ID: "key-id",
      AWS_SECRET_ACCESS_KEY: "secret",
    });

    expect(S3Client).toHaveBeenLastCalledWith({
      region: "us-east-1",
      credentials: { accessKeyId: "key-id", secretAccessKey: "secret" },
    });
  });

  it("constructs the S3Client without credentials when none are provided (default credential chain)", () => {
    buildConfiguredService();

    expect(S3Client).toHaveBeenLastCalledWith({ region: "us-east-1" });
  });
});

describe("S3Service.buildKey", () => {
  it("prefixes the key with the folder and a random UUID", () => {
    const service = buildConfiguredService();

    expect(service.buildKey("team-logos", "logo.png")).toBe(
      "team-logos/fixed-uuid-logo.png",
    );
  });

  it("lowercases the filename and replaces disallowed characters with underscores", () => {
    const service = buildConfiguredService();

    expect(service.buildKey("team-logos", "My Logo!.PNG")).toBe(
      "team-logos/fixed-uuid-my_logo_.png",
    );
  });

  it("trims surrounding whitespace before sanitizing", () => {
    const service = buildConfiguredService();

    expect(service.buildKey("team-logos", "  logo.png  ")).toBe(
      "team-logos/fixed-uuid-logo.png",
    );
  });

  it("keeps only the last 100 characters of a very long filename", () => {
    const service = buildConfiguredService();
    const longName = "a".repeat(150) + ".png";

    const key = service.buildKey("team-logos", longName);
    const sanitizedPart = key.replace("team-logos/fixed-uuid-", "");

    expect(sanitizedPart).toHaveLength(100);
    expect(sanitizedPart.endsWith(".png")).toBe(true);
  });
});

describe("S3Service guarded methods (not configured)", () => {
  it("throws FILE.SERVICE_UNAVAILABLE from getPresignedUploadUrl when S3 isn't configured", async () => {
    const service = new S3Service(buildConfigService({}));
    service.onModuleInit();

    await expect(
      service.getPresignedUploadUrl("key", "image/png"),
    ).rejects.toMatchObject({ code: "FILE-001" });
  });

  it("throws FILE.SERVICE_UNAVAILABLE from getPublicUrl when S3 isn't configured", () => {
    const service = new S3Service(buildConfigService({}));
    service.onModuleInit();

    expect(() => service.getPublicUrl("key")).toThrow(
      expect.objectContaining({ code: "FILE-001" }),
    );
  });

  it("doesn't throw from deleteObjects when called with an empty array, even if unconfigured", async () => {
    const service = new S3Service(buildConfigService({}));
    service.onModuleInit();

    await expect(service.deleteObjects([])).resolves.toBeUndefined();
    expect(mockSend).not.toHaveBeenCalled();
  });
});

describe("S3Service.getPresignedUploadUrl / getPresignedDownloadUrl", () => {
  beforeEach(() => {
    mockGetSignedUrl.mockResolvedValue("https://s3.example.com/presigned-url");
  });

  it("signs a PutObjectCommand with the given content type and expiry", async () => {
    const service = buildConfiguredService();

    const url = await service.getPresignedUploadUrl("team-logos/a.png", "image/png", 60);

    expect(url).toBe("https://s3.example.com/presigned-url");
    const [, command, options] = mockGetSignedUrl.mock.calls[0];
    expect(command.commandType).toBe("PutObjectCommand");
    expect(command.input).toEqual({
      Bucket: "my-bucket",
      Key: "team-logos/a.png",
      ContentType: "image/png",
    });
    expect(options.expiresIn).toBe(60);
  });

  it("signs a GetObjectCommand for downloads", async () => {
    const service = buildConfiguredService();

    await service.getPresignedDownloadUrl("team-logos/a.png", 30);

    const [, command, options] = mockGetSignedUrl.mock.calls[0];
    expect(command.commandType).toBe("GetObjectCommand");
    expect(command.input).toEqual({ Bucket: "my-bucket", Key: "team-logos/a.png" });
    expect(options.expiresIn).toBe(30);
  });
});

describe("S3Service.headObject", () => {
  it("returns exists:true with size/contentType on success", async () => {
    const service = buildConfiguredService();
    mockSend.mockResolvedValue({ ContentLength: 1234, ContentType: "image/png" });

    const result = await service.headObject("team-logos/a.png");

    expect(result).toEqual({ exists: true, size: 1234, contentType: "image/png" });
  });

  it("returns exists:false when the error name is NotFound", async () => {
    const service = buildConfiguredService();
    mockSend.mockRejectedValue({ name: "NotFound" });

    await expect(service.headObject("missing")).resolves.toEqual({ exists: false });
  });

  it("returns exists:false when the error's HTTP status is 404", async () => {
    const service = buildConfiguredService();
    mockSend.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });

    await expect(service.headObject("missing")).resolves.toEqual({ exists: false });
  });

  it("rethrows any other error", async () => {
    const service = buildConfiguredService();
    mockSend.mockRejectedValue({ name: "AccessDenied", $metadata: { httpStatusCode: 403 } });

    await expect(service.headObject("forbidden")).rejects.toMatchObject({
      name: "AccessDenied",
    });
  });
});

describe("S3Service.deleteObject / deleteObjects", () => {
  it("sends a DeleteObjectCommand for the given key", async () => {
    const service = buildConfiguredService();
    mockSend.mockResolvedValue({});

    await service.deleteObject("team-logos/a.png");

    const command = mockSend.mock.calls[0][0];
    expect(command.commandType).toBe("DeleteObjectCommand");
    expect(command.input).toEqual({ Bucket: "my-bucket", Key: "team-logos/a.png" });
  });

  it("sends a single DeleteObjectsCommand for multiple keys", async () => {
    const service = buildConfiguredService();
    mockSend.mockResolvedValue({});

    await service.deleteObjects(["a.png", "b.png"]);

    const command = mockSend.mock.calls[0][0];
    expect(command.commandType).toBe("DeleteObjectsCommand");
    expect(command.input).toEqual({
      Bucket: "my-bucket",
      Delete: { Objects: [{ Key: "a.png" }, { Key: "b.png" }] },
    });
  });
});

describe("S3Service.getPublicUrl", () => {
  it("builds the default S3 URL when no CDN base URL is configured", () => {
    const service = buildConfiguredService();

    expect(service.getPublicUrl("team-logos/a.png")).toBe(
      "https://my-bucket.s3.us-east-1.amazonaws.com/team-logos/a.png",
    );
  });

  it("prefers the configured CDN base URL, stripping trailing slashes", () => {
    const service = buildConfiguredService({
      AWS_S3_PUBLIC_BASE_URL: "https://cdn.example.com/",
    });

    expect(service.getPublicUrl("team-logos/a.png")).toBe(
      "https://cdn.example.com/team-logos/a.png",
    );
  });
});
