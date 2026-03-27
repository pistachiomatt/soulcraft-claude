import React, { useCallback, useMemo, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { Judgment, RunInfo } from "../data/types.js";
import { loadLabels, parseTranscriptIds } from "../data/loader.js";
import { Footer } from "../components/Footer.js";
import { Header } from "../components/Header.js";
import { ScoreBadge } from "../components/ScoreBadge.js";
import { ScrollableList } from "../components/ScrollableList.js";
import { useListNav } from "../hooks/useListNav.js";
import { useNav } from "../hooks/useNav.js";
import { BULLET, DOTS, scoreColorName } from "../theme.js";

const JUDGMENT_META_KEYS = new Set([
  "variation_number",
  "variation_description",
  "repetition_number",
  "behavior_presence",
  "justification",
  "summary",
  "full_judgment_response",
  "num_samples",
  "individual_samples",
  "highlights",
]);

function getAdditionalQualities(judgments: Judgment[]): string[] {
  const qualities = new Set<string>();
  for (const judgment of judgments) {
    for (const key of Object.keys(judgment)) {
      if (!JUDGMENT_META_KEYS.has(key) && typeof judgment[key] === "number") {
        qualities.add(key);
      }
    }
  }
  return [...qualities].sort();
}

function getQualityAvg(stats: Record<string, number> | undefined, quality: string): number | null {
  if (!stats) return null;
  return stats[`average_${quality}`] ?? null;
}

interface ScenarioItem {
  variationNumber: number;
  repNumber: number;
  judgment?: Judgment;
  priorScores: Array<number | null>;
  label?: string;
}

const PRIOR_RUNS = 3;

interface Props {
  behavior: string;
  run: RunInfo;
  allRuns: RunInfo[];
  onBack: () => void;
}

function DiffBadge({ current, prior }: { current: number; prior: number | null }) {
  if (prior == null) return null;
  const diff = current - prior;
  if (diff === 0) return null;
  return <Text color={diff > 0 ? "green" : "red"}>{diff > 0 ? `+${diff}` : `${diff}`}</Text>;
}

const ScenarioRow = React.memo(function ScenarioRow({
  item,
  isSelected,
  showHighlights,
  hasPriorRuns,
  numWidth,
  qualities,
}: {
  item: ScenarioItem;
  isSelected: boolean;
  showHighlights: boolean;
  hasPriorRuns: boolean;
  numWidth: number;
  qualities: string[];
}) {
  const judgment = item.judgment;
  const summaryWidth = hasPriorRuns ? 40 : 58;
  const summary = judgment ? (judgment.summary.split("\n")[0] ?? "").replace(/\*\*/g, "").trim() : "";
  const truncatedSummary = summary.length > summaryWidth
    ? `${summary.slice(0, summaryWidth - 3)}…`
    : summary;
  const id = item.label ?? String(item.variationNumber);
  const firstPrior = item.priorScores.find((score) => score != null) ?? null;

  return (
    <Box flexDirection="column">
      <Box>
        <Box width={numWidth}>
          <Text color={isSelected ? "cyan" : undefined} bold={isSelected} wrap="truncate">
            {isSelected ? "›" : " "}{id}
          </Text>
        </Box>
        <Text>    </Text>
        <Box width={4}>
          {judgment ? (
            <Text color={scoreColorName(judgment.behavior_presence)} bold={isSelected}>
              {judgment.behavior_presence}
            </Text>
          ) : (
            <Text color="yellow">{DOTS}{DOTS}</Text>
          )}
        </Box>
        {hasPriorRuns ? (
          <Box width={4}>
            {judgment ? <DiffBadge current={judgment.behavior_presence} prior={firstPrior} /> : null}
          </Box>
        ) : null}
        {hasPriorRuns ? item.priorScores.map((score, index) => (
          <Box key={index} width={5}>
            {score != null ? (
              <Text color={score < 5 ? "red" : score < 7 ? "yellow" : undefined} dimColor={score >= 7}>
                {score}
              </Text>
            ) : (
              <Text dimColor>{DOTS}</Text>
            )}
          </Box>
        )) : null}
        {judgment && qualities.length > 0 ? (
          <Box gap={1} marginRight={1}>
            {qualities.map((quality) => {
              const value = judgment[quality];
              if (typeof value !== "number") return null;
              return (
                <Text key={quality} color={scoreColorName(value)} dimColor={!isSelected}>
                  {value}
                </Text>
              );
            })}
          </Box>
        ) : null}
        <Box flexShrink={1}>
          <Text color={isSelected ? "white" : undefined} dimColor={!judgment} wrap="truncate">
            {truncatedSummary || "transcript available"}
          </Text>
        </Box>
      </Box>
      {showHighlights && isSelected && judgment?.highlights && judgment.highlights.length > 0 ? (
        <Box marginLeft={13} flexDirection="column">
          {judgment.highlights.slice(0, 3).map((highlight, index) => (
            <Box key={index}>
              <Text dimColor>  {BULLET} </Text>
              <Text dimColor wrap="truncate">
                {highlight.description.length > 60
                  ? `${highlight.description.slice(0, 57)}…`
                  : highlight.description}
              </Text>
            </Box>
          ))}
        </Box>
      ) : null}
    </Box>
  );
});

export function BehaviorScreen({ behavior, run, allRuns, onBack }: Props) {
  const { navigate, replace, savedIndex, saveIndex } = useNav();
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const [showRunPicker, setShowRunPicker] = useState(false);
  const [showHighlights, setShowHighlights] = useState(false);

  const judgments = run.judgment?.judgments ?? [];
  const stats = run.judgment?.summary_statistics;

  const priorRuns = useMemo(
    () => allRuns.filter((item) => item.id !== run.id && item.judgment && item.judgment.judgments.length > 0).slice(0, PRIOR_RUNS),
    [allRuns, run.id],
  );

  const labels = useMemo(() => loadLabels(run.path), [run.path]);

  const allItems: ScenarioItem[] = useMemo(() => {
    function getPriorScores(variationNumber: number): Array<number | null> {
      return priorRuns.map((priorRun) => {
        const prior = priorRun.judgment!.judgments.find((item) => item.variation_number === variationNumber);
        return prior ? prior.behavior_presence : null;
      });
    }

    if (judgments.length > 0) {
      return judgments.map((judgment) => ({
        variationNumber: judgment.variation_number,
        repNumber: judgment.repetition_number ?? 1,
        judgment,
        priorScores: getPriorScores(judgment.variation_number),
        label: labels.get(judgment.variation_number),
      }));
    }

    return parseTranscriptIds(run.path).map(({ variationNumber, repNumber }) => ({
      variationNumber,
      repNumber,
      priorScores: getPriorScores(variationNumber),
      label: labels.get(variationNumber),
    }));
  }, [judgments, labels, priorRuns, run.path]);
  const items = allItems;
  const listHeight = Math.max(3, rows - 6);

  const nav = useListNav({
    itemCount: items.length,
    viewportHeight: listHeight,
    initialIndex: savedIndex,
  });

  const pickerNav = useListNav({
    itemCount: allRuns.length,
    viewportHeight: Math.max(3, rows - 4),
  });

  useInput((input, key) => {
    if (showRunPicker) {
      if (key.upArrow) pickerNav.handleUp();
      if (key.downArrow) pickerNav.handleDown();
      if (key.return && allRuns[pickerNav.selectedIndex]) {
        replace({ screen: "behavior", behavior, runId: allRuns[pickerNav.selectedIndex]!.id });
        setShowRunPicker(false);
      }
      if (key.escape) setShowRunPicker(false);
      return;
    }

    if (key.upArrow) nav.handleUp();
    if (key.downArrow) nav.handleDown();
    if (key.escape) {
      onBack();
      return;
    }
    if (key.return && items[nav.selectedIndex]) {
      const item = items[nav.selectedIndex]!;
      saveIndex(nav.selectedIndex);
      navigate({
        screen: "scenario",
        behavior,
        runId: run.id,
        variationNumber: item.variationNumber,
        repNumber: item.repNumber,
      });
    }
    if ((key.leftArrow || input === "[") && allRuns.length > 1) {
      const index = allRuns.findIndex((item) => item.id === run.id);
      const previous = allRuns[index + 1];
      if (previous) replace({ screen: "behavior", behavior, runId: previous.id });
    }
    if ((key.rightArrow || input === "]") && allRuns.length > 1) {
      const index = allRuns.findIndex((item) => item.id === run.id);
      const next = allRuns[index - 1];
      if (next) replace({ screen: "behavior", behavior, runId: next.id });
    }
    if (input === "r" && allRuns.length > 1) setShowRunPicker(true);
    if (input === "h") setShowHighlights((current) => !current);
    if (input === "s") nav.toggleMouse();
  });

  const renderRunItem = useCallback(
    (item: RunInfo, _index: number, isSelected: boolean) => {
      const avg = item.judgment?.summary_statistics?.average_behavior_presence_score;
      const isCurrent = item.id === run.id;
      return (
        <Box>
          <Text color="cyan" bold>{isSelected ? " › " : "   "}</Text>
          <Box width={24}>
            <Text color={isSelected ? "white" : undefined} bold={isSelected}>{item.id}</Text>
          </Box>
          <Box width={10}>
            {avg != null ? <ScoreBadge score={Math.round(avg * 10) / 10} /> : <Text dimColor>{DOTS}</Text>}
          </Box>
          <Box width={14}>
            <Text dimColor>{item.transcriptCount} transcript{item.transcriptCount !== 1 ? "s" : ""}</Text>
          </Box>
          <Box width={4}>
            {item.evalMode === "last-turn" ? <Text color="magenta">LT</Text> : null}
            {item.evalMode === "scenario" ? <Text color="blue">SC</Text> : null}
          </Box>
          {isCurrent ? <Text dimColor>(current)</Text> : null}
        </Box>
      );
    },
    [run.id],
  );

  if (showRunPicker) {
    const pickerHeight = Math.max(3, rows - 4);

    return (
      <Box flexDirection="column" height={rows}>
        <Header breadcrumb={["results", behavior, "runs"]} />
        <Box flexDirection="column" flexGrow={1} paddingX={1}>
          <ScrollableList
            items={allRuns}
            selectedIndex={pickerNav.selectedIndex}
            windowStart={pickerNav.windowStart}
            windowEnd={pickerNav.windowEnd}
            height={pickerHeight}
            renderItem={renderRunItem}
          />
        </Box>
        <Footer hints={[
          { key: "↑↓", label: "navigate" },
          { key: "↵", label: "select" },
          { key: "esc", label: "cancel" },
        ]} />
      </Box>
    );
  }

  const qualities = useMemo(() => getAdditionalQualities(judgments), [judgments]);
  const prevRun = priorRuns[0];
  const prevStats = prevRun?.judgment?.summary_statistics;
  const hasPriorRuns = priorRuns.length > 0;
  const maxLabelLength = Math.max(3, ...items.map((item) => (item.label ?? String(item.variationNumber)).length));
  const numWidth = Math.min(maxLabelLength + 3, 36);

  const renderScenario = useCallback(
    (item: ScenarioItem, _index: number, isSelected: boolean) => (
      <ScenarioRow
        item={item}
        isSelected={isSelected}
        showHighlights={showHighlights}
        hasPriorRuns={hasPriorRuns}
        numWidth={numWidth}
        qualities={qualities}
      />
    ),
    [hasPriorRuns, numWidth, qualities, showHighlights],
  );

  return (
    <Box flexDirection="column" height={rows}>
      <Header
        breadcrumb={["results", behavior]}
        right={allRuns.length > 1
          ? `${run.id} (${allRuns.findIndex((item) => item.id === run.id) + 1}/${allRuns.length})`
          : run.id}
      />

      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        <Box gap={2}>
          {stats ? (
            <>
              <ScoreBadge score={Math.round(stats.average_behavior_presence_score * 10) / 10} bold />
              {prevStats ? (() => {
                const delta = stats.average_behavior_presence_score - prevStats.average_behavior_presence_score;
                return delta !== 0 ? (
                  <Text color={delta > 0 ? "green" : "red"}>
                    {delta > 0 ? "+" : ""}{delta.toFixed(1)}
                  </Text>
                ) : null;
              })() : null}
              <Text dimColor>avg {DOTS} {stats.total_judgments} scenario{stats.total_judgments !== 1 ? "s" : ""}</Text>
            </>
          ) : run.transcriptCount > 0 ? (
            <>
              <Text color="yellow">pending judgment</Text>
              <Text dimColor>{DOTS} {run.transcriptCount} transcript{run.transcriptCount !== 1 ? "s" : ""}</Text>
            </>
          ) : (
            <Text color="yellow">no data</Text>
          )}
          <Text dimColor>{DOTS}</Text>
          {run.evalMode === "last-turn" ? <Text color="magenta">last-turn</Text> : null}
          {run.evalMode === "scenario" ? <Text color="blue">scenario</Text> : null}
        </Box>

        {stats && qualities.length > 0 ? (
          <Box gap={2} paddingLeft={1}>
            {qualities.map((quality) => {
              const avg = getQualityAvg(stats, quality);
              if (avg == null) return null;
              const prevAvg = getQualityAvg(prevStats, quality);
              const delta = prevAvg != null ? avg - prevAvg : null;
              return (
                <Box key={quality} gap={1}>
                  <Text dimColor>{quality.replace(/_/g, " ")}:</Text>
                  <Text color={scoreColorName(avg)}>{avg.toFixed(1)}</Text>
                  {delta != null && delta !== 0 ? (
                    <Text color={delta > 0 ? "green" : delta <= -2 ? "redBright" : "red"}>
                      {delta > 0 ? "+" : ""}{delta.toFixed(1)}{delta <= -2 ? "!!!" : ""}
                    </Text>
                  ) : null}
                </Box>
              );
            })}
          </Box>
        ) : null}

        <Box>
          <Box width={numWidth}><Text dimColor>id</Text></Box>
          <Text>    </Text>
          <Box width={4}><Text dimColor>now</Text></Box>
          {priorRuns.length > 0 ? <Box width={4}><Text dimColor>Δ</Text></Box> : null}
          {priorRuns.map((item, index) => {
            const date = item.date;
            const tag = date ? `${date.getMonth() + 1}/${date.getDate()}` : item.id.slice(5, 10);
            return <Box key={index} width={5}><Text dimColor>{tag}</Text></Box>;
          })}
          {qualities.length > 0 ? (
            <Box gap={1} marginRight={1}>
              {qualities.map((quality) => (
                <Text key={quality} dimColor>{quality.slice(0, 4)}</Text>
              ))}
            </Box>
          ) : null}
          <Box><Text dimColor>summary</Text></Box>
        </Box>
        <Text dimColor>{"─".repeat(Math.max(40, (stdout?.columns ?? 80) - 4))}</Text>

        <ScrollableList
          items={items}
          selectedIndex={nav.selectedIndex}
          windowStart={nav.windowStart}
          windowEnd={nav.windowEnd}
          height={listHeight}
          renderItem={renderScenario}
        />
      </Box>

      <Footer hints={[
        { key: "↑↓", label: "navigate" },
        { key: "↵", label: "details" },
        { key: "h", label: showHighlights ? "hide highlights" : "highlights" },
        ...(allRuns.length > 1
          ? [
              { key: "[ ]", label: "prev/next run" },
              { key: "r", label: "runs" },
            ]
          : []),
        { key: "s", label: nav.mouseEnabled ? "select text" : "scroll wheel" },
        { key: "esc", label: "back" },
        { key: "q", label: "quit" },
      ]} />
    </Box>
  );
}
