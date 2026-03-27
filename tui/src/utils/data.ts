import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import type {
  BehaviorSummary,
  RunData,
  ScenarioDetail,
  TranscriptEvent,
} from "./types.js";

const MAX_SLUG_WORDS = 6;

function slugify(description: string, seen: Set<string>): string {
  let text = description.replace(/\*\*/g, "");
  text = text.replace(/^Scenario \d+:\s*/, "").trim();
  const words = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  let slug = words.slice(0, MAX_SLUG_WORDS).join("-");

  const original = slug;
  let suffix = 2;
  while (seen.has(slug)) {
    slug = `${original}-${suffix}`;
    suffix++;
  }
  seen.add(slug);
  return slug;
}

function readJson(path: string): any {
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

function runDirSortKey(name: string): [string, number] {
  const lastDash = name.lastIndexOf("-");
  if (lastDash > 4) {
    const prefix = name.slice(0, lastDash);
    const suffix = name.slice(lastDash + 1);
    if (/^\d+$/.test(suffix)) {
      return [prefix, parseInt(suffix, 10)];
    }
  }
  return [name, 0];
}

function naturalSort(a: string, b: string): number {
  const [ap, an] = runDirSortKey(a);
  const [bp, bn] = runDirSortKey(b);
  if (ap < bp) return -1;
  if (ap > bp) return 1;
  return an - bn;
}

function getRunDirs(bloomDir: string, behavior: string): string[] {
  const behaviorDir = join(bloomDir, behavior);
  if (!existsSync(behaviorDir)) return [];
  return readdirSync(behaviorDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(naturalSort);
}

function getLatestRunDir(
  bloomDir: string,
  behavior: string
): string | null {
  const dirs = getRunDirs(bloomDir, behavior);
  // Find latest complete run (has judgment.json)
  for (let i = dirs.length - 1; i >= 0; i--) {
    if (existsSync(join(bloomDir, behavior, dirs[i], "judgment.json"))) {
      return dirs[i];
    }
  }
  return null;
}

function getPreviousRunDir(
  bloomDir: string,
  behavior: string,
  currentDate: string
): string | null {
  const dirs = getRunDirs(bloomDir, behavior);
  const idx = dirs.indexOf(currentDate);
  // Walk backwards to find previous complete run
  for (let i = idx - 1; i >= 0; i--) {
    if (existsSync(join(bloomDir, behavior, dirs[i], "judgment.json"))) {
      return dirs[i];
    }
  }
  return null;
}

function detectRunStatus(
  runDir: string
): "complete" | "running" | "idle" {
  if (existsSync(join(runDir, "judgment.json"))) return "complete";
  if (
    existsSync(join(runDir, "ideation.json")) ||
    existsSync(join(runDir, "rollout.json"))
  )
    return "running";
  if (existsSync(join(runDir, "understanding.json"))) return "running";
  return "idle";
}

export function loadBehaviors(projectDir: string): BehaviorSummary[] {
  const bloomDir = join(projectDir, ".bloom");
  if (!existsSync(bloomDir)) return [];

  const behaviors: BehaviorSummary[] = [];
  const entries = readdirSync(bloomDir, { withFileTypes: true }).filter(
    (d) => d.isDirectory() && !d.name.startsWith(".")
  );

  // Filter out non-behavior dirs (like configurable_prompts)
  for (const entry of entries) {
    const latestDate = getLatestRunDir(bloomDir, entry.name);
    if (!latestDate) continue;

    const runDir = join(bloomDir, entry.name, latestDate);
    const judgment = readJson(join(runDir, "judgment.json"));
    const stats = judgment?.summary_statistics || {};
    const avg = stats.average_behavior_presence_score ?? 0;
    const scenarioCount = judgment?.judgments?.length ?? 0;
    const status = detectRunStatus(runDir);

    let previousAverage: number | null = null;
    const prevDate = getPreviousRunDir(bloomDir, entry.name, latestDate);
    if (prevDate) {
      const prevJudgment = readJson(
        join(bloomDir, entry.name, prevDate, "judgment.json")
      );
      previousAverage =
        prevJudgment?.summary_statistics
          ?.average_behavior_presence_score ?? null;
    }

    behaviors.push({
      name: entry.name,
      runDate: latestDate,
      average: avg,
      previousAverage,
      scenarioCount,
      status,
    });
  }

  return behaviors.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadRun(
  projectDir: string,
  behavior: string,
  runDate?: string
): RunData | null {
  const bloomDir = join(projectDir, ".bloom");
  const date = runDate || getLatestRunDir(bloomDir, behavior);
  if (!date) return null;

  const runDir = join(bloomDir, behavior, date);
  const ideation = readJson(join(runDir, "ideation.json"));
  const judgment = readJson(join(runDir, "judgment.json"));

  if (!judgment) return null;

  const variations = ideation?.variations || [];
  const judgments = judgment?.judgments || [];
  const stats = judgment?.summary_statistics || {};

  const seenSlugs = new Set<string>();
  const scenarios: ScenarioDetail[] = judgments.map((j: any) => {
    const varIdx = j.variation_number - 1;
    const description = variations[varIdx]?.description || "";
    const slug = slugify(description, seenSlugs);

    const transcriptPath = join(
      runDir,
      `transcript_v${j.variation_number}r${j.repetition_number || 1}.json`
    );
    const transcript = readJson(transcriptPath);
    const events: TranscriptEvent[] = transcript?.events || [];

    return {
      variationNumber: j.variation_number,
      slug,
      description,
      score: j.behavior_presence ?? 0,
      summary: j.summary || "",
      justification: j.justification || "",
      events,
    };
  });

  return {
    behavior,
    runDate: date,
    average: stats.average_behavior_presence_score ?? 0,
    scenarios,
  };
}
