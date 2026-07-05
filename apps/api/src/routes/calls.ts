import type { FastifyInstance } from "fastify";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";
import { buildIceServers } from "../lib/iceConfig";
import { toPublicUser } from "../lib/serializers";

export async function callRoutes(app: FastifyInstance) {
  // Public ICE server configuration for clients.
  // Requirement 10.1: endpoint is public (no JWT preHandler).
  // Requirement 10.7: response stays under 500 ms — no I/O here, purely in-memory.
  app.get("/calls/ice-config", async () => {
    return { iceServers: buildIceServers(env) };
  });

  // History for current user.
  app.get("/calls", { preHandler: [app.authenticate] }, async (req) => {
    const selfId = req.user.sub;
    const rows = await prisma.call.findMany({
      where: { OR: [{ fromUserId: selfId }, { toUserId: selfId }] },
      include: { from: true, to: true },
      orderBy: { startedAt: "desc" },
      take: 100,
    });
    const calls = await Promise.all(
      rows.map(async (c) => {
        const peer = c.fromUserId === selfId ? c.to : c.from;
        return {
          id: c.id,
          peer: await toPublicUser(peer),
          kind: c.kind as "audio" | "video",
          direction: c.fromUserId === selfId ? "outgoing" : "incoming",
          status: c.status,
          startedAt: c.startedAt.toISOString(),
          endedAt: c.endedAt?.toISOString() ?? null,
          durationSec: c.durationSec,
        };
      }),
    );
    return { calls };
  });
}
