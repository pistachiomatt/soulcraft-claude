import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import type { EvalMode, Judgment, TranscriptData } from "../data/types.js";
import { Footer } from "../components/Footer.js";
import { Header } from "../components/Header.js";
import { TextScroller } from "../components/TextScroller.js";
import { useTextScroll } from "../hooks/useTextScroll.js";
import { exportToDownloads } from "../renderers/export.js";
import { renderSummary } from "../renderers/summary.js";
import { renderTranscript, type TranscriptView } from "../renderers/transcript.js";
import { scoreColorName } from "../theme.js";

type Tab = "summary" | "transcript";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "summary", label: " ← summary " },
  { id: "transcript", label: " transcript → " },
];

function TabBar({ activeTab, columns }: { activeTab: Tab; columns: number }) {
  const line1: React.ReactNode[] = [];
  const line2: React.ReactNode[] = [];
  const line3: React.ReactNode[] = [];

  let width = 1;

  line1.push(<Text key="l1"> </Text>);
  line2.push(<Text key="l2"> </Text>);
  line3.push(<Text key="l3" dimColor>{"─"}</Text>);

  for (let index = 0; index < TABS.length; index++) {
    const tab = TABS[index]!;
    const isActive = tab.id === activeTab;
    const length = tab.label.length;

    if (isActive) {
      line1.push(<Text key={`t1-${tab.id}`} color="cyan">{"╭"}{"─".repeat(length)}{"╮"}</Text>);
      line2.push(
        <Text key={`t2l-${tab.id}`} color="cyan">{"│"}</Text>,
        <Text key={`t2m-${tab.id}`} color="cyan" bold>{tab.label}</Text>,
        <Text key={`t2r-${tab.id}`} color="cyan">{"│"}</Text>,
      );
      line3.push(<Text key={`t3-${tab.id}`} color="cyan">{"╯"}{" ".repeat(length)}{"╰"}</Text>);
      width += length + 2;
    } else {
      line1.push(<Text key={`t1-${tab.id}`}>{" ".repeat(length)}</Text>);
      line2.push(<Text key={`t2-${tab.id}`} color="gray">{tab.label}</Text>);
      line3.push(<Text key={`t3-${tab.id}`} dimColor>{"─".repeat(length)}</Text>);
      width += length;
    }

    if (index < TABS.length - 1) {
      line1.push(<Text key={`g1-${index}`}> </Text>);
      line2.push(<Text key={`g2-${index}`}> </Text>);
      line3.push(<Text key={`g3-${index}`} dimColor>{"─"}</Text>);
      width += 1;
    }
  }

  const remaining = Math.max(0, columns - width - 1);
  line1.push(<Text key="r1">{" ".repeat(remaining)}</Text>);
  line2.push(<Text key="r2">{" ".repeat(remaining)}</Text>);
  line3.push(<Text key="r3" dimColor>{"─".repeat(remaining)}</Text>);

  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box>{line1}</Box>
      <Box>{line2}</Box>
      <Box>{line3}</Box>
    </Box>
  );
}

interface Props {
  behavior: string;
  runId: string;
  judgment: Judgment | null;
  transcript: TranscriptData | null;
  variationNumber: number;
  label: string;
  evalMode: EvalMode;
  onBack: () => void;
  position?: number;
  total?: number;
  onNext?: () => void;
  onPrev?: () => void;
}

export function ScenarioScreen({
  behavior,
  judgment,
  transcript,
  variationNumber,
  label,
  evalMode,
  onBack,
  position,
  total,
  onPrev,
  onNext,
}: Props) {
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 24;
  const columns = stdout?.columns ?? 80;

  const hasJudgment = judgment != null;
  const [tab, setTab] = useState<Tab>(hasJudgment ? "summary" : "transcript");
  const [showThinking, setShowThinking] = useState(true);
  const [transcriptView, setTranscriptView] = useState<TranscriptView>("target");
  const [exportMsg, setExportMsg] = useState("");

  const savedOffsets = useRef({ summary: 0, transcript: 0 });
  const pendingScrollEventIndex = useRef<number | null>(null);
  const contentHeight = Math.max(5, rows - 7);

  const summaryLines = useMemo(
    () => judgment ? renderSummary(judgment, columns) : [{ text: "  Judgment pending.", dim: true }],
    [columns, judgment],
  );

  const transcriptLines = useMemo(
    () => transcript
      ? renderTranscript(transcript.events, {
          showThinking,
          contextCount: transcript.metadata.context_event_count ?? 0,
          width: columns,
          view: transcriptView,
        })
      : [{ text: "  No transcript data available.", dim: true }],
    [columns, showThinking, transcript, transcriptView],
  );

  const currentLines = tab === "summary" ? summaryLines : transcriptLines;

  const scroll = useTextScroll({
    lineCount: currentLines.length,
    viewportHeight: contentHeight,
  });

  const prevTab = useRef(tab);
  useEffect(() => {
    if (prevTab.current !== tab) {
      prevTab.current = tab;
      scroll.setOffset(savedOffsets.current[tab]);
    }
  }, [scroll, tab]);

  useEffect(() => {
    const target = pendingScrollEventIndex.current;
    if (target == null) return;
    pendingScrollEventIndex.current = null;

    let bestLine = 0;
    for (let index = 0; index < transcriptLines.length; index++) {
      const eventIndex = transcriptLines[index]!.eventIndex;
      if (eventIndex !== undefined && eventIndex >= target) {
        bestLine = index;
        break;
      }
    }
    scroll.setOffset(bestLine);
  }, [scroll, transcriptLines]);

  const switchTab = useCallback((nextTab: Tab) => {
    savedOffsets.current[tab] = scroll.offset;
    setTab(nextTab);
  }, [scroll.offset, tab]);

  useInput((input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow) {
      scroll.scrollUp();
      return;
    }
    if (key.downArrow) {
      scroll.scrollDown();
      return;
    }
    if (key.pageUp) {
      scroll.scrollPageUp();
      return;
    }
    if (key.pageDown) {
      scroll.scrollPageDown();
      return;
    }

    if (key.leftArrow || key.rightArrow || key.tab) {
      switchTab(tab === "summary" ? "transcript" : "summary");
      return;
    }

    if (input === "[" && onPrev) {
      onPrev();
      return;
    }
    if (input === "]" && onNext) {
      onNext();
      return;
    }

    if (input === "v" && tab === "transcript") {
      const topLine = transcriptLines[scroll.offset];
      if (topLine?.eventIndex !== undefined) {
        pendingScrollEventIndex.current = topLine.eventIndex;
      }
      setTranscriptView((current) => current === "target" ? "evaluator" : "target");
      return;
    }
    if (input === "t") {
      setShowThinking((current) => !current);
      return;
    }
    if (input === "e" && tab === "transcript" && transcript) {
      try {
        const path = exportToDownloads(transcript, transcriptView, behavior, label, variationNumber);
        setExportMsg(`Exported to ${path}`);
        setTimeout(() => setExportMsg(""), 3000);
      } catch {
        setExportMsg("Export failed");
        setTimeout(() => setExportMsg(""), 3000);
      }
      return;
    }
    if (input === "m") scroll.toggleMouse();
  });

  const modeTag = evalMode === "last-turn" ? "LT" : evalMode === "scenario" ? "SC" : "";
  const scoreLabel = judgment ? `${judgment.behavior_presence}/10` : "pending";
  const positionTag = position != null && total != null ? `${position}/${total}` : "";
  const scoreText = [modeTag, positionTag, scoreLabel].filter(Boolean).join("  ");
  const scoreColor = judgment ? scoreColorName(judgment.behavior_presence) : "yellow";

  return (
    <Box flexDirection="column" height={rows}>
      <Box flexDirection="column" flexShrink={0}>
        <Header
          breadcrumb={["results", behavior, label]}
          right={scoreText}
          rightColor={scoreColor}
        />
        <TabBar activeTab={tab} columns={columns} />
      </Box>

      <Box flexDirection="column" flexGrow={1} paddingLeft={1}>
        <TextScroller
          lines={currentLines}
          offset={scroll.offset}
          height={contentHeight}
        />
      </Box>

      {exportMsg ? (
        <Box paddingLeft={2}>
          <Text color="green">{exportMsg}</Text>
        </Box>
      ) : null}
      <Box marginTop={exportMsg ? 0 : 1}>
        <Footer hints={[
          { key: "↑↓", label: "scroll" },
          { key: "PgUp/Dn", label: "page" },
          { key: "←→", label: "tabs" },
          ...(onPrev || onNext ? [{ key: "[/]", label: "prev/next" }] : []),
          ...(tab === "transcript"
            ? [
                { key: "v", label: transcriptView === "target" ? "evaluator view" : "target view" },
                { key: "t", label: showThinking ? "hide thinking" : "thinking" },
                { key: "e", label: "export" },
              ]
            : []),
          !scroll.mouseEnabled
            ? { key: "m", label: "selecting text", color: "blue" }
            : { key: "m", label: "select text" },
          { key: "esc", label: "back" },
          { key: "q", label: "quit" },
        ]} />
      </Box>
    </Box>
  );
}
