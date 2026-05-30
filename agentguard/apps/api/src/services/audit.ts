import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import { stringifyJson } from "../json";

function hashPayload(payload: unknown, prevHash: string | null) {
  return createHash("sha256")
    .update(JSON.stringify({ payload, prevHash }))
    .digest("hex");
}

export async function recordAuditEvent(input: {
  eventType: string;
  entityType: string;
  entityId?: string | null;
  actor?: string | null;
  data: unknown;
}) {
  const previous = await prisma.auditEvent.findFirst({
    orderBy: { createdAt: "desc" }
  });

  const prevHash = previous?.hash ?? null;
  const payload = {
    eventType: input.eventType,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    actor: input.actor ?? null,
    data: input.data
  };

  return prisma.auditEvent.create({
    data: {
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      actor: input.actor ?? null,
      data: stringifyJson(input.data),
      prevHash,
      hash: hashPayload(payload, prevHash)
    }
  });
}

export async function verifyAuditChain() {
  const events = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "asc" }
  });

  let previousHash: string | null = null;

  return events.map((event) => {
    const payload = {
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actor: event.actor,
      data: JSON.parse(event.data)
    };

    const expectedHash = hashPayload(payload, event.prevHash);
    const valid = event.prevHash === previousHash && event.hash === expectedHash;
    previousHash = event.hash;

    return {
      ...event,
      data: payload.data,
      valid
    };
  });
}

