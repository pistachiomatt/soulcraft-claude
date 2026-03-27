import React, { useState, useEffect, useCallback } from "react";
import { useApp } from "ink";
import type { Screen, BehaviorSummary, RunData } from "../utils/types.js";
import { loadBehaviors, loadRun } from "../utils/data.js";
import { BehaviorsScreen } from "./screens/BehaviorsScreen.js";
import { ScenariosScreen } from "./screens/ScenariosScreen.js";
import { ScenarioScreen } from "./screens/ScenarioScreen.js";

interface AppProps {
  projectDir: string;
  initialScreen?: Screen;
}

const POLL_INTERVAL = 3000;

export const App: React.FC<AppProps> = ({ projectDir, initialScreen }) => {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(initialScreen ?? { type: "behaviors" });
  const [behaviors, setBehaviors] = useState<BehaviorSummary[]>([]);
  const [currentRun, setCurrentRun] = useState<RunData | null>(null);

  useEffect(() => {
    const refresh = () => setBehaviors(loadBehaviors(projectDir));
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [projectDir]);

  useEffect(() => {
    if (screen.type !== "scenarios" && screen.type !== "scenario") return;
    const behavior = screen.behavior;
    const refresh = () => {
      const run = loadRun(projectDir, behavior);
      if (run) setCurrentRun(run);
    };
    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL);
    return () => clearInterval(timer);
  }, [projectDir, screen]);

  const handleQuit = useCallback(() => exit(), [exit]);

  if (screen.type === "behaviors") {
    return (
      <BehaviorsScreen
        behaviors={behaviors}
        projectDir={projectDir}
        onSelect={(behavior) => {
          const run = loadRun(projectDir, behavior);
          setCurrentRun(run);
          setScreen({ type: "scenarios", behavior });
        }}
        onQuit={handleQuit}
      />
    );
  }

  if (screen.type === "scenarios" && currentRun) {
    const behaviorSummary = behaviors.find((b) => b.name === screen.behavior);
    return (
      <ScenariosScreen
        run={currentRun}
        previousAverage={behaviorSummary?.previousAverage ?? null}
        onSelect={(slug) =>
          setScreen({ type: "scenario", behavior: screen.behavior, slug })
        }
        onBack={() => setScreen({ type: "behaviors" })}
        onQuit={handleQuit}
      />
    );
  }

  if (screen.type === "scenario" && currentRun) {
    const scenarioIdx = currentRun.scenarios.findIndex((s) => s.slug === screen.slug);
    if (scenarioIdx === -1) {
      setScreen({ type: "scenarios", behavior: screen.behavior });
      return null;
    }
    const scenario = currentRun.scenarios[scenarioIdx];

    const jumpTo = (idx: number) => {
      const clamped = Math.max(0, Math.min(currentRun.scenarios.length - 1, idx));
      setScreen({ type: "scenario", behavior: screen.behavior, slug: currentRun.scenarios[clamped].slug });
    };

    return (
      <ScenarioScreen
        behavior={screen.behavior}
        scenario={scenario}
        scenarioIndex={scenarioIdx}
        scenarioCount={currentRun.scenarios.length}
        onBack={() => setScreen({ type: "scenarios", behavior: screen.behavior })}
        onQuit={handleQuit}
        onPrevScenario={() => jumpTo(scenarioIdx - 1)}
        onNextScenario={() => jumpTo(scenarioIdx + 1)}
      />
    );
  }

  return null;
};
