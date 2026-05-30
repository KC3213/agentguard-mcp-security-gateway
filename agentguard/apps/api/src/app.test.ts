import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("api smoke", () => {
  const app = createApp();

  it("returns health", async () => {
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("lists tools", async () => {
    const response = await request(app).get("/api/tools");
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

