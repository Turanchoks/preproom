import type { Metadata } from "next";
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
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
        <span className="text-lg font-bold tracking-tight text-gray-900">
          Teach<span className="text-blue-600">Flow</span>
        </span>
        <span className="text-xs font-medium text-gray-400">Shared by your teacher</span>
      </div>
    </header>
  );
}

export default function SharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <ShareHeader />
      <Suspense fallback={<ShareLoading />}>
        <ShareContent params={params} />
      </Suspense>
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
