import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/app/(auth)/auth";
import {
  createVideo,
  getStudentById,
  getVideosByStudentId,
  updateVideo,
} from "@/lib/db/queries-studio";
import { getSignedPutUrl } from "@/lib/gcs";

const PostSchema = z.object({
  studentId: z.string().uuid(),
  title: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(64),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const studentId = new URL(request.url).searchParams.get("studentId");
  if (!studentId) {
    return NextResponse.json({ error: "studentId required" }, { status: 400 });
  }

  const student = await getStudentById({ id: studentId });
  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (student.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const videos = await getVideosByStudentId({ studentId });
  return NextResponse.json(videos);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = PostSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { studentId, title, mimeType } = parsed.data;

  const student = await getStudentById({ id: studentId });
  if (!student) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (student.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const video = await createVideo({
    studentId,
    title,
    mimeType,
    gcsUri: null,
    status: "uploading",
  });

  const objectPath = `videos/${video.id}`;
  const signedUrl = await getSignedPutUrl(objectPath, mimeType);
  const uploadUrl = signedUrl ?? `/api/uploads/direct/${video.id}`;

  if (signedUrl) {
    // Client PUTs straight to GCS, so the object location is known now;
    // /complete requires gcsUri to be set.
    await updateVideo({
      id: video.id,
      gcsUri: `gs://${process.env.GCS_BUCKET}/${objectPath}`,
    });
  }

  return NextResponse.json({ video, uploadUrl, method: "PUT" });
}
