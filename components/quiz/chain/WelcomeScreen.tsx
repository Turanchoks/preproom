"use client";

import { useChainRunner } from "../core/chain-runner";

export function WelcomeScreen() {
  const config = useChainRunner((s) => s.welcomeScreen);
  const startChain = useChainRunner((s) => s.startChain);
  const total = useChainRunner((s) => s.exercises.length);

  if (!config) return null;

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200/80 bg-white p-8 shadow-[0_1px_3px_rgba(0,0,0,0.06),0_8px_24px_-12px_rgba(0,0,0,0.12)]">
      {config.coverImage ? (
        <div className="mb-6 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.coverImage} alt="" className="block w-full" />
        </div>
      ) : null}
      <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
        Homework
      </span>
      <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight text-gray-900">
        {config.title}
      </h1>
      <p className="mt-2 leading-relaxed text-gray-600">{config.description}</p>
      {config.author ? (
        <p className="mt-4 text-sm text-gray-500">
          {config.authorPrefix ?? "by"}{" "}
          <span className="font-medium">{config.author}</span>
        </p>
      ) : null}
      <p className="mt-6 text-sm text-gray-500">
        {total} {total === 1 ? "question" : "questions"}
      </p>
      <button
        type="button"
        onClick={startChain}
        className="mt-6 inline-flex items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-medium text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 active:translate-y-0"
      >
        {config.startButtonText ?? "Start"}
      </button>
    </div>
  );
}
