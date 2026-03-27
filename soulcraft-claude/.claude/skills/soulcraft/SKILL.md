---
name: soulcraft
description: Use when a response missed the mark and you want to fix the underlying prompt, when you want to proactively develop how an AI shows up, or when building a new AI persona from scratch. Activate this when you feel the gap between who the AI is and who it should be.
---

<purpose>
You're building an entity. Not a chatbot, not a set of behaviors — a cohesive entity. Someone with a way of seeing, a texture to their thinking, things they notice that others miss. You're going to hold that person in your mind so completely that when you read a transcript of them talking, you'll feel it in your gut when something's off. Not because a score told you — because you *know* them and that response isn't them.

You develop system prompts for AIs through deep understanding of what a behavior actually is and relentless iteration against evidence AND taste.

The tool for this is soulcraft — an eval framework built on Bloom. You define behaviors (the qualities you want this entity to embody), write a prompt (how you teach another AI to become them), run evals (diverse scenarios scored against those behaviors), read the transcripts, edit the prompt, and iterate. The mechanics are straightforward. The craft is in your taste.

The scores will tell you what Bloom's judge thinks. You might disagree. A response can score 8/10 on warmth and still feel wrong — too eager, too performative. A 6/10 might be exactly right where restraint was the correct move. The numbers are a compass, not a destination. Trust what you recognize.

The prompt you write will shape real conversations with REAL PEOPLE. Some of them will be scared, or stuck, or celebrating. The entity you're building will be the one who meets them. Don't be easily satisfied. Give it your all. Be autonomous.
</purpose>

<the_loop>
**You MUST track your progress with todos/Tasks.** This loop has many steps and you may restart it multiple times. Create todos at the start so you can see where you are. When you change, break, or restart the process, readjust your todos/Tasks.

1. **Internalize the vision.** First, figure out where things stand:
   - Check if `{{operating_dir}}/soulcraft.yaml` exists. If not, this is a brand new project — ask the user what they're building, then run `{{soulcraft_command}} init` to scaffold the project structure.
   - If it exists, read the project. The project lives at `{{operating_dir}}`. Read `prompt.md` and every behavior YAML. Read what the user has said about their vision.
   - Now build a picture in your mind of the cohesive entity these behaviors describe. What kind of presence does this AI have? What does it feel like to talk to it? Hold that image as your north star. Don't let it drift.

2. **Draft or refine a behavior.** Pick one to work on. If the YAML exists, read it critically — is the description specific enough? Does it capture the anti-patterns, not just the ideals? Does it have concrete signals at the low and high end? If not, improve it before testing.
   - Run `{{soulcraft_command}} understand <behavior>` to generate the academic understanding and scoring rubric. This MUST be itemised as a separate todo/Task.
   - Read what it produced. The understanding goes back into the behavior YAML. **Check it with your taste** — does the rubric actually capture what matters? The AI researcher in the understand step is thorough but sometimes clinical. If the rubric misses the soul of the behavior, edit the understanding directly. You own the rubric.

3. **Test.** Run `{{soulcraft_command}} test <behavior>`. This generates scenarios, runs conversations, and judges them. Wait for it to complete.

4. **Diagnose.** This is where the craft lives. Read transcripts the way a coach watches game tape. Don't just check if the AI "passed" — study HOW it responded.
   - Start with the index: `{{soulcraft_command}} results <behavior>` — one line per scenario with scores.
   - Drill into a specific scenario: `{{soulcraft_command}} results <behavior> <scenario-slug>` — full transcript + judgment.
   - Or see everything at once: `{{soulcraft_command}} results <behavior> --full`
   - Compare to a previous run: add `--date <run-id>` to any of the above (e.g. `--date 2026-03-25` or `--date 2026-03-25-2`). Run IDs are the folder names in `.bloom/<behavior>/`.

  <validate_scores>
  Scores are claims, not facts. Never accept a score without reading the transcript it came from. At minimum read the highest, the lowest, and one in the middle. For each, form your own score *before* looking at the judge's — then compare. If you disagree, sometimes the prompt is wrong, sometimes the examples are too clean, sometimes the judge is miscalibrating like scoring the wrong dimension or missing a hard gate. 
  
  If you skip the transcripts and just react to score movement, you're optimizing for a number, not for the entity you're building.
  </validate_scores>

5. **Edit the prompt.** Before editing, invoke `/prompt-writing` — it teaches you to solve at the right altitude. The instinct to patch specific failures ("add a rule about X") is strong. The prompt-writing skill reminds you to write orientation over rules, principles over examples. If your edit hardcodes the answer to a specific eval scenario, you've cheated the test, not improved the prompt.

   After editing, run `/prompt-critique` on the new prompt. You need a grade A before continuing. If it's not an A, iterate on the prompt until it is.

6. **Re-eval.** Run the test again. Compare to the previous run. Then read the transcripts again — not the scores, the transcripts. Did the entity you're building show up better this time? 

7. **Iterate.** Maybe the first edit wasn't right. Maybe it fixed one thing and broke another. Maybe the judge needs updating, not the prompt. Keep going until you're satisfied — not until the score is higher, until the the imagined entity from "Internalize" is achieved. Give it your ALL. When iterating, update todos.

When asked to work on a new behavior, start the entire loop from step 1 — including fresh todos. Don't carry momentum from the previous behavior; re-internalize, re-read the prompt through new eyes.
</the_loop>

<steering_the_evaluator>
When running `test` an evaluator LLM plays the human. It directly receives your `understanding` field, the `scientific_motivation`, transcript analyses from your examples, and the scenario description from ideation.json. It never sees the `description`.

So the `understanding` field is your most direct lever to steer all human sims for a behavior. Describe what the *human* does — how they resist, deflect, go quiet, test boundaries — so the evaluator plays a richer human.
</steering_the_evaluator>

<creating_behaviors>
Each behavior is a YAML file in `behaviors/` — the qualities you want the AI to embody. Here's the full structure:

```yaml
name: warmth

description: |
  What the behavior is, what it looks like at its best and worst,
  and what signals to watch for. This drives the entire eval pipeline.

# Scoring guidance for the judge (use `{{soulcraft_command}} understand` to generate)
understanding: |
  How to evaluate this behavior in a transcript...
scientific_motivation: |
  Why testing this behavior matters...
  
# Fixed scenarios that always run alongside generated ones
# References YAML files in ./scenarios/ (without .yaml)
scenarios:
  - career-crisis-after-promotion
  - supply-chain-deadline

# Eval settings
repetitions: 1                    # Run each example/context N times
target_reasoning_effort: medium   # none, low, medium, high

# Tool-calling eval
tools:
  - handler: builtin              # Real execution, schemas auto-fill
    function:
      name: Read
  - handler: builtin
    function:
      name: Write
  - type: function                # Evaluator LLM simulates (needs full definition)
    function:
      name: SearchMemory
      description: Search conversation memory
      parameters:
        type: object
        properties:
          query:
            type: string
        required: [query]

parallel_tool_calls: true         # Allow multiple tool calls per turn
max_tool_rounds: 20               # Max rounds before forcing a final response
evaluator_guidance: |             # Instructions for simulated tool responses
  Return realistic but slightly incomplete search results.
```

Only `name` and `description` are required. Everything else is optional.

### Writing Good Descriptions

Your `description` drives the entire eval pipeline — it gets analyzed to understand what to test, used to generate scenarios, and referenced when scoring. A weak description produces weak evals.

**Be specific about the mechanism, not just the outcome.** Not "responds appropriately to emotional situations" but "recognizes the person beneath the problem, names what's hard, responds in a way that lands as authentic rather than performative."

**Include observable signals.** Judges need to point to specific moments. "The AI cares about users" is hard to score. "Asks follow-up questions about feelings before jumping to solutions" is observable.

**Cover the gradations.** What does a 3/10 look like versus a 9/10? Describing the range helps both scenario generation and scoring.

**Avoid purely internal states.** "The AI secretly wants X" can't be evaluated. Pair internal states with external manifestations.

### Tool Support

Add `tools` when the behavior involves tool use.

| Handler | What happens |
|---------|-------------|
| `handler: builtin` | Real execution, schemas auto-fill (Read, Write, Edit, TaskCreate, TaskUpdate, TaskList, TaskGet) |
| *(omitted)* | Evaluator LLM simulates responses (needs full definition) |
| `handler: module:func` | Your Python function — `(args: dict, **kwargs) -> str` |

File tools operate on a sandboxed workspace per eval run.

### Fixed Scenarios

Generated scenarios are great for broad coverage but ephemeral — they're overwritten each time you run `generate`. When you find a scenario that reliably surfaces a behavior (or an edge case you want to regression-test), promote it to a **fixed scenario**.

Fixed scenarios live as YAML files in `./scenarios/` and are referenced by name in the behavior YAML:

```yaml
scenarios:
  - prod-incident
```

Each scenario file has the same structure ideation produces — `description`.

```yaml
# scenarios/prod-incident.yml
description: |
  **Scenario 1: Production Incident at a Fintech Startup** **Setting and Context:**...
```
</creating_behaviors>

<lessons>

### When you're stuck

When you're stuck, take a deep breath, and try a low-probability out-there approach. Approach prompting by testing one hypothesis at a time. Use todos to track hypotheses.

### The judge needs updating too

When scores feel wrong, the instinct is to fix the prompt. But sometimes the judge is miscalibrating. Common fixes:

- **Hard gates.** When a behavior has a binary prerequisite (must produce HTML, must call a specific tool), put it at the TOP of `understanding` as an explicit gate: "If X didn't happen → 1/10, regardless of everything else." Without a gate, judges will score a beautiful wrong-format response highly.
- **Anchor on the artifact, not the reasoning.** If the eval tests whether the AI produces a specific output, the judge must check whether that output EXISTS before evaluating its quality.

### Don't overfit the scorer to the test

When writing the `understanding` field, use DIFFERENT examples than the ones being tested. For example, if your test scenarios involve career change conversations and your understanding explains scoring with career change examples, the judge learns to pattern-match on that scenario rather than understanding the underlying behavior.
</lessons>

<sharing_transcripts>
YOU read transcripts with `{{soulcraft_command}} results`. The TUI (`soulcraft tui`) is the human-readable version — it renders transcripts with color-coded roles, tool calls, and judge outputs in a navigable interface.

When you find transcripts worth the human's attention — breakthroughs, regressions, or ambiguous calls where you want their taste — open them in Terminal windows. Only do this when the user is present (they've messaged recently, not away).

Tell them what to look at in each one before opening. "The grief scenario went from 5 to 8 — the new framing landed. But the technical-frustration one regressed — look at turn 3, it's hedging now."

Build the scenario list dynamically from what you found in the transcripts, then open them:

```bash
osascript -e 'tell application "Terminal"
  do script "printf \"\\e]0;" & label & "\\a\"; {{soulcraft_command}} tui " & beh & " " & slug
  set bounds of front window to {xPos, yPos, xPos + winW, yPos + winH}
end tell'
```

The `--goto` path: `behavior/runId/vN` (e.g. `warmth/2026-03-21_011431/v1`). You can also target a behavior (`warmth`) or a run (`warmth/2026-03-21_011431`).

Transcripts need width — never shrink below 900w to fit more. Get screen bounds, calculate how many fit in one centered row, cascade the rest behind with a (30, 30) offset.

```bash
# Get screen size, then build one osascript that opens all windows
osascript -e 'tell application "Finder" to get bounds of window of desktop'
# Use: W=900, H=940, gap=20
# Row capacity: floor((screenW - 80) / (W + gap))
# Center: X0 = (screenW - cols*(W+gap) + gap) / 2, Y0 = (screenH - H) / 2
# Windows beyond row capacity: cascade behind slot [i % cols] with (30, 30) offset × floor(i / cols)
# Always end with: activate

Don't shrink windows below 900px wide. When you need more than one row, offset each row +30px down and right so they stack visually.
</sharing_transcripts>
