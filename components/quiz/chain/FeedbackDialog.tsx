"use client";

import { Dialog } from "radix-ui";
import { useChainRunner } from "../core/chain-runner";
import { emojiGlyph } from "../lib/feedback-presentation";
import { cn } from "../lib/cn";

const STATUS_BG: Record<string, string> = {
  correct: "from-green-50 to-emerald-50",
  almost: "from-amber-50 to-orange-50",
  incorrect: "from-red-50 to-rose-50",
};

export function FeedbackDialog() {
  const interaction = useChainRunner((s) => s.currentInteraction);
  const advance = useChainRunner((s) => s.advanceAfterFeedback);

  const fb = interaction?.feedbackData ?? null;
  const open = !!fb;

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-2xl rounded-t-3xl border border-gray-200 bg-gradient-to-br p-6 shadow-2xl outline-none",
            fb ? STATUS_BG[fb.status] : "from-white to-white",
          )}
        >
          {fb ? (
            <>
              <Dialog.Title className="flex items-center gap-3 text-2xl font-bold text-gray-900">
                <span className="text-3xl">{emojiGlyph(fb.emoji)}</span>
                {fb.title}
              </Dialog.Title>
              {fb.hint ? (
                <Dialog.Description className="mt-2 text-sm text-gray-700">
                  {fb.hint}
                </Dialog.Description>
              ) : null}
              {fb.primaryText ? (
                <p className="mt-3 text-base text-gray-900">{fb.primaryText}</p>
              ) : null}
              {fb.secondaryText ? (
                <p className="mt-1 text-sm text-gray-600">{fb.secondaryText}</p>
              ) : null}
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => advance()}
                  className="rounded-xl bg-blue-600 px-6 py-2 font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  Continue
                </button>
              </div>
            </>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
