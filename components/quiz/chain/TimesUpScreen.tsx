"use client";

import { useChainRunner } from "../core/chain-runner";

export function TimesUpScreen() {
  const startPractice = useChainRunner((s) => s.startPractice);
  const finish = useChainRunner((s) => s.finishChain);

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-amber-300 bg-amber-50 p-8 text-center">
      <h2 className="text-2xl font-bold text-amber-900">Time&apos;s up!</h2>
      <p className="mt-2 text-amber-800">
        You can keep practicing the unanswered questions, or end here.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <button
          type="button"
          onClick={() => finish("time-limit")}
          className="rounded-xl border-2 border-amber-300 bg-white px-6 py-2 font-medium text-amber-900 hover:bg-amber-100"
        >
          See results
        </button>
        <button
          type="button"
          onClick={() => startPractice()}
          className="rounded-xl bg-amber-600 px-6 py-2 font-medium text-white shadow-sm hover:bg-amber-700"
        >
          Keep practicing
        </button>
      </div>
    </div>
  );
}
