import "server-only";

import { compare } from "bcrypt-ts";
import type { Session } from "next-auth";
import { DUMMY_PASSWORD } from "@/lib/constants";
import { getUser } from "@/lib/db/queries";

/**
 * The resolved identity of an authenticated MCP caller: the owning teacher's
 * user id plus a synthetic NextAuth session usable by the artifact handlers
 * (which gate persistence on `session.user.id`, mirroring lib/agent/proactive.ts).
 */
export type McpAuth = {
  userId: string;
  email: string;
  session: Session;
};

export class McpAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "McpAuthError";
  }
}

/** The demo teacher a TEACHFLOW_MCP_DEMO_TOKEN maps to. */
const DEMO_EMAIL = "demo@teachflow.app";

function buildSession(userId: string): Session {
  return {
    user: { id: userId, type: "regular" },
    expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  } as unknown as Session;
}

/**
 * Resolve a teacher by email + password the exact same way NextAuth's
 * credentials provider does (bcrypt-ts compare against the User table, with a
 * dummy-compare to equalize timing for unknown/passwordless accounts).
 */
async function resolveByCredentials(
  email: string,
  password: string
): Promise<McpAuth | null> {
  const users = await getUser(email);

  if (users.length === 0) {
    await compare(password, DUMMY_PASSWORD);
    return null;
  }

  const [user] = users;

  if (!user.password) {
    await compare(password, DUMMY_PASSWORD);
    return null;
  }

  const passwordsMatch = await compare(password, user.password);
  if (!passwordsMatch) {
    return null;
  }

  return {
    userId: user.id,
    email: user.email ?? email,
    session: buildSession(user.id),
  };
}

/**
 * Resolve the authenticated teacher from an incoming MCP request's
 * `Authorization: Bearer <token>` header. Two accepted token forms:
 *
 *   a) base64("email:password") of any TeachFlow account.
 *   b) the raw value of env TEACHFLOW_MCP_DEMO_TOKEN (if set) → demo teacher.
 *
 * Returns null when no/invalid credentials are supplied so the caller can emit
 * a proper MCP error. Throws only on internal failures.
 */
export async function resolveMcpAuth(
  request: Request
): Promise<McpAuth | null> {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const token = match[1].trim();
  if (!token) {
    return null;
  }

  // Form (b): demo token shortcut.
  const demoToken = process.env.TEACHFLOW_MCP_DEMO_TOKEN;
  if (demoToken && token === demoToken) {
    const users = await getUser(DEMO_EMAIL);
    if (users.length === 0) {
      return null;
    }
    const [user] = users;
    return {
      userId: user.id,
      email: user.email ?? DEMO_EMAIL,
      session: buildSession(user.id),
    };
  }

  // Form (a): base64("email:password").
  let decoded: string;
  try {
    decoded = Buffer.from(token, "base64").toString("utf8");
  } catch {
    return null;
  }
  const sep = decoded.indexOf(":");
  if (sep === -1) {
    return null;
  }
  const email = decoded.slice(0, sep);
  const password = decoded.slice(sep + 1);
  if (!email || !password) {
    return null;
  }

  return resolveByCredentials(email, password);
}
