export function scoreColorName(score: number): string {
  if (score >= 9) return "greenBright";
  if (score >= 7) return "green";
  if (score >= 5) return "yellow";
  if (score >= 3) return "red";
  return "redBright";
}

export const DOTS = "·";
export const BULLET = "•";
