/**
 * MogTerm Test Adapter
 *
 * Bridges test fixtures to the MogTerm engine. Feeds input sequences
 * and extracts terminal state for assertion comparison.
 */

import { MogTermEngine, Cell, CursorState, CellAttributes } from "./engine.js";

export interface CellAssertion {
  row: number;
  col: number;
  char?: string;
  bold?: boolean;
  fg?: number | null;
  bg?: number | null;
}

export interface StateAssertion {
  cursor?: { row: number; col: number };
  cells?: CellAssertion[];
  rowText?: { row: number; text: string }[];
}

export interface TestFixture {
  name: string;
  cols?: number;
  rows?: number;
  input: string;
  expect: StateAssertion;
}

export interface TestResult {
  name: string;
  passed: boolean;
  failures: string[];
}

/**
 * Parse escape-sequence shorthand notation used in test fixtures.
 * Converts human-readable notation to raw terminal bytes:
 *   \e  -> ESC (0x1b)
 *   \n  -> LF  (0x0a)
 *   \r  -> CR  (0x0d)
 *   \t  -> TAB (0x09)
 *   \xNN -> hex byte
 */
export function parseInput(input: string): string {
  let result = "";
  let i = 0;
  while (i < input.length) {
    if (input[i] === "\\" && i + 1 < input.length) {
      const next = input[i + 1];
      if (next === "e") {
        result += "\x1b";
        i += 2;
      } else if (next === "n") {
        result += "\n";
        i += 2;
      } else if (next === "r") {
        result += "\r";
        i += 2;
      } else if (next === "t") {
        result += "\t";
        i += 2;
      } else if (next === "x" && i + 3 < input.length) {
        const hex = input.substring(i + 2, i + 4);
        result += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else if (next === "\\") {
        result += "\\";
        i += 2;
      } else {
        result += input[i];
        i++;
      }
    } else {
      result += input[i];
      i++;
    }
  }
  return result;
}

/** Run a single test fixture against the engine and return results. */
export function runFixture(fixture: TestFixture): TestResult {
  const engine = new MogTermEngine(fixture.rows ?? 24, fixture.cols ?? 80);
  const rawInput = parseInput(fixture.input);
  engine.feed(rawInput);

  const failures: string[] = [];
  const { expect } = fixture;

  // Check cursor position
  if (expect.cursor) {
    const cur = engine.getCursor();
    if (cur.row !== expect.cursor.row) {
      failures.push(
        `cursor.row: expected ${expect.cursor.row}, got ${cur.row}`
      );
    }
    if (cur.col !== expect.cursor.col) {
      failures.push(
        `cursor.col: expected ${expect.cursor.col}, got ${cur.col}`
      );
    }
  }

  // Check individual cells
  if (expect.cells) {
    for (const ca of expect.cells) {
      const cell = engine.getCell(ca.row, ca.col);
      if (!cell) {
        failures.push(`cell[${ca.row},${ca.col}]: out of bounds`);
        continue;
      }
      if (ca.char !== undefined && cell.char !== ca.char) {
        failures.push(
          `cell[${ca.row},${ca.col}].char: expected ${JSON.stringify(ca.char)}, got ${JSON.stringify(cell.char)}`
        );
      }
      if (ca.bold !== undefined && cell.attrs.bold !== ca.bold) {
        failures.push(
          `cell[${ca.row},${ca.col}].bold: expected ${ca.bold}, got ${cell.attrs.bold}`
        );
      }
      if (ca.fg !== undefined && cell.attrs.fg !== ca.fg) {
        failures.push(
          `cell[${ca.row},${ca.col}].fg: expected ${ca.fg}, got ${cell.attrs.fg}`
        );
      }
      if (ca.bg !== undefined && cell.attrs.bg !== ca.bg) {
        failures.push(
          `cell[${ca.row},${ca.col}].bg: expected ${ca.bg}, got ${cell.attrs.bg}`
        );
      }
    }
  }

  // Check row text
  if (expect.rowText) {
    for (const rt of expect.rowText) {
      const actual = engine.getRowText(rt.row);
      if (actual !== rt.text) {
        failures.push(
          `row[${rt.row}] text: expected ${JSON.stringify(rt.text)}, got ${JSON.stringify(actual)}`
        );
      }
    }
  }

  return {
    name: fixture.name,
    passed: failures.length === 0,
    failures,
  };
}

/** Run a batch of fixtures and return all results. */
export function runFixtures(fixtures: TestFixture[]): TestResult[] {
  return fixtures.map(runFixture);
}
