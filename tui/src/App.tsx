import React, { useCallback, useEffect, useState } from "react";
import { useApp, useInput } from "ink";
import type { BehaviorSummary, View } from "./data/types.js";
import { discoverBehaviors, loadLabels, loadTranscript, parseTranscriptIds } from "./data/loader.js";
import { NavProvider, useNav } from "./hooks/useNav.js";
import { DashboardScreen } from "./screens/DashboardScreen.js";
import { BehaviorScreen } from "./screens/BehaviorScreen.js";
import { ScenarioScreen } from "./screens/ScenarioScreen.js";

const REFRESH_INTERVAL = 3000;

function cleanExit(exit: () => void) {
  process.stdout.write("\x1b[?1006l\x1b[?1000l");
  exit();
}

function buildStack(view?: View): View[] {
  if (!view) return [{ screen: "dashboard" }];

  const stack: View[] = [{ screen: "dashboard" }];
  if (view.screen === "behavior" || view.screen === "scenario") {
    stack.push({ screen: "behavior", behavior: view.behavior, runId: view.runId });
  }
  if (view.screen === "scenario") {
    stack.push(view);
  } else {
    stack[stack.length - 1] = view;
  }
  return stack;
}

interface Props {
  projectDir: string;
  initialView?: View;
}

export function App({ projectDir, initialView }: Props) {
  return (
    <NavProvider initial={buildStack(initialView)}>
      <AppInner projectDir={projectDir} />
    </NavProvider>
  );
}

function AppInner({ projectDir }: { projectDir: string }) {
  const { exit } = useApp();
  const { currentView } = useNav();
  const [behaviors, setBehaviors] = useState<BehaviorSummary[]>(() => discoverBehaviors(projectDir));

  const refreshData = useCallback(() => {
    setBehaviors(discoverBehaviors(projectDir));
  }, [projectDir]);

  useEffect(() => {
    refreshData();
    const timer = setInterval(() => {
      if (currentView.screen !== "scenario") refreshData();
    }, REFRESH_INTERVAL);
    return () => clearInterval(timer);
  }, [currentView.screen, refreshData]);

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) cleanExit(exit);
  });

  return <Router behaviors={behaviors} refreshData={refreshData} />;
}

function Router({
  behaviors,
  refreshData,
}: {
  behaviors: BehaviorSummary[];
  refreshData: () => void;
}) {
  const { currentView, goBack, replace } = useNav();

  const handleBack = useCallback(() => {
    refreshData();
    goBack();
  }, [goBack, refreshData]);

  if (currentView.screen === "dashboard") {
    return <DashboardScreen behaviors={behaviors} />;
  }

  if (currentView.screen === "behavior") {
    const behaviorData = behaviors.find((behavior) => behavior.name === currentView.behavior);
    if (!behaviorData) return <DashboardScreen behaviors={behaviors} />;

    const run = currentView.runId
      ? behaviorData.runs.find((item) => item.id === currentView.runId)
      : behaviorData.latestRun;

    if (!run) return <DashboardScreen behaviors={behaviors} />;

    return (
      <BehaviorScreen
        behavior={currentView.behavior}
        run={run}
        allRuns={behaviorData.runs}
        onBack={handleBack}
      />
    );
  }

  const behaviorData = behaviors.find((behavior) => behavior.name === currentView.behavior);
  if (!behaviorData) return <DashboardScreen behaviors={behaviors} />;

  const run = behaviorData.runs.find((item) => item.id === currentView.runId) ?? behaviorData.latestRun;
  if (!run) return <DashboardScreen behaviors={behaviors} />;

  const judgment = run.judgment?.judgments.find(
    (item) =>
      item.variation_number === currentView.variationNumber &&
      (item.repetition_number ?? 1) === currentView.repNumber,
  ) ?? null;

  const transcript = loadTranscript(run.path, currentView.variationNumber, currentView.repNumber);
  const labels = loadLabels(run.path);
  const label = labels.get(currentView.variationNumber) ?? `scenario ${currentView.variationNumber}`;

  const siblings = (run.judgment?.judgments ?? []).map((item) => ({
    variationNumber: item.variation_number,
    repNumber: item.repetition_number ?? 1,
  }));

  if (siblings.length === 0) {
    siblings.push(...parseTranscriptIds(run.path));
  }

  const currentIndex = siblings.findIndex(
    (item) =>
      item.variationNumber === currentView.variationNumber &&
      item.repNumber === currentView.repNumber,
  );

  const jumpTo = (index: number) => {
    const item = siblings[index];
    if (!item) return;
    replace({
      screen: "scenario",
      behavior: currentView.behavior,
      runId: run.id,
      variationNumber: item.variationNumber,
      repNumber: item.repNumber,
    });
  };

  return (
    <ScenarioScreen
      behavior={currentView.behavior}
      runId={run.id}
      judgment={judgment}
      transcript={transcript}
      variationNumber={currentView.variationNumber}
      label={label}
      evalMode={run.evalMode}
      onBack={handleBack}
      position={currentIndex >= 0 ? currentIndex + 1 : undefined}
      total={siblings.length > 0 ? siblings.length : undefined}
      onPrev={currentIndex > 0 ? () => jumpTo(currentIndex - 1) : undefined}
      onNext={currentIndex >= 0 && currentIndex < siblings.length - 1 ? () => jumpTo(currentIndex + 1) : undefined}
    />
  );
}
