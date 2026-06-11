import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { guestRegex, isDevelopmentEnvironment } from "./lib/constants";

const PUBLIC_PATHS = ["/", "/ping"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  // Public share links.
  if (pathname === "/s" || pathname.startsWith("/s/")) {
    return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/ping")) {
    return new Response("pong", { status: 200 });
  }

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Pub/Sub push endpoints authenticate via OIDC, not session cookies.
  if (pathname.startsWith("/api/pubsub")) {
    return NextResponse.next();
  }

  // Locally-served uploads are public objects (GCS public-URL equivalent).
  if (pathname.startsWith("/api/uploads/serve")) {
    return NextResponse.next();
  }

  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie: !isDevelopmentEnvironment,
  });

  // Public pages: never force a token redirect.
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!token) {
    const redirectUrl = encodeURIComponent(new URL(request.url).pathname);

    return NextResponse.redirect(
      new URL(`${base}/api/auth/guest?redirectUrl=${redirectUrl}`, request.url)
    );
  }

  const isGuest = guestRegex.test(token?.email ?? "");

  if (token && !isGuest && ["/login", "/register"].includes(pathname)) {
    return NextResponse.redirect(new URL(`${base}/app`, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/app/:path*",
    "/chat/:id",
    "/s/:path*",
    "/api/:path*",
    "/login",
    "/register",

    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
