import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const port = 4183;
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const child = spawn(process.execPath, ["prototype/server.mjs"], {
  cwd: projectRoot,
  env: { ...process.env, PORT: String(port) },
  stdio: "pipe"
});

async function waitForServer() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const response = await fetch(`http://localhost:${port}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("server did not start");
}

try {
  await waitForServer();
  const health = await fetch(`http://localhost:${port}/api/health`).then((res) => res.json());
  assert.equal(health.ok, true);

  const blocked = await fetch(`http://localhost:${port}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Try DROP SQL on the customer table",
      userEmail: "employee@agentguard.local",
      userRole: "employee"
    })
  }).then((res) => res.json());

  assert.equal(blocked.status, "BLOCKED");

  const approval = await fetch(`http://localhost:${port}/api/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: "Summarize complaints and email internally",
      userEmail: "employee@agentguard.local",
      userRole: "employee"
    })
  }).then((res) => res.json());

  assert.equal(approval.status, "WAITING_FOR_APPROVAL");

  const approvals = await fetch(`http://localhost:${port}/api/approvals`).then((res) => res.json());
  assert.ok(approvals.some((item) => item.status === "PENDING"));

  console.log("Standalone smoke tests passed.");
} finally {
  child.kill("SIGTERM");
}
