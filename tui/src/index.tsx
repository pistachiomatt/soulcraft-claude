import React from "react";
import { render } from "ink";
import { App } from "./App.js";
import { findScenarioBySlug } from "./data/loader.js";
import type { View } from "./data/types.js";

const projectDir = process.argv[2];
const behaviorArg = process.argv[3];
const scenarioArg = process.argv[4];

if (!projectDir) {
  console.error("Usage: soulcraft tui <project-dir> [behavior] [scenario-slug]");
  process.exit(1);
}

let initialView: View | undefined;

if (behaviorArg && scenarioArg) {
  const match = findScenarioBySlug(projectDir, behaviorArg, scenarioArg);
  initialView = match
    ? {
        screen: "scenario",
        behavior: behaviorArg,
        runId: match.runId,
        variationNumber: match.variationNumber,
        repNumber: match.repNumber,
      }
    : { screen: "behavior", behavior: behaviorArg };
} else if (behaviorArg) {
  initialView = { screen: "behavior", behavior: behaviorArg };
}

function restoreTerminal() {
  process.stdout.write("\x1b[?1006l\x1b[?1000l");
}

process.on("exit", restoreTerminal);
process.on("SIGINT", () => {
  restoreTerminal();
  process.exit(0);
});
process.on("SIGTERM", () => {
  restoreTerminal();
  process.exit(0);
});

render(<App projectDir={projectDir} initialView={initialView} />, { exitOnCtrlC: false });
