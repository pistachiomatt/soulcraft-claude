import React, { useState, useMemo } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { ScenarioDetail } from "../../utils/types.js";
import { scoreColor } from "../../utils/colors.js";
import { parseTranscript, truncate, type ParsedMessage } from "../../utils/transcript.js";
import { Header } from "../parts/Header.js";
import { Footer } from "../parts/Footer.js";

interface Props {
  behavior: string;
  scenario: ScenarioDetail;
  scenarioIndex: number;
  scenarioCount: number;
  onBack: () => void;
  onQuit: () => void;
  onPrevScenario: () => void;
  onNextScenario: () => void;
}

type Tab = "summary" | "transcript";

export const ScenarioScreen: React.FC<Props> = ({
  behavior,
  scenario,
  scenarioIndex,
  scenarioCount,
  onBack,
  onQuit,
  onPrevScenario,
  onNextScenario,
}) => {
  const [tab, setTab] = useState<Tab>("summary");
  const [summaryScroll, setSummaryScroll] = useState(0);
  const [transcriptScroll, setTranscriptScroll] = useState(0);
  const { stdout } = useStdout();
  const termWidth = stdout?.columns ?? 80;
  const termHeight = stdout?.rows ?? 40;
  const headerLines = 5; // crumbs + subtitle + separator + tabs + blank
  const footerLines = 2;
  const contentHeight = Math.max(5, termHeight - headerLines - footerLines);
  const wrapWidth = Math.max(40, termWidth - 6);

  const messages = useMemo(() => parseTranscript(scenario.events), [scenario.events]);

  const summaryLines = useMemo(() => buildSummaryLines(scenario, wrapWidth), [scenario, wrapWidth]);
  const transcriptLines = useMemo(() => buildTranscriptLines(messages, wrapWidth), [messages, wrapWidth]);

  const scroll = tab === "summary" ? summaryScroll : transcriptScroll;
  const setScroll = tab === "summary" ? setSummaryScroll : setTranscriptScroll;
  const totalLines = tab === "summary" ? summaryLines.length : transcriptLines.length;
  const maxScroll = Math.max(0, totalLines - contentHeight);

  useInput((input, key) => {
    if (input === "q") return onQuit();
    if (key.escape || input === "h") return onBack();

    // Tab switching (preserves scroll per tab)
    if (input === "\t" || (key.leftArrow && tab === "transcript") || (key.rightArrow && tab === "summary")) {
      setTab(t => t === "summary" ? "transcript" : "summary");
      return;
    }

    // Scenario jumping
    if (input === "[") return onPrevScenario();
    if (input === "]") return onNextScenario();

    // Clamped scrolling
    if (key.upArrow || input === "k") setScroll(s => Math.max(0, s - 1));
    if (key.downArrow || input === "j") setScroll(s => Math.min(maxScroll, s + 1));
    if (key.pageUp) setScroll(s => Math.max(0, s - contentHeight));
    if (key.pageDown) setScroll(s => Math.min(maxScroll, s + contentHeight));
    if (input === "g") setScroll(0);
    if (input === "G") setScroll(maxScroll);
  });

  const lines = tab === "summary" ? summaryLines : transcriptLines;
  const visible = lines.slice(scroll, scroll + contentHeight);

  return (
    <Box flexDirection="column" height={termHeight} width={termWidth}>
      <Header
        crumbs={[
          { label: "Soulcraft", dim: true },
          { label: behavior, dim: true },
          { label: scenario.slug },
          { label: `${scenario.score}/10`, color: scoreColor(scenario.score) },
        ]}
        meta={`${scenarioIndex + 1}/${scenarioCount}`}
        subtitle={truncate(scenario.description.replace(/\*\*/g, "").replace(/\n/g, " "), termWidth - 4)}
      />

      {/* Tabs */}
      <Box paddingX={1} gap={1}>
        <Text bold={tab === "summary"} color={tab === "summary" ? "cyan" : "gray"}>
          {tab === "summary" ? "[Summary]" : " Summary "}
        </Text>
        <Text bold={tab === "transcript"} color={tab === "transcript" ? "cyan" : "gray"}>
          {tab === "transcript" ? "[Transcript]" : " Transcript "}
        </Text>
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingX={2} overflow="hidden">
        {visible.map((line, i) => line.element ?? <Text key={scroll + i}> </Text>)}
      </Box>

      <Footer
        hints={[
          { key: "tab", label: "switch" },
          { key: "j/k", label: "scroll" },
          { key: "[ ]", label: "prev/next scenario" },
          { key: "esc", label: "back" },
        ]}
        scrollInfo={totalLines > contentHeight ? `${Math.min(scroll + 1, totalLines)}..${Math.min(scroll + contentHeight, totalLines)}/${totalLines}` : undefined}
      />
    </Box>
  );
};

// --- Line building (pre-computed for fast scrolling) ---

interface Line {
  element: React.ReactElement;
}

function buildSummaryLines(scenario: ScenarioDetail, wrapWidth: number): Line[] {
  const lines: Line[] = [];
  let key = 0;

  const heading = (text: string) => {
    lines.push({ element: <Text key={key++}> </Text> });
    lines.push({ element: <Text key={key++} bold color="cyan">{text}</Text> });
  };
  const body = (text: string) => {
    for (const line of wrapText(text, wrapWidth)) {
      lines.push({ element: <Text key={key++}>{line}</Text> });
    }
  };

  heading("Summary");
  body(scenario.summary);

  heading("Justification");
  body(scenario.justification);

  return lines;
}

function buildTranscriptLines(messages: ParsedMessage[], wrapWidth: number): Line[] {
  const lines: Line[] = [];
  let key = 0;

  for (const msg of messages) {
    // Skip system messages that are just empty
    if (msg.role === "system" && !msg.text?.trim()) continue;

    const roleColor =
      msg.role === "user" ? "blue"
        : msg.role === "assistant" ? "green"
          : msg.role === "system" ? "magenta"
            : "yellow";

    const roleLabel =
      msg.role === "user" ? "HUMAN"
        : msg.role === "assistant" ? "AI"
          : msg.role === "system" ? "SYSTEM"
            : msg.source === "builtin" ? "TOOL RESULT" : "SIMULATED TOOL";

    // Blank line before each message (except first)
    if (lines.length > 0) {
      lines.push({ element: <Text key={key++}> </Text> });
    }

    // Role header bar
    lines.push({
      element: (
        <Box key={key++}>
          <Text color={roleColor} bold inverse>{` ${roleLabel} `}</Text>
          {msg.role === "system" && (
            <Text color="gray"> system prompt</Text>
          )}
        </Box>
      ),
    });

    // Thinking (indented blockquote)
    if (msg.thinking) {
      lines.push({ element: <Text key={key++}> </Text> });
      for (const line of wrapText(msg.thinking, wrapWidth - 4)) {
        lines.push({
          element: (
            <Text key={key++} color="gray" dimColor>
              {"  \u2502 "}{line}
            </Text>
          ),
        });
      }
    }

    // Text content
    if (msg.text) {
      for (const line of wrapText(msg.text, wrapWidth - 2)) {
        lines.push({
          element: <Text key={key++}>{"  "}{line}</Text>,
        });
      }
    }

    // Tool calls
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        lines.push({ element: <Text key={key++}> </Text> });

        let argsDisplay: string;
        try {
          const parsed = JSON.parse(tc.args);
          argsDisplay = Object.entries(parsed)
            .map(([k, v]) => {
              const val = typeof v === "string" ? truncate(v, wrapWidth - 12) : JSON.stringify(v);
              return `${k}: ${val}`;
            })
            .join("\n");
        } catch {
          argsDisplay = tc.args;
        }

        lines.push({
          element: (
            <Box key={key++} flexDirection="column" borderStyle="round" borderColor="cyan" marginLeft={2} paddingX={1} width={Math.min(wrapWidth - 2, 70)}>
              <Text bold color="cyan">{"\u2192"} {tc.name}</Text>
              <Text color="gray">{argsDisplay}</Text>
            </Box>
          ),
        });
      }
    }
  }

  return lines;
}

// --- Helpers ---

function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.trim().length === 0) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      if (current.length + word.length + 1 > width && current.length > 0) {
        lines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}
