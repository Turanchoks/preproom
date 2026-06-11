import type { UserType } from "@/app/(auth)/auth";

type Entitlements = {
  maxMessagesPerHour: number;
};

// Override via MSG_LIMIT_PER_HOUR; generous default so evaluation sessions
// with many chat turns are never cut off mid-conversation.
const LIMIT = Number(process.env.MSG_LIMIT_PER_HOUR) || 60;

export const entitlementsByUserType: Record<UserType, Entitlements> = {
  guest: {
    maxMessagesPerHour: LIMIT,
  },
  regular: {
    maxMessagesPerHour: LIMIT,
  },
};
