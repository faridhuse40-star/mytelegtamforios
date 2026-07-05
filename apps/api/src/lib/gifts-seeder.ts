import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { prisma } from "./prisma";

/**
 * Catalog is maintained in apps/api/gifts/manifest.json and populated
 * into the Gift table on boot. .tgs files (gzip-ed Lottie JSON) living
 * alongside the manifest are decompressed into /app/.cache/gifts/<slug>.json
 * so the mobile client can use them with lottie-react-native.
 */

const MANIFEST_NAME = "manifest.json";

interface ManifestEntry {
  slug: string;
  name: string;
  // Optional .tgs / Lottie JSON. Entries without a file are emoji-only gifts.
  file?: string | null;
  stars: number;
  supply?: number | null;
  emoji?: string | null;
}

interface Manifest {
  gifts: ManifestEntry[];
}

function slugOk(s: string) {
  return /^[a-z0-9_]{1,64}$/.test(s);
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function gunzip(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zlib.gunzip(buf, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

export interface PreparedGift {
  slug: string;
  tgsPath: string | null; // absolute path, served as /static/gifts/<slug>.tgs
  jsonPath: string;       // absolute path, served as /static/gifts/<slug>.json
}

/**
 * Reads the manifest, decompresses .tgs into a cache dir, upserts Gift rows,
 * and returns the list of filesystem paths that the HTTP server should
 * statically expose.
 */
export async function loadGiftsCatalog(giftsDir: string, cacheDir: string): Promise<PreparedGift[]> {
  const manifestPath = path.join(giftsDir, MANIFEST_NAME);
  if (!(await fileExists(manifestPath))) {
    console.warn(`[gifts] no manifest at ${manifestPath}, skipping`);
    return [];
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as Manifest;
  await fs.mkdir(cacheDir, { recursive: true });

  const prepared: PreparedGift[] = [];

  for (const entry of manifest.gifts ?? []) {
    if (!slugOk(entry.slug)) {
      console.warn(`[gifts] bad slug ${entry.slug}, skipping`);
      continue;
    }

    const jsonOut = path.join(cacheDir, `${entry.slug}.json`);
    const tgsOut = path.join(cacheDir, `${entry.slug}.tgs`);
    let animated = false;

    if (entry.file) {
      const src = path.join(giftsDir, entry.file);
      if (await fileExists(src)) {
        const ext = path.extname(entry.file).toLowerCase();
        try {
          const raw = await fs.readFile(src);
          if (ext === ".tgs" || raw[0] === 0x1f) {
            // gzip magic byte: ungzip to produce .json, keep .tgs alongside.
            const json = await gunzip(raw);
            await fs.writeFile(jsonOut, json);
            await fs.writeFile(tgsOut, raw);
          } else {
            // Already decoded Lottie JSON.
            await fs.writeFile(jsonOut, raw);
          }
          animated = true;
        } catch (e) {
          console.warn(`[gifts] failed to prepare animation for ${entry.slug}`, e);
        }
      } else {
        console.warn(`[gifts] file not found ${src} — seeding ${entry.slug} as emoji-only`);
      }
    }

    await prisma.gift.upsert({
      where: { slug: entry.slug },
      create: {
        slug: entry.slug,
        name: entry.name,
        stars: entry.stars,
        supply: entry.supply ?? null,
        emoji: entry.emoji ?? null,
        animated,
      },
      update: {
        name: entry.name,
        stars: entry.stars,
        supply: entry.supply ?? null,
        emoji: entry.emoji ?? null,
        animated,
      },
    });

    if (animated) {
      prepared.push({
        slug: entry.slug,
        tgsPath: (await fileExists(tgsOut)) ? tgsOut : null,
        jsonPath: jsonOut,
      });
    }
  }

  console.log(`[gifts] prepared ${prepared.length} gift(s)`);
  return prepared;
}
