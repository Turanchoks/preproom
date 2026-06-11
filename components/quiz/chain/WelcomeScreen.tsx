"use client";

import { useChainRunner } from "../core/chain-runner";

export function WelcomeScreen() {
  const config = useChainRunner((s) => s.welcomeScreen);
  const startChain = useChainRunner((s) => s.startChain);
  const total = useChainRunner((s) => s.exercises.length);

  if (!config) return null;

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
      {config.coverImage ? (
        <div className="mb-6 overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={config.coverImage} alt="" className="block w-full" />
        </div>
      ) : null}
      <h1 className="text-3xl font-bold text-gray-900">{config.title}</h1>
      <p className="mt-2 text-gray-600">{config.description}</p>
      {config.author ? (
        <p className="mt-4 text-sm text-gray-500">
          {config.authorPrefix ?? "by"} <span className="font-medium">{config.author}</span>
        </p>
      ) : null}
      <p className="mt-6 text-sm text-gray-500">
        {total} {total === 1 ? "question" : "questions"}
      </p>
      <button
        type="button"
        onClick={startChain}
        className="mt-6 inline-block rounded-xl bg-blue-600 px-6 py-3 font-medium text-white shadow-sm hover:bg-blue-700"
      >
        {config.startButtonText ?? "Start"}
      </button>
    </div>
  );
}
