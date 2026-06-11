import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import {
  getStudentById,
  getVideoById,
  updateVideo,
} from "@/lib/db/queries-studio";
import { saveUpload } from "@/lib/gcs";

/**
 * Local-mode direct upload target. The browser PUTs the raw video bytes here;
 * we stream them to storage under videos/{videoId} and record the gcsUri.
 * (In GCS mode the client uploads straight to a signed URL and never hits this.)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { videoId } = await params;
  const video = await getVideoById({ id: videoId });
  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const student = await getStudentById({ id: video.studentId });
  if (!student || student.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!request.body) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const contentType =
    request.headers.get("content-type") ||
    video.mimeType ||
    "application/octet-stream";

  const buffer = Buffer.from(await request.arrayBuffer());
  const { uri } = await saveUpload(buffer, `videos/${videoId}`, contentType);

  await updateVideo({ id: videoId, gcsUri: uri });

  return NextResponse.json({ ok: true, gcsUri: uri });
}
