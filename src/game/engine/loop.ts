export function fixedSteps(
  elapsedMs: number,
  fixedDtMs = 16.6667,
  maxSteps = 5,
): number {
  if (
    !Number.isFinite(elapsedMs) ||
    elapsedMs <= 0 ||
    !Number.isFinite(fixedDtMs) ||
    fixedDtMs <= 0
  ) {
    return 0;
  }
  return Math.min(
    maxSteps,
    Math.max(0, Math.floor((elapsedMs + 0.001) / fixedDtMs)),
  );
}
