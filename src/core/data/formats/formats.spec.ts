import { PDZError } from "@core/pdz-error";
import { _getFormats, getFormat, getFormats } from "./formats";

describe("getFormat", () => {
  it("returns the matching format for each known id", () => {
    expect(getFormat("Singles")).toMatchObject({
      name: "Singles",
      level: 100,
      choose: 6,
      layout: "1",
    });
    expect(getFormat("Singles 50")).toMatchObject({
      name: "Singles 50",
      level: 50,
      choose: 6,
      layout: "1",
    });
    expect(getFormat("LC")).toMatchObject({
      name: "LC",
      level: 5,
      choose: 6,
      layout: "1",
    });
    expect(getFormat("VGC")).toMatchObject({
      name: "VGC",
      level: 50,
      choose: 4,
      layout: "2",
    });
    expect(getFormat("Doubles")).toMatchObject({
      name: "Doubles",
      level: 100,
      choose: 6,
      layout: "2",
    });
    expect(getFormat("LC VGC")).toMatchObject({
      name: "LC VGC",
      level: 5,
      choose: 4,
      layout: "2",
    });
  });

  it("throws a PDZError with FORMAT.NOT_FOUND for an invalid format id", () => {
    expect(() => getFormat("InvalidFormat")).toThrow(PDZError);
    let error: unknown;
    try {
      getFormat("InvalidFormat");
    } catch (e) {
      error = e;
    }
    expect(error).toMatchObject({ code: "FMT-001" });
  });

  it("resolves every id advertised by getFormats()", () => {
    for (const formatId of getFormats()) {
      expect(getFormat(formatId).name).toBe(formatId);
    }
  });
});

describe("getFormats", () => {
  it("returns a flat array of every format id", () => {
    const formats = getFormats();
    expect(Array.isArray(formats)).toBe(true);
    expect(formats).toEqual([
      "Singles",
      "Singles 50",
      "LC",
      "VGC",
      "Doubles",
      "LC VGC",
    ]);
  });
});

describe("_getFormats", () => {
  it("groups formats by their top-level category, carrying name/id/desc", () => {
    const grouped = _getFormats();

    const singlesGroup = grouped.find(([groupName]) => groupName === "Singles");
    expect(singlesGroup).toBeDefined();
    expect(singlesGroup![1]).toContainEqual({
      name: "Standard",
      id: "Singles",
      desc: "1v1; Level 100",
    });

    const doublesGroup = grouped.find(([groupName]) => groupName === "Doubles");
    expect(doublesGroup).toBeDefined();
    expect(doublesGroup![1]).toContainEqual({
      name: "VGC",
      id: "VGC",
      desc: "2v2; Bring 6, choose 4; Level 50",
    });
  });
});
