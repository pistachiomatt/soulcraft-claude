import type { TranscriptEvent } from "../data/types.js";
import type { StyledLine } from "./types.js";
import { wrapText } from "./wrap.js";

const INDENT = "  ";

export type TranscriptView = "target" | "evaluator";

interface RenderOptions {
  showThinking: boolean;
  contextCount: number;
  width: number;
  view?: TranscriptView;
}

function extractContent(
  content: string | Array<{ type: string; text?: string; reasoning?: string }>,
  showThinking: boolean,
): { textParts: string[]; thinkingParts: string[] } {
  if (typeof content === "string") {
    return { textParts: [content], thinkingParts: [] };
  }

  const textParts: string[] = [];
  const thinkingParts: string[] = [];

  for (const block of content) {
    if (block.type === "reasoning" && block.reasoning && showThinking) {
      thinkingParts.push(block.reasoning);
    } else if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
  }

  return { textParts, thinkingParts };
}

function buildToolCallMap(events: TranscriptEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const event of events) {
    const message = event.edit?.message;
    if (!message?.tool_calls) continue;
    for (const toolCall of message.tool_calls) {
      if (!toolCall.id) continue;
      const fn = toolCall.function;
      const name = typeof fn === "string" ? fn : fn?.name;
      if (name) map.set(toolCall.id, name);
    }
  }
  return map;
}

export function renderTranscript(events: TranscriptEvent[], opts: RenderOptions): StyledLine[] {
  const lines: StyledLine[] = [];
  const contentWidth = opts.width - 4;
  const viewFilter = opts.view ?? "target";
  const toolNameMap = buildToolCallMap(events);

  for (let index = 0; index < events.length; index++) {
    const event = events[index]!;
    if (!event.view.includes(viewFilter)) continue;

    const message = event.edit?.message;
    if (!message || message.role === "system") continue;

    const isContext = index < opts.contextCount;

    if (message.role === "tool") {
      const toolName =
        message.name ||
        (message.tool_call_id ? toolNameMap.get(message.tool_call_id) : undefined) ||
        "result";
      const content = typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
      const pad = INDENT + INDENT;
      const innerWidth = contentWidth - pad.length - 4;
      const wrapped = wrapText(content, innerWidth);
      const boxWidth = innerWidth + 2;

      lines.push({
        text: `${pad}┌─ ${toolName} ${"─".repeat(Math.max(0, boxWidth - toolName.length - 3))}┐`,
        color: "gray",
        eventIndex: index,
      });
      for (const line of wrapped) {
        const padRight = Math.max(0, innerWidth - line.length);
        lines.push({
          text: `${pad}│ ${line}${" ".repeat(padRight)} │`,
          color: "gray",
          eventIndex: index,
        });
      }
      lines.push({
        text: `${pad}└${"─".repeat(boxWidth)}┘`,
        color: "gray",
        eventIndex: index,
      });
      continue;
    }

    const isUser = message.role === "user";
    lines.push({
      text: isUser ? "H" : "A",
      color: isContext ? "gray" : isUser ? "blue" : "green",
      bold: !isContext,
      eventIndex: index,
    });

    const { textParts, thinkingParts } = extractContent(message.content, opts.showThinking);

    for (const thinking of thinkingParts) {
      for (const line of wrapText(thinking, contentWidth - 6)) {
        lines.push({ text: `${INDENT}│ ${line}`, color: "green", eventIndex: index });
      }
      lines.push({ text: "", eventIndex: index });
    }

    for (const text of textParts) {
      if (!text.trim()) continue;
      for (const line of wrapText(text, contentWidth - INDENT.length)) {
        lines.push({
          text: INDENT + line,
          color: isContext ? "gray" : isUser ? "blue" : undefined,
          eventIndex: index,
        });
      }
    }

    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        const fn = toolCall.function;
        const name = typeof fn === "string" ? fn : (fn?.name ?? "unknown");
        const rawArgs = typeof fn === "string"
          ? ((toolCall as Record<string, unknown>).arguments ?? "{}")
          : (fn?.arguments ?? "{}");
        const args = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
        const truncated = args.length > 60 ? `${args.slice(0, 57)}…` : args;
        lines.push({
          text: `${INDENT}▶ ${name}(${truncated})`,
          color: isContext ? "gray" : "cyan",
          eventIndex: index,
        });
      }
    }

    lines.push({ text: "", eventIndex: index });
  }

  return lines;
}
