import { ConfigService } from "@nestjs/config";
import { buildMongoUri } from "./mongo-uri";

function config(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe("buildMongoUri", () => {
  it("uses MONGODB_URI when it is set", () => {
    const uri = buildMongoUri(
      config({
        MONGODB_URI: "mongodb://localhost:27017/test",
        MONGODB_USER: "user",
        MONGODB_PASS: "pass",
      }),
    );
    expect(uri).toBe("mongodb://localhost:27017/test");
  });

  it("builds the Atlas uri and encodes the user and password otherwise", () => {
    const uri = buildMongoUri(
      config({ MONGODB_USER: "us er", MONGODB_PASS: "p@ss:w/rd#?" }),
    );
    expect(uri).toBe(
      "mongodb+srv://us%20er:p%40ss%3Aw%2Frd%23%3F@draftzonedatabase.5nc6cbu.mongodb.net/draftzone?retryWrites=true&w=majority&appName=DraftzoneDatabase",
    );
  });
});
