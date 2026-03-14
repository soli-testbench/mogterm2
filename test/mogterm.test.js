/**
 * Mogterm unit tests - runs in Node with jsdom-like DOM simulation.
 * Falls back to basic assertion checks if no DOM is available.
 */

/* global document, KeyboardEvent */

function createMockDOM() {
  // Minimal DOM mock for Node environments without jsdom
  const elements = [];

  class MockElement {
    constructor(tag) {
      this.tagName = tag.toUpperCase();
      this.className = '';
      this.textContent = '';
      this.innerHTML = '';
      this.children = [];
      this.childNodes = [];
      this.attributes = {};
      this.style = {};
      this.scrollTop = 0;
      this.scrollHeight = 100;
      this._listeners = {};
    }
    classList = {
      _classes: new Set(),
      add(c) { this._classes.add(c); },
      remove(c) { this._classes.delete(c); },
      contains(c) { return this._classes.has(c); },
    };
    setAttribute(k, v) { this.attributes[k] = v; }
    getAttribute(k) { return this.attributes[k]; }
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    }
    dispatchEvent(event) {
      const fns = this._listeners[event.type] || [];
      for (const fn of fns) fn(event);
    }
    focus() {
      this.dispatchEvent({ type: 'focus' });
    }
    appendChild(child) {
      this.children.push(child);
      this.childNodes.push(child);
      return child;
    }
    createElement(tag) {
      return new MockElement(tag);
    }
  }

  const mockDoc = {
    createElement(tag) { return new MockElement(tag); },
    createDocumentFragment() { return new MockElement('fragment'); },
    createTextNode(text) {
      const node = new MockElement('#text');
      node.textContent = text;
      return node;
    },
  };

  return { MockElement, mockDoc };
}

function assert(condition, msg) {
  if (!condition) throw new Error('FAIL: ' + msg);
  process.stdout.write('  PASS: ' + msg + '\n');
}

async function runTests() {
  // Load Mogterm
  const fs = require('fs');
  const path = require('path');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'mogterm.js'), 'utf8');

  const { MockElement, mockDoc } = createMockDOM();

  // Provide global document for Mogterm
  global.document = mockDoc;

  // Evaluate Mogterm source
  const Mogterm = eval(`(function() { ${src}; return Mogterm; })()`);

  // Test 1: Constructor sets up container correctly
  process.stdout.write('Test: Constructor\n');
  {
    const el = new MockElement('div');
    const term = new Mogterm(el);
    assert(el.classList.contains('mogterm'), 'container has mogterm class');
    assert(el.attributes['tabindex'] === '0', 'container is focusable');
  }

  // Test 2: Typing inserts characters at cursor position
  process.stdout.write('Test: Character input\n');
  {
    const el = new MockElement('div');
    const term = new Mogterm(el);
    assert(term.inputBuffer === '', 'buffer starts empty');
    assert(term.cursorPos === 0, 'cursor starts at 0');

    // Simulate typing 'abc'
    term._onKeyDown({ key: 'a', length: 1, preventDefault() {} });
    assert(term.inputBuffer === 'a', 'buffer is "a" after typing a');
    assert(term.cursorPos === 1, 'cursor is 1 after typing a');

    term._onKeyDown({ key: 'b', length: 1, preventDefault() {} });
    term._onKeyDown({ key: 'c', length: 1, preventDefault() {} });
    assert(term.inputBuffer === 'abc', 'buffer is "abc"');
    assert(term.cursorPos === 3, 'cursor is 3 after typing abc');
  }

  // Test 3: ArrowLeft and ArrowRight move cursor
  process.stdout.write('Test: Arrow key navigation\n');
  {
    const el = new MockElement('div');
    const term = new Mogterm(el);
    term._onKeyDown({ key: 'h', length: 1, preventDefault() {} });
    term._onKeyDown({ key: 'i', length: 1, preventDefault() {} });
    assert(term.cursorPos === 2, 'cursor at 2 after "hi"');

    term._onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
    assert(term.cursorPos === 1, 'cursor at 1 after ArrowLeft');

    term._onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
    assert(term.cursorPos === 0, 'cursor at 0 after second ArrowLeft');

    // Should not go below 0
    term._onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
    assert(term.cursorPos === 0, 'cursor stays at 0');

    term._onKeyDown({ key: 'ArrowRight', preventDefault() {} });
    assert(term.cursorPos === 1, 'cursor at 1 after ArrowRight');

    term._onKeyDown({ key: 'ArrowRight', preventDefault() {} });
    assert(term.cursorPos === 2, 'cursor at 2 after second ArrowRight');

    // Should not go beyond buffer length
    term._onKeyDown({ key: 'ArrowRight', preventDefault() {} });
    assert(term.cursorPos === 2, 'cursor stays at 2');
  }

  // Test 4: Backspace removes character before cursor
  process.stdout.write('Test: Backspace\n');
  {
    const el = new MockElement('div');
    const term = new Mogterm(el);
    term._onKeyDown({ key: 'a', length: 1, preventDefault() {} });
    term._onKeyDown({ key: 'b', length: 1, preventDefault() {} });
    term._onKeyDown({ key: 'c', length: 1, preventDefault() {} });

    term._onKeyDown({ key: 'Backspace', preventDefault() {} });
    assert(term.inputBuffer === 'ab', 'buffer is "ab" after backspace');
    assert(term.cursorPos === 2, 'cursor at 2 after backspace');

    // Move cursor left, then backspace
    term._onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
    term._onKeyDown({ key: 'Backspace', preventDefault() {} });
    assert(term.inputBuffer === 'b', 'buffer is "b" after mid-backspace');
    assert(term.cursorPos === 0, 'cursor at 0 after mid-backspace');

    // Backspace at position 0 should do nothing
    term._onKeyDown({ key: 'Backspace', preventDefault() {} });
    assert(term.inputBuffer === 'b', 'buffer unchanged when backspace at 0');
    assert(term.cursorPos === 0, 'cursor unchanged when backspace at 0');
  }

  // Test 5: Enter submits and resets
  process.stdout.write('Test: Enter submit\n');
  {
    const el = new MockElement('div');
    let submitted = null;
    const term = new Mogterm(el, { onCommand: (cmd) => { submitted = cmd; } });
    term._onKeyDown({ key: 'l', length: 1, preventDefault() {} });
    term._onKeyDown({ key: 's', length: 1, preventDefault() {} });

    term._onKeyDown({ key: 'Enter', preventDefault() {} });
    assert(submitted === 'ls', 'command "ls" was submitted');
    assert(term.inputBuffer === '', 'buffer reset after enter');
    assert(term.cursorPos === 0, 'cursor reset after enter');
    assert(term.history.length === 1, 'history has one entry');
    assert(term.history[0] === '$ ls', 'history contains prompt + command');
  }

  // Test 6: Inserting at mid-position
  process.stdout.write('Test: Mid-position insert\n');
  {
    const el = new MockElement('div');
    const term = new Mogterm(el);
    term._onKeyDown({ key: 'a', length: 1, preventDefault() {} });
    term._onKeyDown({ key: 'c', length: 1, preventDefault() {} });
    term._onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
    term._onKeyDown({ key: 'b', length: 1, preventDefault() {} });
    assert(term.inputBuffer === 'abc', 'insert "b" between "a" and "c"');
    assert(term.cursorPos === 2, 'cursor at 2 after mid-insert');
  }

  // Test 7: Ctrl/Meta keys are ignored
  process.stdout.write('Test: Modifier keys ignored\n');
  {
    const el = new MockElement('div');
    const term = new Mogterm(el);
    term._onKeyDown({ key: 'c', length: 1, ctrlKey: true, preventDefault() {} });
    assert(term.inputBuffer === '', 'ctrl+c does not type');
  }

  // Test 8: writeLine adds to history
  process.stdout.write('Test: writeLine\n');
  {
    const el = new MockElement('div');
    const term = new Mogterm(el);
    term.writeLine('hello world');
    assert(term.history.length === 1, 'history has one entry');
    assert(term.history[0] === 'hello world', 'history contains the text');
  }

  process.stdout.write('\nAll tests passed!\n');
}

runTests().catch((err) => {
  process.stderr.write(err.message + '\n');
  process.exit(1);
});
