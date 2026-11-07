export const GENRES = [
  "hill_climb",
  "sports_ball",
  "endless_runner",
  "diorama_viewer",
] as const;

export type Genre = (typeof GENRES)[number];

export function isGenre(value: unknown): value is Genre {
  return (
    typeof value === "string" && (GENRES as readonly string[]).includes(value)
  );
}
