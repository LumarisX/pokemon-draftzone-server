import { getFormat, getFormats } from "./formats";
import { PDZError } from "../errors/pdz-error";

describe("getFormat", () => {
  it("should return the correct format for a valid ID", () => {
    const singlesFormat = getFormat("Singles");
    expect(singlesFormat).toBeDefined();
    expect(singlesFormat.name).toBe("Singles");
    expect(singlesFormat.level).toBe(100);

    const vgcFormat = getFormat("VGC");
    expect(vgcFormat).toBeDefined();
    expect(vgcFormat.name).toBe("VGC");
    expect(vgcFormat.level).toBe(50);
  });

  it("should throw a PDZError for an invalid format ID", () => {
    expect(() => getFormat("InvalidFormat")).toThrow(PDZError);
  });
});

describe("getFormats", () => {
  it("should return an array of format IDs", () => {
    const formats = getFormats();
    expect(Array.isArray(formats)).toBe(true);
    expect(formats.length).toBeGreaterThan(0);
    expect(formats).toContain("Singles");
    expect(formats).toContain("VGC");
    expect(formats).toContain("LC");
    expect(formats).toContain("Doubles");
    expect(formats).toContain("Singles 50");
    expect(formats).toContain("LC VGC");
  });
});
