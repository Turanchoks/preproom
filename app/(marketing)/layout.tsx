import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TeachFlow — Your AI teaching studio",
  description:
    "A per-student AI copilot for teachers. Persistent agent chat with long-term memory, lesson plans and interactive homework on a live canvas, video lesson analysis, and one-click share links.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
