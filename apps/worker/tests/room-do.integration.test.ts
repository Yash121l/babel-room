import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("RoomDO binding", () => {
  it("exposes ROOM namespace", () => {
    expect(env.ROOM).toBeDefined();
  });
});
