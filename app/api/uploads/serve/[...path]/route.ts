import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { localPathFor } from "@/lib/gcs";

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  m4v: "video/x-m4v",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

function contentTypeFor(path: string): string {
  const last = path.split("/").pop() ?? "";
  if (last.includes(".")) {
    const ext = last.split(".").pop()?.toLowerCase() ?? "";
    if (CONTENT_TYPES[ext]) {
      return CONTENT_TYPES[ext];
    }
  }
  // Videos are stored under videos/{id} with no extension.
  if (path.startsWith("videos/")) {
    return "video/mp4";
  }
  return "application/octet-stream";
}

/**
 * Public GET: stream a locally-stored upload from .uploads/ off disk.
 * (Local-mode equivalent of a public GCS object.)
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const relPath = path.join("/");

  // Guard against path traversal.
  if (relPath.includes("..")) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const fullPath = localPathFor(relPath);

  let fileSize: number;
  try {
    const info = await stat(fullPath);
    fileSize = info.size;
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const nodeStream = createReadStream(fullPath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": contentTypeFor(relPath),
      "Content-Length": String(fileSize),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
