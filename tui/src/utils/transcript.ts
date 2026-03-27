import type { TranscriptEvent, ContentBlock } from "./types.js";

export interface ParsedMessage {
  role: "system" | "user" | "assistant" | "tool";
  text: string;
  thinking?: string;
  toolCalls?: Array<{ name: string; args: string }>;
  toolCallId?: string;
  source?: string;
}

export function parseTranscript(events: TranscriptEvent[]): ParsedMessage[] {
  const messages: ParsedMessage[] = [];

  for (const event of events) {
    if (event.type !== "transcript_event") continue;
    if (!event.view?.includes("target")) continue;
    if (!event.edit?.message) continue;

    const msg = event.edit.message;
    const role = msg.role as ParsedMessage["role"];
    let text = "";
    let thinking = "";
    const toolCalls: Array<{ name: string; args: string }> = [];

    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      for (const block of msg.content as ContentBlock[]) {
        if (block.type === "text" && block.text) {
          text += block.text;
        } else if (block.type === "reasoning" && block.reasoning) {
          thinking += block.reasoning;
        } else if (block.type === "tool_call" && block.tool_call) {
          toolCalls.push({
            name: block.tool_call.function.name,
            args: block.tool_call.function.arguments,
          });
        }
      }
    }

    // Extract tool_calls from message level too
    if (msg.tool_calls) {
      for (const tc of msg.tool_calls) {
        toolCalls.push({
          name: tc.function.name,
          args: tc.function.arguments,
        });
      }
    }

    messages.push({
      role,
      text,
      thinking: thinking || undefined,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      toolCallId: msg.tool_call_id,
      source: msg.source,
    });
  }

  return messages;
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}
