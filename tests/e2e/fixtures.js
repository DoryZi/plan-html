import { test as base, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SERVE = join(REPO, "serve_plan.py");
const PYTHON = process.env.PLAN_HTML_PYTHON || "python3";

const SAMPLE_PLAN = {
  title: "E2E plan",
  slug: "e2e",
  round: 1,
  rev: 0,
  goal: "Exercise the deck UI end to end",
  intents: [
    {
      id: "i1",
      title: "An existing intent",
      intent: "I want the deck to work",
      verify: { method: "e2e", command: "run", expected: "ok" },
    },
  ],
  decisions: [
    {
      id: "d1",
      title: "A fork",
      status: "needs-you",
      summary: "pick one",
      building: "stuff",
      options: ["A", "B"],
    },
  ],
  steps: [{ id: "step-0", title: "First step", description: "do it", intent: "i1" }],
  finalVerify: [{ intent: "i1", method: "e2e", command: "run", expected: "ok" }],
  diagramSvg: "<rect class='node' x='10' y='10' width='140' height='48'/>",
  diagramViewBox: "0 0 200 80",
};

/**
 * `deck` fixture: writes a plan.json to a temp dir, starts serve_plan.py --live
 * on a random port, captures the URL from stderr, and exposes helpers. Tears
 * the server down after the test.
 */
export const test = base.extend({
  deck: async ({}, use) => {
    const dir = mkdtempSync(join(tmpdir(), "plan-html-e2e-"));
    const planPath = join(dir, "plan.json");
    writeFileSync(planPath, JSON.stringify(SAMPLE_PLAN));

    const proc = spawn(
      PYTHON,
      [SERVE, "--plan", planPath, "--no-open", "--live", "--host", "127.0.0.1", "--timeout", "60"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const stdoutLines = [];
    proc.stdout.on("data", (b) => {
      for (const ln of b.toString().split("\n")) if (ln.trim()) stdoutLines.push(ln.trim());
    });

    const url = await new Promise((resolve, reject) => {
      let buf = "";
      const onErr = (b) => {
        buf += b.toString();
        const m = buf.match(/at (http:\/\/127\.0\.0\.1:\d+)\//);
        if (m) {
          proc.stderr.off("data", onErr);
          resolve(m[1] + "/");
        }
      };
      proc.stderr.on("data", onErr);
      proc.on("exit", () => reject(new Error("server exited before ready")));
      setTimeout(() => reject(new Error("server start timeout")), 10_000);
    });

    const api = {
      url,
      dir,
      planPath,
      readPlan: () => JSON.parse(readFileSync(planPath, "utf-8")),
      writePlan: (p) => writeFileSync(planPath, JSON.stringify(p)),
      readAnswers: () => {
        const p = join(dir, "answers.json");
        return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : null;
      },
      readQuestions: () => {
        const p = join(dir, "questions.json");
        return existsSync(p) ? JSON.parse(readFileSync(p, "utf-8")) : [];
      },
      stdoutLines,
    };

    await use(api);
    proc.kill("SIGKILL");
  },
});

export { expect };
