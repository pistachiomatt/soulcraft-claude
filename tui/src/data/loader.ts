import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type {
  BehaviorSummary,
  EvalMode,
  JudgmentData,
  RunInfo,
  TranscriptData,
} from "./types.js";

const MAX_SLUG_WORDS = 6;

function tryLoadJson<T>(path: string): T | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as T;
  } catch {
    return null;
  }
}

function getBloomDir(projectDir: string): string {
  return join(projectDir, ".bloom");
}

function isRunDir(name: string): boolean {
  return !name.startsWith(".");
}

function parseRunDate(name: string): Date | undefined {
  const underscore = name.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (underscore) {
    const [, y, mo, d, h, mi, s] = underscore;
    return new Date(+y, +mo - 1, +d, +h, +mi, +s);
  }

  const isoish = new Date(name);
  return Number.isNaN(isoish.getTime()) ? undefined : isoish;
}

function compareRunIds(a: string, b: string): number {
  const datedSuffix = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;
  const aMatch = a.match(datedSuffix);
  const bMatch = b.match(datedSuffix);

  if (aMatch && bMatch) {
    const [, aDate, aSuffixRaw] = aMatch;
    const [, bDate, bSuffixRaw] = bMatch;

    if (aDate !== bDate) return bDate.localeCompare(aDate);

    const aSuffix = aSuffixRaw ? Number(aSuffixRaw) : 1;
    const bSuffix = bSuffixRaw ? Number(bSuffixRaw) : 1;
    return bSuffix - aSuffix;
  }

  return b.localeCompare(a);
}

function countTranscripts(dir: string): number {
  try {
    return readdirSync(dir).filter(
      (f) => f.startsWith("transcript_") && f.endsWith(".json"),
    ).length;
  } catch {
    return 0;
  }
}

export function parseTranscriptIds(dir: string): Array<{ variationNumber: number; repNumber: number }> {
  try {
    const files = readdirSync(dir).filter(
      (f) => f.startsWith("transcript_") && f.endsWith(".json"),
    );
    const ids: Array<{ variationNumber: number; repNumber: number }> = [];
    for (const f of files) {
      const match = f.match(/^transcript_v(\d+)r(\d+)\.json$/);
      if (match) {
        ids.push({
          variationNumber: Number(match[1]),
          repNumber: Number(match[2]),
        });
      }
    }
    return ids.sort(
      (a, b) => a.variationNumber - b.variationNumber || a.repNumber - b.repNumber,
    );
  } catch {
    return [];
  }
}

function detectEvalMode(dir: string): EvalMode {
  try {
    const files = readdirSync(dir).filter(
      (f) => f.startsWith("transcript_") && f.endsWith(".json"),
    );
    if (files.length === 0) return "unknown";
    const transcript = tryLoadJson<TranscriptData>(join(dir, files[0]!));
    if (transcript?.metadata?.auditor_model === "last-turn-eval") return "last-turn";
    if (transcript?.metadata?.auditor_model) return "scenario";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function loadRun(dir: string, id: string): RunInfo {
  const judgmentPath = join(dir, "judgment.json");
  const hasJudgment = existsSync(judgmentPath);
  const judgment = hasJudgment ? tryLoadJson<JudgmentData>(judgmentPath) : undefined;

  return {
    id,
    path: dir,
    hasJudgment,
    judgment: judgment ?? undefined,
    transcriptCount: countTranscripts(dir),
    date: parseRunDate(id),
    evalMode: detectEvalMode(dir),
  };
}

function isUsableRun(run: RunInfo): boolean {
  return run.hasJudgment || run.transcriptCount > 0;
}

export function discoverBehaviors(projectDir: string): BehaviorSummary[] {
  const bloomDir = getBloomDir(projectDir);
  if (!existsSync(bloomDir)) return [];

  const entries = readdirSync(bloomDir, { withFileTypes: true });
  const behaviors: BehaviorSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".")) continue;

    const behaviorDir = join(bloomDir, entry.name);
    const children = readdirSync(behaviorDir, { withFileTypes: true });
    const runDirs = children
      .filter((child) => child.isDirectory() && isRunDir(child.name))
      .sort((a, b) => compareRunIds(a.name, b.name));

    if (runDirs.length === 0) continue;

    const runs = runDirs.map((runDir) => loadRun(join(behaviorDir, runDir.name), runDir.name));
    const latestUsableRun = runs.find(isUsableRun);
    behaviors.push({
      name: entry.name,
      path: behaviorDir,
      runs,
      latestRun: latestUsableRun ?? runs[0],
    });
  }

  return behaviors.sort((a, b) => a.name.localeCompare(b.name));
}

export function loadTranscript(
  runDir: string,
  variationNumber: number,
  repNumber: number,
): TranscriptData | null {
  return tryLoadJson<TranscriptData>(
    join(runDir, `transcript_v${variationNumber}r${repNumber}.json`),
  );
}

export function extractTranscriptText(transcript: TranscriptData): string {
  const parts: string[] = [];
  for (const event of transcript.events) {
    const message = event.edit?.message;
    if (!message || message.role === "system") continue;
    if (typeof message.content === "string") {
      parts.push(message.content);
      continue;
    }
    for (const block of message.content) {
      if (block.text) parts.push(block.text);
      if (block.reasoning) parts.push(block.reasoning);
    }
  }
  return parts.join("\n").toLowerCase();
}

export function loadLabels(runDir: string): Map<number, string> {
  const labels = new Map<number, string>();
  const ideation = tryLoadJson<{ variations?: Array<{ label?: string; description?: string }> }>(
    join(runDir, "ideation.json"),
  );
  if (!ideation?.variations) return labels;

  for (let index = 0; index < ideation.variations.length; index++) {
    const variation = ideation.variations[index];
    let label = variation?.label?.trim() ?? "";

    if (!label) {
      let description = variation?.description ?? "";
      description = description.split("\n")[0]!.trim();
      description = description.replace(/^Scenario \d+:\s*/, "");
      description = description.replace(/^\*\*Scenario \d+:\s*/, "").replace(/\*\*$/, "");
      if (description.length > 50) description = `${description.slice(0, 47)}...`;
      label = description;
    }

    if (label) labels.set(index + 1, label);
  }

  return labels;
}

function slugify(description: string, seen: Set<string>): string {
  let text = description.replace(/\*\*/g, "");
  text = text.replace(/^Scenario \d+:\s*/, "").trim();
  const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  let slug = words.slice(0, MAX_SLUG_WORDS).join("-");
  if (!slug) slug = "scenario";

  const base = slug;
  let suffix = 2;
  while (seen.has(slug)) {
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(slug);
  return slug;
}

export function findScenarioBySlug(
  projectDir: string,
  behavior: string,
  slug: string,
): { runId: string; variationNumber: number; repNumber: number } | null {
  const behaviorSummary = discoverBehaviors(projectDir).find((item) => item.name === behavior);
  const run = behaviorSummary?.latestRun;
  if (!run?.judgment) return null;

  const ideation = tryLoadJson<{ variations?: Array<{ description?: string }> }>(
    join(run.path, "ideation.json"),
  );
  const descriptions = ideation?.variations ?? [];
  const seen = new Set<string>();

  for (const judgment of run.judgment.judgments) {
    const description =
      descriptions[judgment.variation_number - 1]?.description ??
      judgment.variation_description ??
      `Scenario ${judgment.variation_number}`;
    const scenarioSlug = slugify(description, seen);
    if (scenarioSlug === slug) {
      return {
        runId: run.id,
        variationNumber: judgment.variation_number,
        repNumber: judgment.repetition_number ?? 1,
      };
    }
  }

  return null;
}
