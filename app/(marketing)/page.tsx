import Link from "next/link";
import {
  ArrowRight,
  Brain,
  FileText,
  Link2,
  Share2,
  Sparkles,
  Video,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Brain,
    title: "Per-student agent memory",
    description:
      "A dedicated agent for every student that remembers goals, strengths, and gaps across every lesson — so context never resets.",
  },
  {
    icon: FileText,
    title: "Lesson plans & interactive homework",
    description:
      "Generate structured lesson plans and playable quizzes on a live canvas. Multiple-choice, fill-the-gaps, word puzzles and more.",
  },
  {
    icon: Video,
    title: "Video lesson analysis",
    description:
      "Upload a lesson recording and Gemini extracts what happened, what to reinforce, and durable facts straight into memory.",
  },
  {
    icon: Link2,
    title: "Instant share links",
    description:
      "One click turns any homework into a public link students open and complete — no account, no friction.",
  },
];

const steps = [
  {
    title: "Pick a student",
    description:
      "Open the studio and choose a student. Their agent loads everything it knows about them.",
  },
  {
    title: "Chat to create",
    description:
      "Ask for a lesson plan or homework. It streams onto the canvas while you refine it live.",
  },
  {
    title: "Share & learn",
    description:
      "Send a share link, then drop in lesson recordings so memory keeps getting sharper.",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      {/* Sticky nav */}
      <header className="sticky top-0 z-50 border-border/60 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link
            className="flex items-center gap-2 font-semibold text-lg tracking-tight"
            href="/"
          >
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-4" />
            </span>
            TeachFlow
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/app">Open studio</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden
            className="-z-10 pointer-events-none absolute inset-0"
          >
            <div className="-translate-x-1/2 absolute top-[-10rem] left-1/2 h-[36rem] w-[60rem] rounded-full bg-gradient-to-tr from-primary/15 via-primary/5 to-transparent blur-3xl dark:from-primary/10" />
          </div>

          <div className="mx-auto w-full max-w-6xl px-6 pt-20 pb-16 text-center sm:pt-28">
            <Badge variant="outline" className="mx-auto mb-6">
              <Sparkles className="size-3" />
              Built on Google ADK + Gemini
            </Badge>
            <h1 className="mx-auto max-w-3xl text-balance font-semibold text-4xl tracking-tight sm:text-6xl">
              Your AI teaching studio
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground sm:text-xl">
              A per-student AI copilot for teachers. Persistent agent chat with
              long-term memory, lesson plans and interactive homework on a live
              canvas, video lesson analysis, and one-click share links.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/app">
                  Open studio
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>

            {/* Product screenshot placeholder */}
            <div className="mx-auto mt-16 max-w-5xl">
              <div
                id="screenshot-slot"
                className="flex aspect-video w-full items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground text-sm shadow-sm"
              >
                Studio preview
              </div>
            </div>
          </div>
        </section>

        {/* Feature grid */}
        <section className="mx-auto w-full max-w-6xl px-6 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-semibold text-3xl tracking-tight sm:text-4xl">
              Everything a tutor needs, per student
            </h2>
            <p className="mt-4 text-muted-foreground">
              One workspace that plans, teaches, and remembers — so you can focus
              on the student in front of you.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-xl border border-border bg-card p-6 text-card-foreground transition-colors hover:border-foreground/20"
              >
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <feature.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-medium text-lg">{feature.title}</h3>
                <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="border-border/60 border-y bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-6 py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="font-semibold text-3xl tracking-tight sm:text-4xl">
                How it works
              </h2>
              <p className="mt-4 text-muted-foreground">
                From a blank canvas to graded homework in three steps.
              </p>
            </div>

            <div className="mt-12 grid gap-6 sm:grid-cols-3">
              {steps.map((step, index) => (
                <div key={step.title} className="relative">
                  <div className="flex size-9 items-center justify-center rounded-full border border-border bg-background font-semibold text-sm">
                    {index + 1}
                  </div>
                  <h3 className="mt-4 font-medium text-lg">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-6 py-24 text-center">
          <h2 className="mx-auto max-w-2xl font-semibold text-3xl tracking-tight sm:text-4xl">
            Start teaching with your AI studio
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            No setup. Open the studio, pick a student, and create your first
            lesson in minutes.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg">
              <Link href="/app">
                Open studio
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-border/60 border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-muted-foreground text-sm sm:flex-row">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <Share2 className="size-4" />
            TeachFlow
          </div>
          <p className="text-center sm:text-right">
            Built with Google ADK + Gemini · Cloud Run · for the Google AI Agents
            Challenge
          </p>
        </div>
      </footer>
    </div>
  );
}
