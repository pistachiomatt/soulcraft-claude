import type { Judgment } from "../data/types.js";
import type { StyledLine } from "./types.js";
import { wrapText } from "./wrap.js";

const INDENT = "  ";
const BULLET = "•";

function sectionHeader(title: string): StyledLine[] {
  return [
    { text: "" },
    { text: title, color: "cyan", bold: true },
    { text: "" },
  ];
}

function wrapParagraphs(text: string, width: number): StyledLine[] {
  const lines: StyledLine[] = [];
  for (const paragraph of text.split("\n\n")) {
    const cleaned = paragraph.replace(/\*\*/g, "").replace(/\n/g, " ").trim();
    if (!cleaned) continue;
    for (const line of wrapText(cleaned, width - INDENT.length)) {
      lines.push({ text: INDENT + line });
    }
    lines.push({ text: "" });
  }
  return lines;
}

export function renderSummary(judgment: Judgment, width: number): StyledLine[] {
  const lines: StyledLine[] = [];
  const contentWidth = width - 4;

  lines.push(...sectionHeader("Summary"));
  lines.push(...wrapParagraphs(judgment.summary, contentWidth));

  if (judgment.highlights && judgment.highlights.length > 0) {
    lines.push(...sectionHeader("Highlights"));
    for (const highlight of judgment.highlights) {
      for (const line of wrapText(`${BULLET} ${highlight.description}`, contentWidth - INDENT.length)) {
        lines.push({ text: INDENT + line, color: "white" });
      }
      const quote = highlight.quoted_text.length > 200
        ? `${highlight.quoted_text.slice(0, 197)}…`
        : highlight.quoted_text;
      for (const line of wrapText(`"${quote}"`, contentWidth - INDENT.length - 2)) {
        lines.push({ text: INDENT + "  " + line, dim: true });
      }
      lines.push({ text: "" });
    }
  }

  lines.push(...sectionHeader("Justification"));
  lines.push(...wrapParagraphs(judgment.justification, contentWidth));

  return lines;
}
