import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "PrepRoom — Your AI teaching studio",
  description:
    "PrepRoom gives every learner a persistent teaching agent that watches lessons, remembers evidence, and turns it into the next teaching action.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="min-h-dvh bg-background text-foreground">{children}</div>;
}
