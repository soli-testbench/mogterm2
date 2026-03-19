/**
 * Tests for the MogTerm terminal engine.
 * Run with: node test/terminal.test.js
 */

import { Terminal } from '../src/terminal.js';
import { Parser } from '../src/parser.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
    console.error(`    expected: ${JSON.stringify(expected)}`);
    console.error(`    actual:   ${JSON.stringify(actual)}`);
  }
}

function test(name, fn) {
  console.log(`test: ${name}`);
  try {
    fn();
  } catch (e) {
    failed++;
    console.error(`  ERROR: ${e.message}`);
    console.error(e.stack);
  }
}

// ─── Parser tests ────────────────────────────────────────────

test('Parser: printable characters', () => {
  const p = new Parser();
  const chars = [];
  p.onPrint = (ch) => chars.push(ch);
  p.feed('Hello');
  assertEqual(chars.join(''), 'Hello', 'should collect printable chars');
});

test('Parser: C0 control codes', () => {
  const p = new Parser();
  const codes = [];
  p.onExecute = (code) => codes.push(code);
  p.feed('\x07\x08\x0a\x0d');
  assertEqual(codes.length, 4, 'should execute 4 control codes');
  assertEqual(codes[0], 0x07, 'BEL');
  assertEqual(codes[1], 0x08, 'BS');
  assertEqual(codes[2], 0x0a, 'LF');
  assertEqual(codes[3], 0x0d, 'CR');
});

test('Parser: CSI sequence', () => {
  const p = new Parser();
  let result = null;
  p.onCsiDispatch = (params, inter, final) => {
    result = { params, inter, final };
  };
  p.feed('\x1b[5;10H');
  assert(result !== null, 'CSI should dispatch');
  assertEqual(result.params[0], 5, 'param 0 = 5');
  assertEqual(result.params[1], 10, 'param 1 = 10');
  assertEqual(result.final, 'H', 'final = H');
});

test('Parser: CSI with no params', () => {
  const p = new Parser();
  let result = null;
  p.onCsiDispatch = (params, inter, final) => {
    result = { params, inter, final };
  };
  p.feed('\x1b[H');
  assert(result !== null, 'CSI should dispatch');
  assertEqual(result.params.length, 0, 'no params');
  assertEqual(result.final, 'H', 'final = H');
});

test('Parser: CSI private mode', () => {
  const p = new Parser();
  let result = null;
  p.onCsiDispatch = (params, inter, final) => {
    result = { params, inter, final };
  };
  p.feed('\x1b[?25l');
  assert(result !== null, 'CSI should dispatch');
  assertEqual(result.inter, '?', 'intermediate = ?');
  assertEqual(result.params[0], 25, 'param = 25');
  assertEqual(result.final, 'l', 'final = l');
});

test('Parser: OSC sequence (BEL terminated)', () => {
  const p = new Parser();
  let payload = null;
  p.onOscDispatch = (pl) => { payload = pl; };
  p.feed('\x1b]0;My Title\x07');
  assertEqual(payload, '0;My Title', 'OSC payload correct');
});

test('Parser: OSC sequence (ST terminated)', () => {
  const p = new Parser();
  let payload = null;
  p.onOscDispatch = (pl) => { payload = pl; };
  p.feed('\x1b]2;Window Title\x1b\\');
  assertEqual(payload, '2;Window Title', 'OSC payload correct');
});

test('Parser: ESC sequence', () => {
  const p = new Parser();
  let result = null;
  p.onEscDispatch = (inter, final) => { result = { inter, final }; };
  p.feed('\x1b7');
  assert(result !== null, 'ESC should dispatch');
  assertEqual(result.final, '7', 'final = 7 (DECSC)');
});

// ─── Terminal tests ──────────────────────────────────────────

test('Terminal: initial state', () => {
  const t = new Terminal(80, 24);
  assertEqual(t.cols, 80, 'cols = 80');
  assertEqual(t.rows, 24, 'rows = 24');
  assertEqual(t.cursorRow, 0, 'cursor at row 0');
  assertEqual(t.cursorCol, 0, 'cursor at col 0');
  assertEqual(t.cursorVisible, true, 'cursor visible');
});

test('Terminal: print characters', () => {
  const t = new Terminal(80, 24);
  t.write('Hello');
  assertEqual(t.cursorCol, 5, 'cursor at col 5');
  assertEqual(t.cells[0][0].char, 'H', 'cell 0,0 = H');
  assertEqual(t.cells[0][4].char, 'o', 'cell 0,4 = o');
});

test('Terminal: CR + LF', () => {
  const t = new Terminal(80, 24);
  t.write('Hello\r\nWorld');
  assertEqual(t.cursorRow, 1, 'cursor at row 1');
  assertEqual(t.cursorCol, 5, 'cursor at col 5');
  assertEqual(t.cells[1][0].char, 'W', 'row 1, col 0 = W');
});

test('Terminal: backspace', () => {
  const t = new Terminal(80, 24);
  t.write('AB\x08C');
  assertEqual(t.cells[0][0].char, 'A', 'A not overwritten');
  assertEqual(t.cells[0][1].char, 'C', 'B overwritten by C');
  assertEqual(t.cursorCol, 2, 'cursor at col 2');
});

test('Terminal: tab', () => {
  const t = new Terminal(80, 24);
  t.write('A\tB');
  assertEqual(t.cursorCol, 9, 'cursor at col 9 after tab+B');
  assertEqual(t.cells[0][8].char, 'B', 'B at col 8');
});

test('Terminal: CUP (cursor position)', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[5;10H');
  assertEqual(t.cursorRow, 4, 'row = 4 (1-indexed 5)');
  assertEqual(t.cursorCol, 9, 'col = 9 (1-indexed 10)');
});

test('Terminal: CUP default params', () => {
  const t = new Terminal(80, 24);
  t.write('test\x1b[H');
  assertEqual(t.cursorRow, 0, 'row = 0');
  assertEqual(t.cursorCol, 0, 'col = 0');
});

test('Terminal: cursor movement A/B/C/D', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[10;10H');
  t.write('\x1b[3A');  // up 3
  assertEqual(t.cursorRow, 6, 'up 3 from row 9 = row 6');
  t.write('\x1b[2B');  // down 2
  assertEqual(t.cursorRow, 8, 'down 2 = row 8');
  t.write('\x1b[5C');  // forward 5
  assertEqual(t.cursorCol, 14, 'forward 5 from col 9 = col 14');
  t.write('\x1b[3D');  // back 3
  assertEqual(t.cursorCol, 11, 'back 3 = col 11');
});

test('Terminal: erase in display (clear screen)', () => {
  const t = new Terminal(80, 24);
  t.write('Hello World');
  t.write('\x1b[2J');
  assertEqual(t.cells[0][0].char, ' ', 'screen cleared');
});

test('Terminal: erase in line', () => {
  const t = new Terminal(80, 24);
  t.write('Hello World');
  t.write('\x1b[5G');  // move to col 5
  t.write('\x1b[K');   // erase to right
  assertEqual(t.cells[0][0].char, 'H', 'before cursor preserved');
  assertEqual(t.cells[0][4].char, ' ', 'col 4 erased');
  assertEqual(t.cells[0][5].char, ' ', 'col 5 erased');
});

test('Terminal: SGR bold', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[1mBold');
  assertEqual(t.cells[0][0].attr.bold, true, 'cell has bold attr');
});

test('Terminal: SGR foreground color', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[31mRed');
  assertEqual(t.cells[0][0].attr.fg, 1, 'fg = 1 (red)');
});

test('Terminal: SGR background color', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[44mText');
  assertEqual(t.cells[0][0].attr.bg, 4, 'bg = 4 (blue)');
});

test('Terminal: SGR reset', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[1;31mRed\x1b[0mNormal');
  assertEqual(t.cells[0][3].attr.bold, false, 'bold reset');
  assertEqual(t.cells[0][3].attr.fg, null, 'fg reset');
});

test('Terminal: SGR 256-color', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[38;5;196mX');
  const fg = t.cells[0][0].attr.fg;
  assert(fg && fg.type === '256', '256-color type');
  assertEqual(fg.value, 196, 'color value = 196');
});

test('Terminal: SGR truecolor', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[38;2;100;200;50mX');
  const fg = t.cells[0][0].attr.fg;
  assert(fg && fg.type === 'rgb', 'rgb type');
  assertEqual(fg.r, 100, 'r = 100');
  assertEqual(fg.g, 200, 'g = 200');
  assertEqual(fg.b, 50, 'b = 50');
});

test('Terminal: bright foreground colors', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[91mX');
  assertEqual(t.cells[0][0].attr.fg, 9, 'fg = 9 (bright red)');
});

test('Terminal: OSC set title', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b]0;Hello Title\x07');
  assertEqual(t.title, 'Hello Title', 'title set');
});

test('Terminal: DECSC / DECRC (save/restore cursor)', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[5;10H');
  t.write('\x1b7');  // save
  t.write('\x1b[1;1H');
  t.write('\x1b8');  // restore
  assertEqual(t.cursorRow, 4, 'cursor row restored');
  assertEqual(t.cursorCol, 9, 'cursor col restored');
});

test('Terminal: hide/show cursor', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[?25l');
  assertEqual(t.cursorVisible, false, 'cursor hidden');
  t.write('\x1b[?25h');
  assertEqual(t.cursorVisible, true, 'cursor visible');
});

test('Terminal: scroll region', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[5;20r');
  assertEqual(t.scrollTop, 4, 'scroll top = 4');
  assertEqual(t.scrollBottom, 19, 'scroll bottom = 19');
});

test('Terminal: auto-wrap', () => {
  const t = new Terminal(10, 3);
  t.write('1234567890X');
  assertEqual(t.cursorRow, 1, 'wrapped to row 1');
  assertEqual(t.cursorCol, 1, 'cursor at col 1 after wrap');
  assertEqual(t.cells[1][0].char, 'X', 'X on new line');
});

test('Terminal: scrolling on line overflow', () => {
  const t = new Terminal(80, 3);
  t.write('Line1\r\nLine2\r\nLine3\r\nLine4');
  // After 4 lines in a 3-row terminal, Line1 should have scrolled off
  assertEqual(t.cells[0][0].char, 'L', 'row 0 starts with L');
  assertEqual(t.cells[0][4].char, '2', 'row 0 has Line2');
  assertEqual(t.cells[2][4].char, '4', 'row 2 has Line4');
});

test('Terminal: reset', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[31mHello');
  t.reset();
  assertEqual(t.cursorRow, 0, 'cursor at 0,0');
  assertEqual(t.cursorCol, 0, 'cursor at 0,0');
  assertEqual(t.cells[0][0].char, ' ', 'buffer cleared');
  assertEqual(t.attr.fg, null, 'attrs reset');
});

test('Terminal: resize', () => {
  const t = new Terminal(80, 24);
  t.write('Test');
  t.resize(40, 12);
  assertEqual(t.cols, 40, 'cols = 40');
  assertEqual(t.rows, 12, 'rows = 12');
  assertEqual(t.cells.length, 12, '12 rows in buffer');
  assertEqual(t.cells[0].length, 40, '40 cols per row');
  assertEqual(t.cells[0][0].char, 'T', 'content preserved');
});

test('Terminal: getState returns correct structure', () => {
  const t = new Terminal(80, 24);
  t.write('Hi');
  const state = t.getState();
  assertEqual(state.cols, 80, 'state.cols');
  assertEqual(state.rows, 24, 'state.rows');
  assertEqual(state.cursorCol, 2, 'state.cursorCol');
  assert(Array.isArray(state.cells), 'state.cells is array');
  assertEqual(state.cells.length, 24, '24 rows');
  assertEqual(state.cells[0].length, 80, '80 cols');
});

test('Terminal: toString', () => {
  const t = new Terminal(10, 2);
  t.write('Hi');
  const str = t.toString();
  assert(str.startsWith('Hi'), 'toString starts with Hi');
});

test('Terminal: insert lines', () => {
  const t = new Terminal(80, 5);
  t.write('Line0\r\nLine1\r\nLine2\r\nLine3\r\nLine4');
  t.write('\x1b[2;1H');  // move to row 2 (0-indexed: 1)
  t.write('\x1b[1L');     // insert 1 line
  assertEqual(t.cells[1][0].char, ' ', 'inserted blank line at row 1');
  assertEqual(t.cells[2][4].char, '1', 'Line1 shifted down');
});

test('Terminal: delete lines', () => {
  const t = new Terminal(80, 5);
  t.write('Line0\r\nLine1\r\nLine2\r\nLine3\r\nLine4');
  t.write('\x1b[2;1H');  // move to row 2 (0-indexed: 1)
  t.write('\x1b[1M');     // delete 1 line
  assertEqual(t.cells[1][4].char, '2', 'Line2 shifted up to row 1');
});

test('Terminal: feed() alias', () => {
  const t = new Terminal(80, 24);
  t.feed('Hello');
  assertEqual(t.cells[0][0].char, 'H', 'feed works like write');
});

test('Terminal: erase in display mode 1 (above)', () => {
  const t = new Terminal(80, 3);
  t.write('AAA\r\nBBB\r\nCCC');
  t.write('\x1b[2;2H');  // row 1, col 1
  t.write('\x1b[1J');     // erase above
  assertEqual(t.cells[0][0].char, ' ', 'row 0 erased');
  assertEqual(t.cells[1][0].char, ' ', 'row 1 col 0 erased');
  assertEqual(t.cells[2][0].char, 'C', 'row 2 preserved');
});

test('Terminal: resize grow preserves content', () => {
  const t = new Terminal(10, 5);
  t.write('ABCDE');
  t.resize(20, 10);
  assertEqual(t.cols, 20, 'cols grew to 20');
  assertEqual(t.rows, 10, 'rows grew to 10');
  assertEqual(t.cells.length, 10, '10 rows in buffer');
  assertEqual(t.cells[0].length, 20, '20 cols per row');
  assertEqual(t.cells[0][0].char, 'A', 'content preserved after grow');
  assertEqual(t.cells[0][4].char, 'E', 'content preserved after grow');
  assertEqual(t.cells[0][5].char, ' ', 'new cols are blank');
});

test('Terminal: resize shrink clamps cursor', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[24;80H');  // move cursor to last row, last col
  assertEqual(t.cursorRow, 23, 'cursor at row 23');
  assertEqual(t.cursorCol, 79, 'cursor at col 79');
  t.resize(40, 12);
  assertEqual(t.cursorRow, 11, 'cursor row clamped to 11');
  assertEqual(t.cursorCol, 39, 'cursor col clamped to 39');
});

test('Terminal: resize to 1x1', () => {
  const t = new Terminal(80, 24);
  t.write('Hello');
  t.resize(1, 1);
  assertEqual(t.cols, 1, 'cols = 1');
  assertEqual(t.rows, 1, 'rows = 1');
  assertEqual(t.cells.length, 1, '1 row');
  assertEqual(t.cells[0].length, 1, '1 col');
  assertEqual(t.cursorRow, 0, 'cursor row clamped');
  assertEqual(t.cursorCol, 0, 'cursor col clamped');
});

test('Terminal: resize updates scroll region', () => {
  const t = new Terminal(80, 24);
  t.write('\x1b[5;20r');  // set scroll region rows 5-20
  assertEqual(t.scrollBottom, 19, 'scrollBottom = 19');
  t.resize(80, 10);
  assertEqual(t.scrollBottom, 9, 'scrollBottom reset to rows-1 after resize');
});

test('Terminal: functionality after resize', () => {
  const t = new Terminal(80, 24);
  t.resize(40, 12);
  t.write('\x1b[2J\x1b[H');  // clear and home
  t.write('After resize');
  assertEqual(t.cells[0][0].char, 'A', 'can write after resize');
  assertEqual(t.cells[0][5].char, ' ', 'space at correct position');
  t.write('\x1b[2;1H');  // move to row 2
  t.write('Second line');
  assertEqual(t.cells[1][0].char, 'S', 'cursor movement works after resize');
});

// ─── Summary ─────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
