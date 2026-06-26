import { UploadsController } from "./upload.controller";
import { RequestUploadUrlDto } from "./upload.dto";
import { UploadFolder } from "./upload-folder.enum";
import { UploadsService } from "./upload.service";

describe("UploadsController", () => {
  let service: jest.Mocked<UploadsService>;
  let controller: UploadsController;

  beforeEach(() => {
    service = {
      createPresignedUpload: jest.fn(),
    } as unknown as jest.Mocked<UploadsService>;
    controller = new UploadsController(service);
  });

  it("createPresignedUrl forwards the authenticated sub and request body", async () => {
    const body: RequestUploadUrlDto = {
      folder: UploadFolder.TEAM_LOGOS,
      fileName: "logo.png",
      contentType: "image/png",
    };
    const presigned = { url: "https://s3.example.com", key: "team-logos/logo.png", expiresIn: 120 };
    service.createPresignedUpload.mockResolvedValue(presigned);

    const result = await controller.createPresignedUrl("auth0|user-1", body);

    expect(service.createPresignedUpload).toHaveBeenCalledWith(body, "auth0|user-1");
    expect(result).toBe(presigned);
  });
});
