import { ErrorCodes } from "@core/pdz-error-codes";
import { fetchReplayLog } from "./replay-fetch";

describe("fetchReplayLog", () => {
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const invalid = { code: ErrorCodes.REPLAY.INVALID_URL.code };

  it("refuses malformed percent-encoding without fetching", async () => {
    await expect(
      fetchReplayLog("replay.pokemonshowdown.com/%E0%A4%A"),
    ).rejects.toMatchObject(invalid);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refuses anything but a Showdown replay", async () => {
    for (const url of [
      undefined,
      "",
      "https://evil.example/replay",
      "replay.pokemonshowdown.com.evil.example/x",
    ])
      await expect(fetchReplayLog(url)).rejects.toMatchObject(invalid);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetches the log without the query or fragment", async () => {
    fetchSpy.mockResolvedValue(new Response("|j|ash", { status: 200 }));

    await expect(
      fetchReplayLog("https://replay.pokemonshowdown.com/gen9ou-1?p2#t"),
    ).resolves.toBe("|j|ash");
    expect(fetchSpy.mock.calls[0][0]).toBe(
      "https://replay.pokemonshowdown.com/gen9ou-1.log",
    );
  });

  it("treats a missing replay as a bad address", async () => {
    fetchSpy.mockResolvedValue(new Response("Not found", { status: 404 }));

    await expect(
      fetchReplayLog("replay.pokemonshowdown.com/gen9ou-404"),
    ).rejects.toMatchObject(invalid);
  });

  it("reports a network failure as a fetch failure", async () => {
    fetchSpy.mockRejectedValue(new TypeError("fetch failed"));

    await expect(
      fetchReplayLog("replay.pokemonshowdown.com/gen9ou-1"),
    ).rejects.toMatchObject({ code: ErrorCodes.REPLAY.FETCH_FAILED.code });
  });
});
