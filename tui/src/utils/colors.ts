export function scoreColor(score: number): string {
  if (score >= 8) return "green";
  if (score >= 5) return "yellow";
  return "red";
}

export function deltaString(current: number, previous: number | null): string {
  if (previous === null) return "NEW";
  const delta = current - previous;
  if (delta === 0) return "=";
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)}`;
}

export function deltaColor(current: number, previous: number | null): string {
  if (previous === null) return "cyan";
  const delta = current - previous;
  if (delta > 0) return "green";
  if (delta < 0) return "red";
  return "gray";
}
