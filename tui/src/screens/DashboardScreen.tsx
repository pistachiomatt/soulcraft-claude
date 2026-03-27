import React, { useCallback, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { BehaviorSummary, RunInfo } from "../data/types.js";
import { Footer } from "../components/Footer.js";
import { Header } from "../components/Header.js";
import { ScoreBadge } from "../components/ScoreBadge.js";
import { ScrollableList } from "../components/ScrollableList.js";
import { useListNav } from "../hooks/useListNav.js";
import { useNav } from "../hooks/useNav.js";
import { DOTS } from "../theme.js";

interface Props {
  behaviors: BehaviorSummary[];
}

const DashboardRow = React.memo(function DashboardRow({
  behavior,
  run,
  isSelected,
  nameWidth,
  runLabel,
}: {
  behavior: BehaviorSummary;
  run: RunInfo | undefined;
  isSelected: boolean;
  nameWidth: number;
  runLabel: string | undefined;
}) {
  const stats = run?.judgment?.summary_statistics;

  const dateStr = run?.date
    ? `${run.date.getMonth() + 1}/${run.date.getDate()} ${run.date.getHours()}:${String(run.date.getMinutes()).padStart(2, "0")}`
    : "";

  return (
    <Box>
      <Box width={3}>
        <Text color="cyan" bold>{isSelected ? " ›" : "  "}</Text>
      </Box>
      <Box width={nameWidth}>
        <Text color={isSelected ? "white" : undefined} bold={isSelected} wrap="truncate">
          {behavior.name}
        </Text>
      </Box>
      <Box width={9}>
        {stats ? (
          <ScoreBadge
            score={Math.round(stats.average_behavior_presence_score * 10) / 10}
            bold={isSelected}
          />
        ) : run && run.transcriptCount > 0 ? (
          <Text color="yellow">pending</Text>
        ) : (
          <Text dimColor>{DOTS}</Text>
        )}
      </Box>
      <Box width={10}>
        {stats ? (
          <Text dimColor>
            {stats.min_behavior_presence_score}–{stats.max_behavior_presence_score}
          </Text>
        ) : run && run.transcriptCount > 0 ? (
          <Text dimColor>{run.transcriptCount} txn</Text>
        ) : (
          <Text dimColor>{DOTS}</Text>
        )}
      </Box>
      <Box width={6}>
        <Text dimColor>
          {stats?.total_judgments ?? (run && run.transcriptCount > 0 ? run.transcriptCount : DOTS)}
        </Text>
      </Box>
      <Box width={8}>
        {stats ? (
          <Text
            color={
              stats.elicitation_rate >= 0.8
                ? "green"
                : stats.elicitation_rate >= 0.5
                  ? "yellow"
                  : "red"
            }
          >
            {Math.round(stats.elicitation_rate * 100)}%
          </Text>
        ) : (
          <Text dimColor>{DOTS}</Text>
        )}
      </Box>
      <Box width={12}>
        <Text dimColor>{dateStr}</Text>
      </Box>
      <Box width={4}>
        {run?.evalMode === "last-turn" ? <Text color="magenta">LT</Text> : null}
        {run?.evalMode === "scenario" ? <Text color="blue">SC</Text> : null}
      </Box>
      {runLabel ? (
        <Box>
          <Text dimColor>{runLabel}</Text>
        </Box>
      ) : null}
    </Box>
  );
});

export function DashboardScreen({ behaviors }: Props) {
  const { stdout } = useStdout();
  const { navigate, savedIndex, saveIndex } = useNav();
  const rows = stdout?.rows ?? 24;
  const columns = stdout?.columns ?? 80;
  const headerLines = 1;
  const tableHeaderLines = 2;
  const footerLines = 1;
  const contentHeight = rows - headerLines - tableHeaderLines - footerLines;
  const nameWidth = Math.max(16, ...behaviors.map((behavior) => behavior.name.length + 2));

  const [runOffsets, setRunOffsets] = useState<Map<string, number>>(new Map());

  const nav = useListNav({
    itemCount: behaviors.length,
    viewportHeight: Math.max(3, contentHeight),
    initialIndex: savedIndex,
  });

  useInput((input, key) => {
    if (input === "m") {
      nav.toggleMouse();
      return;
    }
    if (key.upArrow) nav.handleUp();
    if (key.downArrow) nav.handleDown();
    if (key.return && behaviors.length > 0) {
      const behavior = behaviors[nav.selectedIndex]!;
      const offset = runOffsets.get(behavior.name) ?? 0;
      const run = behavior.runs[offset] ?? behavior.latestRun;
      saveIndex(nav.selectedIndex);
      navigate({ screen: "behavior", behavior: behavior.name, runId: run?.id });
    }
    if (key.leftArrow && behaviors.length > 0) {
      const behavior = behaviors[nav.selectedIndex]!;
      if (behavior.runs.length <= 1) return;
      setRunOffsets((current) => {
        const next = new Map(current);
        const value = next.get(behavior.name) ?? 0;
        next.set(behavior.name, Math.min(behavior.runs.length - 1, value + 1));
        return next;
      });
    }
    if (key.rightArrow && behaviors.length > 0) {
      const behavior = behaviors[nav.selectedIndex]!;
      setRunOffsets((current) => {
        const next = new Map(current);
        const value = next.get(behavior.name) ?? 0;
        if (value <= 0) return current;
        next.set(behavior.name, value - 1);
        return next;
      });
    }
  });

  const renderItem = useCallback(
    (behavior: BehaviorSummary, _index: number, isSelected: boolean) => {
      const offset = runOffsets.get(behavior.name) ?? 0;
      const run = behavior.runs[offset] ?? behavior.latestRun;
      const runLabel = behavior.runs.length > 1 && offset > 0
        ? `${offset + 1}/${behavior.runs.length}`
        : undefined;
      return (
        <DashboardRow
          behavior={behavior}
          run={run}
          isSelected={isSelected}
          nameWidth={nameWidth}
          runLabel={runLabel}
        />
      );
    },
    [nameWidth, runOffsets],
  );

  if (behaviors.length === 0) {
    return (
      <Box flexDirection="column" height={rows}>
        <Header breadcrumb={["soulcraft results"]} />
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <Text color="yellow">No results found</Text>
          <Text dimColor>Run an eval first.</Text>
        </Box>
        <Footer hints={[{ key: "q", label: "quit" }]} />
      </Box>
    );
  }

  return (
    <Box flexDirection="column" height={rows}>
      <Header
        breadcrumb={["soulcraft results"]}
        right={`${behaviors.length} behaviors`}
      />

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Box>
          <Box width={3}><Text> </Text></Box>
          <Box width={nameWidth}><Text dimColor>behavior</Text></Box>
          <Box width={9}><Text dimColor>avg</Text></Box>
          <Box width={10}><Text dimColor>range</Text></Box>
          <Box width={6}><Text dimColor>n</Text></Box>
          <Box width={8}><Text dimColor>elicit</Text></Box>
          <Box width={12}><Text dimColor>run</Text></Box>
          <Box><Text dimColor>mode</Text></Box>
        </Box>
        <Text dimColor>{"─".repeat(Math.max(40, columns - 4))}</Text>

        <ScrollableList
          items={behaviors}
          selectedIndex={nav.selectedIndex}
          windowStart={nav.windowStart}
          windowEnd={nav.windowEnd}
          height={Math.max(3, contentHeight)}
          renderItem={renderItem}
        />
      </Box>

      <Footer
        hints={[
          { key: "↑↓", label: "navigate" },
          { key: "↵", label: "open" },
          { key: "←→", label: "cycle runs" },
          { key: "m", label: nav.mouseEnabled ? "select text" : "scroll wheel" },
          { key: "q", label: "quit" },
        ]}
      />
    </Box>
  );
}
