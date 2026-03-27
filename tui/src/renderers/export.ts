import { writeFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { TranscriptData, TranscriptEvent } from "../data/types.js";
import type { TranscriptView } from "./transcript.js";

function extractContent(
  content: string | Array<{ type: string; text?: string; reasoning?: string }>,
): { text: string; thinking: string } {
  if (typeof content === "string") {
    return { text: content, thinking: "" };
  }

  const textParts: string[] = [];
  const thinkingParts: string[] = [];

  for (const block of content) {
    if (block.type === "reasoning" && block.reasoning) thinkingParts.push(block.reasoning);
    if (block.type === "text" && block.text) textParts.push(block.text);
  }

  return {
    text: textParts.join("\n\n"),
    thinking: thinkingParts.join("\n\n"),
  };
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

function formatToolCalls(toolCalls: NonNullable<TranscriptEvent["edit"]["message"]["tool_calls"]>): string {
  const parts: string[] = [];
  for (const toolCall of toolCalls) {
    const fn = toolCall.function;
    const name = typeof fn === "string" ? fn : (fn?.name ?? "unknown");
    const rawArgs = typeof fn === "string"
      ? ((toolCall as Record<string, unknown>).arguments ?? "{}")
      : (fn?.arguments ?? "{}");
    const args = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs, null, 2);
    parts.push(`**${name}**(${args})`);
  }
  return parts.join("\n\n");
}

export function exportTranscriptMarkdown(
  transcript: TranscriptData,
  view: TranscriptView,
  behavior: string,
  label: string,
): string {
  const contextCount = transcript.metadata.context_event_count ?? 0;
  const toolNameMap = buildToolCallMap(transcript.events);
  const lines: string[] = [];

  lines.push(`# ${behavior} — ${label}`);
  lines.push(`> View: ${view} | Model: ${transcript.metadata.target_model}`);
  lines.push("");

  let inContext = true;

  for (let index = 0; index < transcript.events.length; index++) {
    const event = transcript.events[index]!;
    if (!event.view.includes(view)) continue;

    const message = event.edit?.message;
    if (!message || message.role === "system") continue;

    if (inContext && index >= contextCount && contextCount > 0) {
      inContext = false;
      lines.push("---");
      lines.push("*Context ends, target response begins*");
      lines.push("");
    }

    if (message.role === "tool") {
      const toolName =
        message.name ||
        (message.tool_call_id ? toolNameMap.get(message.tool_call_id) : undefined) ||
        "result";
      const content = typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
      lines.push(`> **${toolName}** returned:`);
      lines.push("> ```");
      for (const line of content.split("\n")) {
        lines.push(`> ${line}`);
      }
      lines.push("> ```");
      lines.push("");
      continue;
    }

    const roleLabel = message.role === "user" ? "H" : "AI";
    const { text, thinking } = extractContent(message.content);
    lines.push(`### ${roleLabel}:`);
    lines.push("");

    if (thinking) {
      lines.push("<thinking>");
      lines.push(thinking);
      lines.push("</thinking>");
      lines.push("");
    }

    if (text) {
      lines.push(text);
      lines.push("");
    }

    if (message.tool_calls) {
      lines.push(formatToolCalls(message.tool_calls));
      lines.push("");
    }
  }

  return lines.join("\n");
}

export function exportToDownloads(
  transcript: TranscriptData,
  view: TranscriptView,
  behavior: string,
  label: string,
  variationNumber: number,
): string {
  const markdown = exportTranscriptMarkdown(transcript, view, behavior, label);
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 50);
  const filename = `${behavior}_v${variationNumber}_${view}_${safeLabel}.md`;
  const filePath = join(homedir(), "Downloads", filename);
  writeFileSync(filePath, markdown, "utf-8");
  return filePath;
}
