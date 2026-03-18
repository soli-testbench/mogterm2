/**
 * MogTerm Terminal Emulation Engine
 *
 * Processes raw escape sequences and control codes, maintaining
 * terminal state (screen buffer, cursor, text attributes).
 */

export interface CellAttributes {
  bold: boolean;
  fg: number | null;   // null = default, 0-7 standard, 8-15 bright
  bg: number | null;
}

export interface Cell {
  char: string;
  attrs: CellAttributes;
}

export interface CursorState {
  row: number;
  col: number;
}

export interface TerminalState {
  rows: number;
  cols: number;
  cursor: CursorState;
  cells: Cell[][];
  attrs: CellAttributes;
}

function defaultAttrs(): CellAttributes {
  return { bold: false, fg: null, bg: null };
}

function emptyCell(): Cell {
  return { char: " ", attrs: defaultAttrs() };
}

export class MogTermEngine {
  private state: TerminalState;
  private parseState: "ground" | "escape" | "csi" = "ground";
  private csiParams: string = "";

  onBell: (() => void) | null = null;

  constructor(rows: number = 24, cols: number = 80) {
    this.state = {
      rows,
      cols,
      cursor: { row: 0, col: 0 },
      cells: [],
      attrs: defaultAttrs(),
    };
    for (let r = 0; r < rows; r++) {
      this.state.cells.push(this.emptyRow());
    }
  }

  private emptyRow(): Cell[] {
    const row: Cell[] = [];
    for (let c = 0; c < this.state.cols; c++) {
      row.push(emptyCell());
    }
    return row;
  }

  /** Feed raw bytes/string into the engine. */
  feed(input: string | Uint8Array): void {
    const text = typeof input === "string" ? input : new TextDecoder().decode(input);
    for (const ch of text) {
      this.processChar(ch);
    }
  }

  private processChar(ch: string): void {
    switch (this.parseState) {
      case "ground":
        this.groundState(ch);
        break;
      case "escape":
        this.escapeState(ch);
        break;
      case "csi":
        this.csiState(ch);
        break;
    }
  }

  private groundState(ch: string): void {
    const code = ch.charCodeAt(0);

    if (code === 0x1b) {
      this.parseState = "escape";
      return;
    }

    if (code === 0x07) { // BEL
      this.onBell?.();
      return;
    }

    if (code === 0x0a) { // LF
      this.lineFeed();
      return;
    }

    if (code === 0x0d) { // CR
      this.state.cursor.col = 0;
      return;
    }

    if (code === 0x08) { // BS
      if (this.state.cursor.col > 0) {
        this.state.cursor.col--;
      }
      return;
    }

    if (code === 0x09) { // TAB
      this.state.cursor.col = Math.min(
        this.state.cols - 1,
        (Math.floor(this.state.cursor.col / 8) + 1) * 8
      );
      return;
    }

    // Printable character
    if (code >= 0x20) {
      this.putChar(ch);
    }
  }

  private escapeState(ch: string): void {
    if (ch === "[") {
      this.parseState = "csi";
      this.csiParams = "";
      return;
    }
    // Unknown escape sequence - return to ground
    this.parseState = "ground";
  }

  private csiState(ch: string): void {
    const code = ch.charCodeAt(0);

    // Parameter bytes: 0x30-0x3F (digits, semicolons, etc.)
    if (code >= 0x30 && code <= 0x3f) {
      this.csiParams += ch;
      return;
    }

    // Final byte: 0x40-0x7E
    if (code >= 0x40 && code <= 0x7e) {
      this.executeCSI(ch);
      this.parseState = "ground";
      return;
    }

    // Intermediate bytes (0x20-0x2F) - ignore for now
  }

  private parseParams(defaultVal: number = 1): number[] {
    if (this.csiParams === "") return [defaultVal];
    return this.csiParams.split(";").map((p) => {
      const n = parseInt(p, 10);
      return isNaN(n) || n === 0 ? defaultVal : n;
    });
  }

  private parseParamsZeroDefault(): number[] {
    if (this.csiParams === "") return [0];
    return this.csiParams.split(";").map((p) => {
      const n = parseInt(p, 10);
      return isNaN(n) ? 0 : n;
    });
  }

  private executeCSI(finalByte: string): void {
    const params = this.parseParams();

    switch (finalByte) {
      case "A": // CUU - Cursor Up
        this.state.cursor.row = Math.max(0, this.state.cursor.row - params[0]);
        break;

      case "B": // CUD - Cursor Down
        this.state.cursor.row = Math.min(
          this.state.rows - 1,
          this.state.cursor.row + params[0]
        );
        break;

      case "C": // CUF - Cursor Forward
        this.state.cursor.col = Math.min(
          this.state.cols - 1,
          this.state.cursor.col + params[0]
        );
        break;

      case "D": // CUB - Cursor Back
        this.state.cursor.col = Math.max(0, this.state.cursor.col - params[0]);
        break;

      case "H":
      case "f": { // CUP - Cursor Position
        const cupParams = this.csiParams === ""
          ? [1, 1]
          : this.csiParams.split(";").map((p) => {
              const n = parseInt(p, 10);
              return isNaN(n) || n === 0 ? 1 : n;
            });
        const row = Math.min(this.state.rows, Math.max(1, cupParams[0] || 1)) - 1;
        const col = Math.min(this.state.cols, Math.max(1, cupParams[1] || 1)) - 1;
        this.state.cursor.row = row;
        this.state.cursor.col = col;
        break;
      }

      case "J": { // ED - Erase in Display
        const mode = this.parseParamsZeroDefault()[0];
        this.eraseDisplay(mode);
        break;
      }

      case "K": { // EL - Erase in Line
        const mode = this.parseParamsZeroDefault()[0];
        this.eraseLine(mode);
        break;
      }

      case "m": { // SGR - Select Graphic Rendition
        const sgrParams = this.parseParamsZeroDefault();
        this.applySGR(sgrParams);
        break;
      }
    }
  }

  private putChar(ch: string): void {
    const { cursor, cells, cols } = this.state;

    // Line wrapping
    if (cursor.col >= cols) {
      cursor.col = 0;
      this.lineFeed();
    }

    cells[cursor.row][cursor.col] = {
      char: ch,
      attrs: { ...this.state.attrs },
    };
    cursor.col++;
  }

  private lineFeed(): void {
    if (this.state.cursor.row < this.state.rows - 1) {
      this.state.cursor.row++;
    } else {
      // Scroll: remove top line, add empty line at bottom
      this.state.cells.shift();
      this.state.cells.push(this.emptyRow());
    }
  }

  private eraseDisplay(mode: number): void {
    const { cursor, cells, rows, cols } = this.state;
    switch (mode) {
      case 0: // Erase from cursor to end of display
        // Current line from cursor
        for (let c = cursor.col; c < cols; c++) {
          cells[cursor.row][c] = emptyCell();
        }
        // Lines below
        for (let r = cursor.row + 1; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            cells[r][c] = emptyCell();
          }
        }
        break;
      case 1: // Erase from start to cursor
        for (let r = 0; r < cursor.row; r++) {
          for (let c = 0; c < cols; c++) {
            cells[r][c] = emptyCell();
          }
        }
        for (let c = 0; c <= cursor.col; c++) {
          cells[cursor.row][c] = emptyCell();
        }
        break;
      case 2: // Erase entire display
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            cells[r][c] = emptyCell();
          }
        }
        break;
    }
  }

  private eraseLine(mode: number): void {
    const { cursor, cells, cols } = this.state;
    const row = cells[cursor.row];
    switch (mode) {
      case 0: // Erase from cursor to end of line
        for (let c = cursor.col; c < cols; c++) {
          row[c] = emptyCell();
        }
        break;
      case 1: // Erase from start of line to cursor
        for (let c = 0; c <= cursor.col; c++) {
          row[c] = emptyCell();
        }
        break;
      case 2: // Erase entire line
        for (let c = 0; c < cols; c++) {
          row[c] = emptyCell();
        }
        break;
    }
  }

  private applySGR(params: number[]): void {
    for (const p of params) {
      if (p === 0) {
        this.state.attrs = defaultAttrs();
      } else if (p === 1) {
        this.state.attrs.bold = true;
      } else if (p === 22) {
        this.state.attrs.bold = false;
      } else if (p >= 30 && p <= 37) {
        this.state.attrs.fg = p - 30;
      } else if (p === 39) {
        this.state.attrs.fg = null;
      } else if (p >= 40 && p <= 47) {
        this.state.attrs.bg = p - 40;
      } else if (p === 49) {
        this.state.attrs.bg = null;
      } else if (p >= 90 && p <= 97) {
        this.state.attrs.fg = p - 90 + 8;
      } else if (p >= 100 && p <= 107) {
        this.state.attrs.bg = p - 100 + 8;
      }
    }
  }

  /** Get current terminal state snapshot. */
  getState(): TerminalState {
    return {
      rows: this.state.rows,
      cols: this.state.cols,
      cursor: { ...this.state.cursor },
      cells: this.state.cells.map((row) =>
        row.map((cell) => ({
          char: cell.char,
          attrs: { ...cell.attrs },
        }))
      ),
      attrs: { ...this.state.attrs },
    };
  }

  /** Get text content of a specific row (trimmed trailing spaces). */
  getRowText(row: number): string {
    if (row < 0 || row >= this.state.rows) return "";
    return this.state.cells[row]
      .map((c) => c.char)
      .join("")
      .replace(/\s+$/, "");
  }

  /** Get the cell at a specific position. */
  getCell(row: number, col: number): Cell | null {
    if (row < 0 || row >= this.state.rows) return null;
    if (col < 0 || col >= this.state.cols) return null;
    return {
      char: this.state.cells[row][col].char,
      attrs: { ...this.state.cells[row][col].attrs },
    };
  }

  /** Get cursor position. */
  getCursor(): CursorState {
    return { ...this.state.cursor };
  }
}
