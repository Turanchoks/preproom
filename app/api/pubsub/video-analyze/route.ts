import { NextResponse } from "next/server";

import { analyzeVideo } from "@/lib/analysis/video-analyze";

/**
 * Pub/Sub push endpoint for video analysis.
 *
 * Auth: Pub/Sub push delivers an OIDC token in the Authorization header. We
 * verify it with google-auth-library (audience = PUSH_ENDPOINT_URL). Set
 * PUBSUB_VERIFY=0 to skip verification entirely (local testing only).
 *
 * Errors return 500 so Pub/Sub retries; success returns 204.
 */
export async function POST(request: Request) {
  // 1. Verify the OIDC bearer token unless explicitly disabled.
  if (process.env.PUBSUB_VERIFY !== "0") {
    const authHeader = request.headers.get("authorization") ?? "";
    const match = authHeader.match(/^Bearer (.+)$/);
    if (!match) {
      return NextResponse.json({ error: "Missing bearer" }, { status: 401 });
    }
    try {
      const { OAuth2Client } = await import("google-auth-library");
      const client = new OAuth2Client();
      await client.verifyIdToken({
        idToken: match[1],
        audience: process.env.PUSH_ENDPOINT_URL,
      });
    } catch (error) {
      console.error("[pubsub] OIDC verification failed:", error);
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }
  }

  // 2. Decode the Pub/Sub push envelope.
  let videoId: string | undefined;
  try {
    const body = (await request.json()) as {
      message?: { data?: string };
    };
    const dataB64 = body.message?.data;
    if (!dataB64) {
      return NextResponse.json({ error: "No message data" }, { status: 400 });
    }
    const decoded = Buffer.from(dataB64, "base64").toString("utf8");
    videoId = (JSON.parse(decoded) as { videoId?: string }).videoId;
  } catch (error) {
    console.error("[pubsub] failed to parse message:", error);
    return NextResponse.json({ error: "Bad message" }, { status: 400 });
  }

  if (!videoId) {
    return NextResponse.json({ error: "No videoId" }, { status: 400 });
  }

  // 3. Run analysis. Let errors bubble to a 500 so Pub/Sub retries.
  try {
    await analyzeVideo(videoId);
  } catch (error) {
    console.error(`[pubsub] analyzeVideo failed for ${videoId}:`, error);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
