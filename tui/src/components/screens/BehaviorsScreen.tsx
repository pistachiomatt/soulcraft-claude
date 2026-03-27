import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { BehaviorSummary } from "../../utils/types.js";
import { scoreColor, deltaString, deltaColor } from "../../utils/colors.js";
import { Header } from "../parts/Header.js";
import { Footer } from "../parts/Footer.js";

interface Props {
  behaviors: BehaviorSummary[];
  projectDir: string;
  onSelect: (behavior: string) => void;
  onQuit: () => void;
}

export const BehaviorsScreen: React.FC<Props> = ({
  behaviors,
  projectDir,
  onSelect,
  onQuit,
}) => {
  const [cursor, setCursor] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 40;
  const termWidth = stdout?.columns ?? 80;
  const headerLines = 4;
  const footerLines = 2;
  const contentHeight = Math.max(3, termHeight - headerLines - footerLines);

  useInput((input, key) => {
    if (input === "q") return onQuit();
    if (key.return && behaviors.length > 0) return onSelect(behaviors[cursor].name);
    if (key.upArrow || input === "k") {
      const next = Math.max(0, cursor - 1);
      setCursor(next);
      if (next < scrollTop) setScrollTop(next);
    }
    if (key.downArrow || input === "j") {
      const next = Math.min(behaviors.length - 1, cursor + 1);
      setCursor(next);
      if (next >= scrollTop + contentHeight) setScrollTop(next - contentHeight + 1);
    }
  });

  const visible = behaviors.slice(scrollTop, scrollTop + contentHeight);
  const scoreBar = (score: number, width: number = 12) => {
    const filled = Math.round((score / 10) * width);
    return "\u2588".repeat(filled) + "\u2591".repeat(width - filled);
  };

  return (
    <Box flexDirection="column" height={termHeight} width={termWidth}>
      <Header
        crumbs={[{ label: "Soulcraft" }]}
        meta={`${behaviors.length} behavior${behaviors.length !== 1 ? "s" : ""}`}
        subtitle={projectDir}
      />

      <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
        {behaviors.length === 0 ? (
          <Box paddingX={1} paddingY={1}>
            <Text color="gray">No results yet. Run </Text>
            <Text color="cyan">soulcraft test</Text>
            <Text color="gray"> to generate evals.</Text>
          </Box>
        ) : (
          visible.map((b, vi) => {
            const i = scrollTop + vi;
            const selected = i === cursor;
            const delta = deltaString(b.average, b.previousAverage);
            const dColor = deltaColor(b.average, b.previousAverage);
            const statusLabel = b.status === "running" ? " running..." : "";

            return (
              <Box key={b.name} paddingX={1}>
                <Text color={selected ? "cyan" : "gray"}>{selected ? "\u25b8 " : "  "}</Text>
                <Box width={20}>
                  <Text bold={selected} color={selected ? "white" : "gray"}>
                    {b.name}
                  </Text>
                </Box>
                <Box width={8}>
                  <Text color={scoreColor(b.average)} bold>
                    {b.average.toFixed(1)}/10
                  </Text>
                </Box>
                <Box width={14}>
                  <Text color={scoreColor(b.average)}>{scoreBar(b.average)}</Text>
                </Box>
                <Box width={7}>
                  <Text color={dColor}>{delta.padStart(5)}</Text>
                </Box>
                <Text color="gray">
                  {`${b.scenarioCount} scenario${b.scenarioCount !== 1 ? "s" : ""}`}
                </Text>
                {statusLabel && <Text color="yellow">{statusLabel}</Text>}
              </Box>
            );
          })
        )}
      </Box>

      <Footer
        hints={[
          { key: "j/k", label: "navigate" },
          { key: "\u23ce", label: "view" },
          { key: "q", label: "quit" },
        ]}
        scrollInfo={behaviors.length > contentHeight ? `${cursor + 1}/${behaviors.length}` : undefined}
      />
    </Box>
  );
};
