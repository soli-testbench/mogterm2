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

// ─── Bell event tests ─────────────────────────────────────────

import { MogTermEngine } from "../src/engine.js";

describe("Bell event (BEL 0x07)", () => {
  it("single BEL fires callback once", () => {
    const engine = new MogTermEngine();
    let count = 0;
    engine.onBell = () => { count++; };
    engine.feed("\x07");
    assert.equal(count, 1);
  });

  it("multiple BELs fire callback multiple times (no debounce)", () => {
    const engine = new MogTermEngine();
    let count = 0;
    engine.onBell = () => { count++; };
    engine.feed("\x07\x07\x07");
    assert.equal(count, 3);
  });

  it("no handler registered = no error", () => {
    const engine = new MogTermEngine();
    assert.doesNotThrow(() => {
      engine.feed("\x07");
    });
  });

  it("BEL mixed with text still fires", () => {
    const engine = new MogTermEngine();
    let count = 0;
    engine.onBell = () => { count++; };
    engine.feed("Hello\x07World\x07");
    assert.equal(count, 2);
    assert.equal(engine.getRowText(0), "HelloWorld");
  });

  it("BEL callback receives no arguments", () => {
    const engine = new MogTermEngine();
    let args: unknown[] | null = null;
    engine.onBell = (...a: unknown[]) => { args = a; };
    engine.feed("\x07");
    assert.ok(args !== null);
    assert.equal((args as unknown[]).length, 0);
  });
});
