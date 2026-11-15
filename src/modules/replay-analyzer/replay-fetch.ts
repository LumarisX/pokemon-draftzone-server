import { PDZError } from "@core/pdz-error";
import { ErrorCodes } from "@core/pdz-error-codes";

const REPLAY_URL_PATTERN =
  /^replay\.pokemonshowdown\.com\/[a-zA-Z0-9\-._~:/?#[\]\\@!$&'()*+,;=]+$/;
const FETCH_TIMEOUT_MS = 10_000;

function decodeReplayUrl(url: unknown): string {
  if (typeof url !== "string" || !url)
    throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
  try {
    return decodeURI(url).replace(/^https?:\/\//, "");
  } catch {
    throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
  }
}

export async function fetchReplayLog(url: unknown): Promise<string> {
  const decodedUrl = decodeReplayUrl(url);
  if (!REPLAY_URL_PATTERN.test(decodedUrl))
    throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);

  const plainUrl = decodedUrl.split("?")[0].split("#")[0];
  let response: Response;
  try {
    response = await fetch(`https://${plainUrl}.log`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new PDZError(ErrorCodes.REPLAY.FETCH_FAILED);
  }
  if (!response.ok) throw new PDZError(ErrorCodes.REPLAY.INVALID_URL);
  return response.text();
}
