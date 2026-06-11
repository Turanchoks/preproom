import "server-only";

import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile as fsReadFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * Storage abstraction for the video / upload pipeline.
 *
 * Two modes (detected by GCS_BUCKET):
 *  - GCS mode (GCS_BUCKET set): real Google Cloud Storage + V4 signed URLs.
 *  - Local mode (no GCS_BUCKET): files on disk under .uploads/, served via
 *    /api/uploads/serve/[...path].
 */

export type SaveResult = { uri: string; publicUrl: string };

const LOCAL_ROOT = join(process.cwd(), ".uploads");

export function isGcsMode(): boolean {
  return Boolean(process.env.GCS_BUCKET);
}

// Lazily-instantiated GCS Storage client (avoid importing in local mode).
let _storage: import("@google-cloud/storage").Storage | null = null;
async function getBucket() {
  const { Storage } = await import("@google-cloud/storage");
  if (!_storage) {
    _storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT,
    });
  }
  // biome-ignore lint/style/noNonNullAssertion: GCS mode guarantees the bucket
  return _storage.bucket(process.env.GCS_BUCKET!);
}

function toBuffer(
  data: Buffer | Uint8Array | Readable | ArrayBuffer
): Buffer | Readable {
  if (data instanceof Readable) {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data);
  }
  return Buffer.from(data);
}

/**
 * Persist an upload. `path` is the logical object path (e.g. videos/{id}).
 * Returns a storage uri (gs:// in GCS mode, local:// in local mode) and a
 * public URL the browser can fetch.
 */
export async function saveUpload(
  data: Buffer | Uint8Array | Readable | ArrayBuffer,
  path: string,
  contentType: string
): Promise<SaveResult> {
  if (isGcsMode()) {
    const bucket = await getBucket();
    const file = bucket.file(path);
    const body = toBuffer(data);
    if (body instanceof Readable) {
      await pipeline(
        body,
        file.createWriteStream({ contentType, resumable: false })
      );
    } else {
      await file.save(body, { contentType, resumable: false });
    }
    const bucketName = process.env.GCS_BUCKET;
    return {
      uri: `gs://${bucketName}/${path}`,
      publicUrl: `https://storage.googleapis.com/${bucketName}/${path}`,
    };
  }

  // Local mode: write under .uploads/
  const fullPath = join(LOCAL_ROOT, path);
  await mkdir(dirname(fullPath), { recursive: true });
  const body = toBuffer(data);
  if (body instanceof Readable) {
    await pipeline(body, createWriteStream(fullPath));
  } else {
    await pipeline(Readable.from(body), createWriteStream(fullPath));
  }
  return {
    uri: `local://${path}`,
    publicUrl: `/api/uploads/serve/${path}`,
  };
}

/**
 * Generate a V4 signed PUT url for direct browser uploads.
 * In local mode there is no signed-url support → return null so callers fall
 * back to the direct-upload endpoint.
 */
export async function getSignedPutUrl(
  path: string,
  contentType: string
): Promise<string | null> {
  if (!isGcsMode()) {
    return null;
  }
  const bucket = await getBucket();
  const [url] = await bucket.file(path).getSignedUrl({
    version: "v4",
    action: "write",
    expires: Date.now() + 15 * 60 * 1000,
    contentType,
  });
  return url;
}

/**
 * Read a stored object back as a Buffer. Accepts either a logical path
 * (videos/{id}) or a storage uri (gs://bucket/path, local://path).
 */
export async function readFile(pathOrUri: string): Promise<Buffer> {
  const path = normalizePath(pathOrUri);

  if (isGcsMode()) {
    const bucket = await getBucket();
    const [contents] = await bucket.file(path).download();
    return contents;
  }

  const fullPath = join(LOCAL_ROOT, path);
  return await fsReadFile(fullPath);
}

/**
 * Open a read stream for a stored object (used by the local serve route).
 */
export function readStreamLocal(pathOrUri: string): Readable {
  const path = normalizePath(pathOrUri);
  return createReadStream(join(LOCAL_ROOT, path));
}

export function localPathFor(pathOrUri: string): string {
  return join(LOCAL_ROOT, normalizePath(pathOrUri));
}

function normalizePath(pathOrUri: string): string {
  if (pathOrUri.startsWith("gs://")) {
    // gs://bucket/object/path → object/path
    const withoutScheme = pathOrUri.slice("gs://".length);
    const idx = withoutScheme.indexOf("/");
    return idx === -1 ? "" : withoutScheme.slice(idx + 1);
  }
  if (pathOrUri.startsWith("local://")) {
    return pathOrUri.slice("local://".length);
  }
  return pathOrUri;
}
