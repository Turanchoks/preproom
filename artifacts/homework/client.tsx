import { toast } from "sonner";
import { Artifact } from "@/components/chat/create-artifact";
import { DocumentSkeleton } from "@/components/chat/document-skeleton";
import { GlobeIcon, ShareIcon } from "@/components/chat/icons";
import { QuizPlayer } from "@/components/quiz/quiz-player";
import {
  type HomeworkExercise,
  parseHomework,
} from "@/lib/quiz/homework-schema";

type HomeworkArtifactMetadata = Record<string, never>;

const EXERCISE_TYPE_LABELS: Record<string, string> = {
  "multiple-choice": "Multiple choice",
  "fill-blank": "Fill the blank",
  "word-matching": "Word matching",
  "fill-gaps": "Fill the gaps",
  "word-puzzle": "Word puzzle",
};

async function createShareLink(documentId: string): Promise<string> {
  const res = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/share`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    }
  );

  if (!res.ok) {
    throw new Error("Failed to create share link");
  }

  const { url } = (await res.json()) as { slug: string; url: string };
  return `${window.location.origin}${url}`;
}

/**
 * Partial homework snapshot type used while streaming. Each streamed delta
 * carries the FULL current partial object (snapshot semantics), so we can
 * JSON.parse the latest content directly.
 */
type PartialHomework = {
  title?: string;
  lessonSummary?: string;
  exercises?: Array<Partial<HomeworkExercise>>;
};

function HomeworkStreamingPreview({ content }: { content: string }) {
  let snapshot: PartialHomework = {};
  try {
    snapshot = JSON.parse(content) as PartialHomework;
  } catch {
    snapshot = {};
  }

  const exercises = (snapshot.exercises ?? []).filter(
    (ex): ex is Partial<HomeworkExercise> => Boolean(ex)
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-8 md:px-8">
      {snapshot.title ? (
        <h1 className="font-semibold text-2xl tracking-tight">
          {snapshot.title}
        </h1>
      ) : (
        <div className="h-7 w-2/3 animate-pulse rounded bg-muted-foreground/10" />
      )}

      {snapshot.lessonSummary ? (
        <p className="text-muted-foreground text-sm">{snapshot.lessonSummary}</p>
      ) : null}

      <div className="flex flex-col gap-3">
        {exercises.map((exercise, index) => (
          <div
            className="rounded-lg border border-border/60 bg-background p-4"
            key={exercise.id ?? `ex-${index}`}
          >
            <div className="mb-1 flex items-center gap-2">
              {exercise.type ? (
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-medium text-[11px] text-muted-foreground">
                  {EXERCISE_TYPE_LABELS[exercise.type] ?? exercise.type}
                </span>
              ) : null}
              <span className="text-[11px] text-muted-foreground tabular-nums">
                Exercise {index + 1} of ~6
              </span>
            </div>
            {exercise.title ? (
              <div className="font-medium text-sm">{exercise.title}</div>
            ) : (
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted-foreground/10" />
            )}
            {exercise.instructions ? (
              <div className="mt-1 text-muted-foreground text-xs">
                {exercise.instructions}
              </div>
            ) : null}
          </div>
        ))}
        {exercises.length === 0 ? (
          <div className="flex flex-col gap-2">
            <div className="h-16 animate-pulse rounded-lg bg-muted-foreground/5" />
            <div className="h-16 animate-pulse rounded-lg bg-muted-foreground/5" />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export const homeworkArtifact = new Artifact<"homework", HomeworkArtifactMetadata>(
  {
    kind: "homework",
    description:
      "Interactive homework exercise set for a student — use for homework/quiz requests.",
    onStreamPart: ({ streamPart, setArtifact }) => {
      if (streamPart.type === "data-homeworkDelta") {
        setArtifact((draftArtifact) => ({
          ...draftArtifact,
          // Snapshot semantics: the delta REPLACES the draft content.
          content: streamPart.data as string,
          isVisible: true,
          status: "streaming",
        }));
      }
    },
    content: ({ content, status, isLoading }) => {
      if (isLoading) {
        return <DocumentSkeleton artifactKind="text" />;
      }

      if (status === "streaming") {
        return <HomeworkStreamingPreview content={content} />;
      }

      const homework = parseHomework(content);

      if (!homework) {
        return (
          <div className="mx-auto w-full max-w-2xl px-4 py-8 text-muted-foreground text-sm">
            This homework could not be parsed yet. Try asking the assistant to
            regenerate it.
          </div>
        );
      }

      return (
        <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-8">
          <QuizPlayer homework={homework} mode="preview" />
        </div>
      );
    },
    actions: [
      {
        icon: <ShareIcon size={18} />,
        description: "Copy share link",
        onClick: async ({ documentId }) => {
          const url = await createShareLink(documentId);
          await navigator.clipboard.writeText(url);
          toast.success("Share link copied");
        },
      },
      {
        icon: <GlobeIcon size={18} />,
        description: "Open share page",
        onClick: async ({ documentId }) => {
          const url = await createShareLink(documentId);
          window.open(url, "_blank", "noopener,noreferrer");
        },
      },
    ],
    toolbar: [],
  }
);
