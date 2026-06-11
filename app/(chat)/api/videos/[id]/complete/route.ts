import { NextResponse } from "next/server";

import { auth } from "@/app/(auth)/auth";
import {
  getStudentById,
  getVideoById,
  updateVideo,
} from "@/lib/db/queries-studio";
import { analyzeVideo } from "@/lib/analysis/video-analyze";

/**
 * Mark an upload complete and kick off analysis.
 *  - PUBSUB_MODE==='pubsub': publish {videoId} to PUBSUB_TOPIC (Cloud Run path).
 *  - otherwise: fire-and-forget analyzeVideo in-process (local dev path).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const video = await getVideoById({ id });
  if (!video) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const student = await getStudentById({ id: video.studentId });
  if (!student || student.userId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!video.gcsUri) {
    return NextResponse.json(
      { error: "Upload not finished (no gcsUri)" },
      { status: 400 }
    );
  }

  await updateVideo({ id, status: "processing" });

  if (process.env.PUBSUB_MODE === "pubsub") {
    try {
      const { PubSub } = await import("@google-cloud/pubsub");
      const pubsub = new PubSub({
        projectId: process.env.GOOGLE_CLOUD_PROJECT,
      });
      // biome-ignore lint/style/noNonNullAssertion: pubsub mode requires topic
      await pubsub
        .topic(process.env.PUBSUB_TOPIC!)
        .publishMessage({ json: { videoId: id } });
    } catch (error) {
      console.error(`[complete] pubsub publish failed for ${id}:`, error);
      await updateVideo({ id, status: "failed" }).catch(() => {
        // best effort
      });
      return NextResponse.json(
        { error: "Failed to enqueue analysis" },
        { status: 500 }
      );
    }
  } else {
    // Fire-and-forget in-process analysis.
    void analyzeVideo(id).catch(async (error) => {
      console.error(`[complete] analyzeVideo threw for ${id}:`, error);
      await updateVideo({ id, status: "failed" }).catch(() => {
        // best effort
      });
    });
  }

  return NextResponse.json({ ok: true, status: "processing" });
}
