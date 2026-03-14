import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { runFixture, TestFixture } from "../src/adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixtures(filename: string): TestFixture[] {
  const raw = readFileSync(join(__dirname, "fixtures", filename), "utf-8");
  return JSON.parse(raw) as TestFixture[];
}

function runSuite(suiteName: string, filename: string): void {
  describe(suiteName, () => {
    const fixtures = loadFixtures(filename);
    for (const fixture of fixtures) {
      it(fixture.name, () => {
        const result = runFixture(fixture);
        if (!result.passed) {
          assert.fail(
            `Test "${fixture.name}" failed:\n  ${result.failures.join("\n  ")}`
          );
        }
      });
    }
  });
}

runSuite("Basic text output", "basic.json");
runSuite("Cursor movement (CUU/CUD/CUF/CUB/CUP)", "cursor.json");
runSuite("Erase operations (ED, EL)", "erase.json");
runSuite("SGR text attributes", "sgr.json");
runSuite("Line wrapping", "wrapping.json");
