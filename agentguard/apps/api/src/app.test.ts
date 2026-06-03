import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { prisma } from "./prisma";

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

  it("creates, updates, and deletes policy records", async () => {
    const name = `Test policy ${Date.now()}`;

    await prisma.policy.deleteMany({ where: { name } });

    const created = await request(app)
      .post("/api/policies")
      .send({
        name,
        description: "Require approval for unusual test policy changes.",
        severity: "high",
        enabled: true,
        actor: "admin@agentguard.local"
      });

    expect(created.status).toBe(201);
    expect(created.body.name).toBe(name);
    expect(created.body.severity).toBe("high");

    const updated = await request(app)
      .patch(`/api/policies/${created.body.id}`)
      .send({
        enabled: false,
        severity: "medium",
        actor: "admin@agentguard.local"
      });

    expect(updated.status).toBe(200);
    expect(updated.body.enabled).toBe(false);
    expect(updated.body.severity).toBe("medium");

    const deleted = await request(app)
      .delete(`/api/policies/${created.body.id}`)
      .send({ actor: "admin@agentguard.local" });

    expect(deleted.status).toBe(200);
    expect(deleted.body.ok).toBe(true);
    expect(deleted.body.policy.name).toBe(name);
  });
});
