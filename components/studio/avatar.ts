// Maps an avatarColor token (see students POST palette) to a Tailwind bg class.
export const AVATAR_COLOR_CLASS: Record<string, string> = {
  rose: "bg-rose-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  teal: "bg-teal-500",
  sky: "bg-sky-500",
  indigo: "bg-indigo-500",
  violet: "bg-violet-500",
  fuchsia: "bg-fuchsia-500",
};

export function avatarColorClass(color?: string | null): string {
  return (color && AVATAR_COLOR_CLASS[color]) || "bg-zinc-400";
}

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
