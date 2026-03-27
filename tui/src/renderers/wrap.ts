export function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];

  const lines: string[] = [];

  for (const rawLine of text.split("\n")) {
    if (rawLine.length <= width) {
      lines.push(rawLine);
      continue;
    }

    let remaining = rawLine;
    while (remaining.length > width) {
      let breakAt = remaining.lastIndexOf(" ", width);
      if (breakAt <= 0) breakAt = width;
      lines.push(remaining.slice(0, breakAt));
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) lines.push(remaining);
  }

  return lines;
}
