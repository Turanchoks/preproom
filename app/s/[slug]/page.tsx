import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSharedDocumentBySlug } from "@/lib/db/queries-studio";
import { parseHomework } from "@/lib/quiz/homework-schema";
import { MessageResponse } from "@/components/ai-elements/message";
import { ShareHomework } from "./share-homework";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const result = await getSharedDocumentBySlug({ slug });
  return {
    title: result ? `${result.document.title} · TeachFlow` : "TeachFlow",
  };
}

function ShareHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <Link
          className="flex items-center gap-2 text-lg font-bold tracking-tight text-gray-900 transition-opacity hover:opacity-80"
          href="/"
        >
          <span className="flex size-6 items-center justify-center rounded-md bg-gray-900 text-[11px] font-bold text-white">
            T
          </span>
          Teach<span className="-ml-2 text-blue-600">Flow</span>
        </Link>
        <span className="text-xs font-medium text-gray-400">
          Shared by your teacher
        </span>
      </div>
    </header>
  );
}

function ShareFooter() {
  return (
    <footer className="mt-auto border-t border-gray-200/70 py-6">
      <p className="text-center text-xs text-gray-400">
        Made with{" "}
        <Link
          className="font-medium text-gray-500 transition-colors hover:text-blue-600"
          href="/"
        >
          TeachFlow
        </Link>
      </p>
    </footer>
  );
}

export default function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-gray-50 text-gray-900">
      <ShareHeader />
      <div className="flex-1">
        <Suspense fallback={<ShareLoading />}>
          <ShareContent params={params} />
        </Suspense>
      </div>
      <ShareFooter />
    </main>
  );
}

function ShareLoading() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-16 text-center text-gray-400">
      Loading…
    </div>
  );
}

async function ShareContent({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const result = await getSharedDocumentBySlug({ slug });

  if (!result) {
    notFound();
  }

  const { document } = result;
  const content = document.content ?? "";

  let body: React.ReactNode;

  if (document.kind === "homework") {
    const homework = parseHomework(content);
    if (!homework || homework.exercises.length === 0) {
      body = (
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <h1 className="text-2xl font-semibold text-gray-900">
            This homework couldn&apos;t be loaded
          </h1>
          <p className="mt-2 text-gray-500">
            The link may be broken or the homework is no longer available.
          </p>
        </div>
      );
    } else {
      body = <ShareHomework homework={homework} />;
    }
  } else {
    // text / code / sheet — render the content as read-only markdown.
    body = (
      <article className="prose prose-gray mx-auto max-w-3xl px-4 py-10">
        <MessageResponse>{content}</MessageResponse>
      </article>
    );
  }

  return body;
}
