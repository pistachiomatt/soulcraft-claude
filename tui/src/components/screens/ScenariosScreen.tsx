import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { RunData } from "../../utils/types.js";
import { scoreColor, deltaString, deltaColor } from "../../utils/colors.js";
import { Header } from "../parts/Header.js";
import { Footer } from "../parts/Footer.js";

interface Props {
  run: RunData;
  previousAverage: number | null;
  onSelect: (slug: string) => void;
  onBack: () => void;
  onQuit: () => void;
}

export const ScenariosScreen: React.FC<Props> = ({
  run,
  previousAverage,
  onSelect,
  onBack,
  onQuit,
}) => {
  const [cursor, setCursor] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 40;
  const termWidth = stdout?.columns ?? 80;
  const headerLines = 4;
  const footerLines = 2;
  // Each scenario row takes 2 lines (name+score, then truncated summary)
  const rowHeight = 2;
  const contentHeight = Math.max(3, termHeight - headerLines - footerLines);
  const visibleRows = Math.floor(contentHeight / rowHeight);

  useInput((input, key) => {
    if (input === "q") return onQuit();
    if (key.escape || input === "h") return onBack();
    if (key.return && run.scenarios.length > 0) return onSelect(run.scenarios[cursor].slug);
    if (key.upArrow || input === "k") {
      const next = Math.max(0, cursor - 1);
      setCursor(next);
      if (next < scrollTop) setScrollTop(next);
    }
    if (key.downArrow || input === "j") {
      const next = Math.min(run.scenarios.length - 1, cursor + 1);
      setCursor(next);
      if (next >= scrollTop + visibleRows) setScrollTop(next - visibleRows + 1);
    }
  });

  const delta = deltaString(run.average, previousAverage);
  const dColor = deltaColor(run.average, previousAverage);
  const visible = run.scenarios.slice(scrollTop, scrollTop + visibleRows);
  const summaryWidth = Math.max(20, termWidth - 12);

  return (
    <Box flexDirection="column" height={termHeight} width={termWidth}>
      <Header
        crumbs={[
          { label: "Soulcraft", dim: true },
          { label: run.behavior },
          { label: `${run.average.toFixed(1)}/10`, color: scoreColor(run.average) },
        ]}
        meta={`${run.scenarios.length} scenario${run.scenarios.length !== 1 ? "s" : ""}`}
        subtitle={`Run: ${run.runDate}${delta !== "=" ? `  ${delta} from previous` : ""}`}
      />

      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {visible.map((s, vi) => {
          const i = scrollTop + vi;
          const selected = i === cursor;
          const truncSummary = s.summary.length > summaryWidth
            ? s.summary.slice(0, summaryWidth - 1) + "\u2026"
            : s.summary;

          return (
            <Box key={s.slug} flexDirection="column" paddingX={1}>
              <Box>
                <Text color={selected ? "cyan" : "gray"}>{selected ? "\u25b8 " : "  "}</Text>
                <Text bold={selected} color={selected ? "white" : "gray"}>
                  {s.slug}
                </Text>
                <Text> </Text>
                <Text color={scoreColor(s.score)} bold>{s.score}/10</Text>
              </Box>
              <Box paddingLeft={4}>
                <Text color="gray" wrap="truncate">{truncSummary}</Text>
              </Box>
            </Box>
          );
        })}
      </Box>

      <Footer
        hints={[
          { key: "j/k", label: "navigate" },
          { key: "\u23ce", label: "view" },
          { key: "esc", label: "back" },
          { key: "q", label: "quit" },
        ]}
        scrollInfo={run.scenarios.length > visibleRows ? `${cursor + 1}/${run.scenarios.length}` : undefined}
      />
    </Box>
  );
};
