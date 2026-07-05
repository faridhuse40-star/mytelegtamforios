import type { FastifyInstance } from "fastify";
import "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { MAX_UPLOAD_BYTES } from "@messenger/shared";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";

const MAX_DB_UPLOAD_BYTES = Math.min(MAX_UPLOAD_BYTES, 25 * 1024 * 1024);

function cleanFileName(name: string | undefined): string {
  const fallback = `file-${randomUUID()}`;
  return (name || fallback).replace(/[\\/\u0000-\u001f]/g, "_").slice(0, 120) || fallback;
}

export async function uploadRoutes(app: FastifyInstance) {
  app.post("/uploads", { preHandler: [app.authenticate] }, async (req, reply) => {
    const file = await req.file({ limits: { fileSize: MAX_DB_UPLOAD_BYTES } });
    if (!file) return reply.code(400).send({ error: "file_required" });

    const bytes = await file.toBuffer();
    if (!bytes.length) return reply.code(400).send({ error: "empty_file" });
    if (bytes.length > MAX_DB_UPLOAD_BYTES) return reply.code(413).send({ error: "file_too_large" });

    const asset = await prisma.uploadAsset.create({
      data: {
        ownerId: req.user.sub,
        name: cleanFileName(file.filename),
        mimeType: file.mimetype || "application/octet-stream",
        size: bytes.length,
        bytes,
      },
    });

    const base = env.PUBLIC_BASE_URL.replace(/\/$/, "");
    return {
      attachment: {
        id: asset.id,
        url: `${base}/uploads/${asset.id}`,
        mimeType: asset.mimeType,
        size: asset.size,
        name: asset.name,
      },
    };
  });

  app.get<{ Params: { id: string } }>("/uploads/:id", async (req, reply) => {
    const asset = await prisma.uploadAsset.findUnique({ where: { id: req.params.id } });
    if (!asset) return reply.code(404).send({ error: "not_found" });

    const buf = Buffer.from(asset.bytes);
    reply.header("Content-Type", asset.mimeType);
    reply.header("Cache-Control", "private, max-age=86400");
    reply.header("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(asset.name)}`);
    // Byte-range support: AVPlayer on iOS requests audio via Range and may
    // refuse to play sources that only ever answer 200.
    reply.header("Accept-Ranges", "bytes");
    const range = typeof req.headers.range === "string" ? /^bytes=(\d*)-(\d*)$/.exec(req.headers.range) : null;
    if (range && (range[1] || range[2])) {
      const start = range[1] ? parseInt(range[1], 10) : 0;
      const end = range[2] ? Math.min(parseInt(range[2], 10), buf.length - 1) : buf.length - 1;
      if (start > end || start >= buf.length) {
        return reply.code(416).header("Content-Range", `bytes */${buf.length}`).send();
      }
      reply.code(206);
      reply.header("Content-Range", `bytes ${start}-${end}/${buf.length}`);
      reply.header("Content-Length", String(end - start + 1));
      return reply.send(buf.subarray(start, end + 1));
    }

    reply.header("Content-Length", String(buf.length));
    return reply.send(buf);
  });
}
