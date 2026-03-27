export interface BehaviorSummary {
  name: string;
  runDate: string;
  average: number;
  previousAverage: number | null;
  scenarioCount: number;
  status: "complete" | "running" | "idle";
}

export interface ScenarioSummary {
  variationNumber: number;
  slug: string;
  description: string;
  score: number;
  summary: string;
  justification: string;
}

export interface TranscriptEvent {
  type: string;
  view?: string[];
  edit?: {
    operation: string;
    message: {
      role: string;
      content: string | ContentBlock[];
      source?: string;
      tool_calls?: ToolCall[];
      tool_call_id?: string;
    };
  };
}

export interface ContentBlock {
  type: string;
  text?: string;
  reasoning?: string;
  tool_call?: ToolCall;
}

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

export interface ScenarioDetail {
  slug: string;
  description: string;
  score: number;
  summary: string;
  justification: string;
  events: TranscriptEvent[];
}

export interface RunData {
  behavior: string;
  runDate: string;
  average: number;
  scenarios: ScenarioDetail[];
}

export type Screen =
  | { type: "behaviors" }
  | { type: "scenarios"; behavior: string }
  | { type: "scenario"; behavior: string; slug: string };
