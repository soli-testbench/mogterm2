/**
 * ANSI/VT100 escape sequence parser.
 *
 * Implements a state machine that processes a byte stream and emits actions:
 *   - print(char)          : printable character
 *   - execute(code)        : C0/C1 control code (BEL, BS, HT, LF, CR, ...)
 *   - csiDispatch(params, intermediates, final)  : CSI sequence
 *   - oscDispatch(payload)                        : OSC sequence
 *   - escDispatch(intermediates, final)           : plain ESC sequence
 */

// Parser states
const STATE = {
  GROUND: 0,
  ESCAPE: 1,
  ESCAPE_INTERMEDIATE: 2,
  CSI_ENTRY: 3,
  CSI_PARAM: 4,
  CSI_INTERMEDIATE: 5,
  OSC_STRING: 6,
};

export class Parser {
  constructor() {
    this.state = STATE.GROUND;
    this.params = [];
    this.currentParam = '';
    this.intermediates = '';
    this.oscPayload = '';

    // Callbacks — set by consumer
    this.onPrint = null;
    this.onExecute = null;
    this.onCsiDispatch = null;
    this.onEscDispatch = null;
    this.onOscDispatch = null;
  }

  /**
   * Feed a string of data into the parser.
   * @param {string} data
   */
  feed(data) {
    for (let i = 0; i < data.length; i++) {
      const ch = data[i];
      const code = data.charCodeAt(i);
      this._processChar(ch, code);
    }
  }

  _processChar(ch, code) {
    switch (this.state) {
      case STATE.GROUND:
        this._ground(ch, code);
        break;
      case STATE.ESCAPE:
        this._escape(ch, code);
        break;
      case STATE.ESCAPE_INTERMEDIATE:
        this._escapeIntermediate(ch, code);
        break;
      case STATE.CSI_ENTRY:
        this._csiEntry(ch, code);
        break;
      case STATE.CSI_PARAM:
        this._csiParam(ch, code);
        break;
      case STATE.CSI_INTERMEDIATE:
        this._csiIntermediate(ch, code);
        break;
      case STATE.OSC_STRING:
        this._oscString(ch, code);
        break;
    }
  }

  _ground(ch, code) {
    if (code === 0x1b) {
      this.state = STATE.ESCAPE;
      this.intermediates = '';
      return;
    }
    // C0 control codes
    if (code < 0x20 || code === 0x7f) {
      this.onExecute?.(code);
      return;
    }
    // Printable
    this.onPrint?.(ch);
  }

  _escape(ch, code) {
    if (ch === '[') {
      this.state = STATE.CSI_ENTRY;
      this.params = [];
      this.currentParam = '';
      this.intermediates = '';
      return;
    }
    if (ch === ']') {
      this.state = STATE.OSC_STRING;
      this.oscPayload = '';
      return;
    }
    // Intermediate bytes (0x20-0x2F)
    if (code >= 0x20 && code <= 0x2f) {
      this.intermediates += ch;
      this.state = STATE.ESCAPE_INTERMEDIATE;
      return;
    }
    // Final byte (0x30-0x7E)
    if (code >= 0x30 && code <= 0x7e) {
      this.onEscDispatch?.(this.intermediates, ch);
      this.state = STATE.GROUND;
      return;
    }
    // Cancel / unhandled — back to ground
    this.state = STATE.GROUND;
  }

  _escapeIntermediate(ch, code) {
    if (code >= 0x20 && code <= 0x2f) {
      this.intermediates += ch;
      return;
    }
    if (code >= 0x30 && code <= 0x7e) {
      this.onEscDispatch?.(this.intermediates, ch);
      this.state = STATE.GROUND;
      return;
    }
    this.state = STATE.GROUND;
  }

  _csiEntry(ch, code) {
    // Immediately look at the first char
    if (code >= 0x30 && code <= 0x39) {
      this.currentParam += ch;
      this.state = STATE.CSI_PARAM;
      return;
    }
    if (ch === ';') {
      this.params.push(0);
      this.state = STATE.CSI_PARAM;
      return;
    }
    if (ch === '?') {
      // Private mode marker — store as intermediate
      this.intermediates += ch;
      this.state = STATE.CSI_PARAM;
      return;
    }
    // Final byte
    if (code >= 0x40 && code <= 0x7e) {
      this._finalizeCsi(ch);
      return;
    }
    // Intermediate
    if (code >= 0x20 && code <= 0x2f) {
      this.intermediates += ch;
      this.state = STATE.CSI_INTERMEDIATE;
      return;
    }
    this.state = STATE.GROUND;
  }

  _csiParam(ch, code) {
    if (code >= 0x30 && code <= 0x39) {
      this.currentParam += ch;
      return;
    }
    if (ch === ';') {
      this.params.push(this.currentParam === '' ? 0 : parseInt(this.currentParam, 10));
      this.currentParam = '';
      return;
    }
    // Intermediate
    if (code >= 0x20 && code <= 0x2f) {
      this.params.push(this.currentParam === '' ? 0 : parseInt(this.currentParam, 10));
      this.currentParam = '';
      this.intermediates += ch;
      this.state = STATE.CSI_INTERMEDIATE;
      return;
    }
    // Final byte
    if (code >= 0x40 && code <= 0x7e) {
      this._finalizeCsi(ch);
      return;
    }
    this.state = STATE.GROUND;
  }

  _csiIntermediate(ch, code) {
    if (code >= 0x20 && code <= 0x2f) {
      this.intermediates += ch;
      return;
    }
    if (code >= 0x40 && code <= 0x7e) {
      this._finalizeCsi(ch);
      return;
    }
    this.state = STATE.GROUND;
  }

  _finalizeCsi(finalChar) {
    if (this.currentParam !== '') {
      this.params.push(parseInt(this.currentParam, 10));
    } else if (this.params.length === 0) {
      // No params at all — leave empty
    }
    this.currentParam = '';
    this.onCsiDispatch?.(this.params, this.intermediates, finalChar);
    this.state = STATE.GROUND;
  }

  _oscString(ch, code) {
    // OSC terminated by ST (ESC \) or BEL (0x07)
    if (code === 0x07) {
      this.onOscDispatch?.(this.oscPayload);
      this.state = STATE.GROUND;
      return;
    }
    if (code === 0x1b) {
      // Might be ESC \ (ST) — peek-ahead not possible in char-by-char,
      // so we'll handle \ in next iteration
      this._oscEscSeen = true;
      return;
    }
    if (this._oscEscSeen) {
      this._oscEscSeen = false;
      if (ch === '\\') {
        this.onOscDispatch?.(this.oscPayload);
        this.state = STATE.GROUND;
        return;
      }
      // Not ST — discard
      this.state = STATE.GROUND;
      return;
    }
    this.oscPayload += ch;
  }

  reset() {
    this.state = STATE.GROUND;
    this.params = [];
    this.currentParam = '';
    this.intermediates = '';
    this.oscPayload = '';
    this._oscEscSeen = false;
  }
}
