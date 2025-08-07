"server only";

import "./bunext_global.ts";
import { terminal } from 'terminal-kit';

declare global {
  var BunextConsole: ScrollingConsole;
}

const separator = "-----------------------------------";
const bunextBlue = ToColor("blue", "BUNEXT:");
const solutionGreen = ToColor("green", "Solution:");

const _isUnicodeSupported = isUnicodeSupported();
export const TerminalIcon = {
  info: ToColor("blue", _isUnicodeSupported ? "ℹ" : "i"),
  success: _isUnicodeSupported ? "✔" : "√",
  warning: ToColor("yellow", _isUnicodeSupported ? "⚠" : "‼"),
  error: ToColor("red", _isUnicodeSupported ? "✖️" : "×"),
  play: ToColor("white", _isUnicodeSupported ? "▶" : ">"),
  line: ToColor("white", "─"),
};

export const TextColor = "rgb(230,230,230)" as const;

export const BuildServerComponentWithHooksWarning = `${separator}
${bunextBlue} this can occur when you export a jsx element that is verify as a server component and has hooks.
${solutionGreen} create a local function component and export a function component that return a reference to this local function component.
Exemple at: ${ToColor(
  "rgb(0,100,255)",
  "https://bunext.mate-team.com/workaround/server-components#hook"
)}
${separator}
`;

export const AfterBunextInitMessage = `${separator}
${ToColor("blue", "Bunext")} is now ready to roll.
Run: \`${ToColor("white", "bun run dev")}\` to start the dev environment!
`;

const clear = "\x1b[0m";
export function ToColor(color: string, value: string | number) {
  try {
    return Bun.color(color, "ansi") + value?.toString() + clear;
  } catch {
    return value;
  }
}

function isUnicodeSupported() {
  const { env } = process;
  const { TERM, TERM_PROGRAM } = env;

  if (process.platform !== "win32") {
    return TERM !== "linux"; // Linux console (kernel)
  }

  return (
    Boolean(env.WT_SESSION) || // Windows Terminal
    Boolean(env.TERMINUS_SUBLIME) || // Terminus (<0.2.27)
    env.ConEmuTask === "{cmd::Cmder}" || // ConEmu and cmder
    TERM_PROGRAM === "Terminus-Sublime" ||
    TERM_PROGRAM === "vscode" ||
    TERM === "xterm-256color" ||
    TERM === "alacritty" ||
    TERM === "rxvt-unicode" ||
    TERM === "rxvt-unicode-256color" ||
    env.TERMINAL_EMULATOR === "JetBrains-JediTerm"
  );
}

export const SessionNotInitedWarning = `${TerminalIcon.error} ${ToColor(
  "red",
  "Error! "
)} ${ToColor(
  TextColor,
  "This error occurred because the plugin did not initialized the session before using it.\n await request.session.initData()"
)}`;

export function getStartLog() {
  return [
    `bunext ${process.env.NODE_ENV}`,
    "",
    ToColor("purple", `${TerminalIcon.play} Bunext ${Bunext.version}`),
    `${TerminalIcon.line} Local:   http://localhost:${serverConfig.HTTPServer.port}`,
    "",
  ].join("\n   ");
}

// Helper function to format different data types for console display
function formatForConsole(data: any): string {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof Error) {
    // Format Error objects with stack trace
    const errorInfo: any = {
      name: data.name,
      message: data.message,
      stack: data.stack
    };

    // Add cause if it exists
    if (data.cause) {
      errorInfo.cause = data.cause;
    }

    // Include any additional custom properties
    Object.getOwnPropertyNames(data).forEach(key => {
      if (!['name', 'message', 'stack'].includes(key)) {
        errorInfo[key] = (data as any)[key];
      }
    });

    return JSON.stringify(errorInfo, null, 2);
  }

  // Handle other objects
  try {
    return JSON.stringify(data, null, 2);
  } catch (error) {
    // Fallback for circular references or non-serializable objects
    return String(data);
  }
}

// Enhanced Scrolling Console Implementation with terminal-kit
class ScrollingConsole {
  private static instance: ScrollingConsole;
  private headerLines: string[] = [];
  private scrollingMessages: string[] = [];
  private maxScrollingLines = 50;
  private isInitialized = false;
  private headerHeight = 0;
  private terminalHeight = 0;
  private terminalWidth = 0;
  private scrollOffset = 0;
  private originalConsole: Console;
  private isConsoleRedirected = false;

  private constructor() {
    // Store the original console methods
    this.originalConsole = { ...console };

    this.terminalHeight = terminal.height;
    this.terminalWidth = terminal.width;

    terminal.grabInput({
      mouse: "button",
      safe: false
    });

    terminal.on('resize', (width: number, height: number) => {
      this.terminalWidth = width;
      this.terminalHeight = height;
      if (this.isInitialized) {
        this.render();
      }
    });

    terminal.on('key', (key: string) => {
      if (key === 'UP') {
        this.scrollUp();
      } else if (key === 'DOWN') {
        this.scrollDown();
      } else if (key === 'HOME') {
        const maxScroll = Math.max(0, this.scrollingMessages.length - this.getAvailableLines());
        this.scrollOffset = maxScroll;
        this.render();
      } else if (key === 'END') {
        this.scrollOffset = 0;
        this.render();
      } else if (key === 'CTRL_C') {
        this.destroy();
        process.exit(0);
      }
    });

    terminal.on('mouse', (name: string) => {
      if (name === "MOUSE_WHEEL_DOWN") {
        this.scrollDown();
      }
      if (name === "MOUSE_WHEEL_UP") {
        this.scrollUp();
      }
    });
  }

  static getInstance(): ScrollingConsole {
    if (!ScrollingConsole.instance) {
      ScrollingConsole.instance = new ScrollingConsole();
    }
    return ScrollingConsole.instance;
  }

  initialize() {
    if (this.isInitialized) {
      //console.clear();
      this.render();
      return;
    }

    this.headerLines = getStartLog().split("\n");
    this.headerHeight = this.headerLines.length + 1;
    this.isInitialized = true;

    terminal.fullscreen(true);
    terminal.clear();
    terminal.hideCursor();

    this.render();
  }

  addMessage(message: string, autoScroll: boolean = true) {
    if (!this.isInitialized) {
      // If not initialized but console is redirected, try to use original console
      if (this.isConsoleRedirected && this.originalConsole) {
        this.originalConsole.log(message);
      } else {
        console.log(message);
      }
      return;
    }

    const timestamp = new Date().toLocaleTimeString();

    // Handle multi-line messages by splitting them
    const lines = message.split('\n');

    lines.forEach((line, index) => {
      // Only add timestamp to the first line of a multi-line message
      const timestampedMessage = index === 0
        ? `^K[${timestamp}]^ ${line}`
        : `^K[${' '.repeat(timestamp.length)}]^ ${line}`;

      this.scrollingMessages.push(timestampedMessage);
    });

    // Keep only the last maxScrollingLines messages
    if (this.scrollingMessages.length > this.maxScrollingLines) {
      this.scrollingMessages = this.scrollingMessages.slice(-this.maxScrollingLines);
    }

    // Auto-scroll to bottom when new message is added
    if (autoScroll) {
      this.scrollOffset = 0;
    }

    this.render();
  }

  private scrollUp() {
    const availableLines = this.getAvailableLines();
    const maxScroll = Math.max(0, this.scrollingMessages.length - availableLines);
    const oldOffset = this.scrollOffset;
    this.scrollOffset = Math.min(this.scrollOffset + 1, maxScroll);

    if (this.scrollOffset !== oldOffset) {
      this.render();
    }
  }

  private scrollDown() {
    const oldOffset = this.scrollOffset;
    this.scrollOffset = Math.max(0, this.scrollOffset - 1);

    if (this.scrollOffset !== oldOffset) {
      this.render();
    }
  }

  private getAvailableLines(): number {
    const startY = this.headerHeight + 2;
    return Math.min(
      this.maxScrollingLines,
      this.terminalHeight - startY - 1
    );
  }

  private render() {
    if (!this.isInitialized) return;

    terminal.moveTo(1, 1);
    terminal.eraseDisplayBelow();
    terminal.styleReset();

    this.headerLines.forEach((line, index) => {
      terminal.moveTo(1, index + 1);
      if (line.includes('Bunext')) {
        terminal.magenta(line);
      } else if (line.includes('Local:')) {
        terminal.cyan(line);
      } else {
        terminal.white(line);
      }
    });

    terminal.moveTo(1, this.headerHeight);
    terminal.gray('─'.repeat(this.terminalWidth - 2));

    const startY = this.headerHeight + 2;
    const availableLines = this.getAvailableLines();

    const totalMessages = this.scrollingMessages.length;
    const startIndex = Math.max(0, totalMessages - availableLines - this.scrollOffset);
    const endIndex = Math.max(0, totalMessages - this.scrollOffset);
    const visibleMessages = this.scrollingMessages.slice(startIndex, endIndex);

    visibleMessages.forEach((message, index) => {
      terminal.moveTo(1, startY + index);
      terminal.eraseLineAfter();
      this.renderColoredMessage(message);
    });

    for (let i = startY + visibleMessages.length; i < this.terminalHeight; i++) {
      terminal.moveTo(1, i);
      terminal.eraseLineAfter();
    }

    if (this.scrollOffset > 0 || totalMessages > availableLines) {
      const scrollIndicatorY = startY + availableLines;
      terminal.moveTo(this.terminalWidth - 10, scrollIndicatorY);
      terminal.gray(`(${totalMessages - endIndex}↑ ${this.scrollOffset}↓)`);
    }
  }

  private renderColoredMessage(message: string) {
    const cleanMessage = message.replace(/^\^K\[.*?\]\^ /, '');

    if (cleanMessage.includes('✔')) {
      terminal.green(cleanMessage);
    } else if (cleanMessage.includes('✖️') || cleanMessage.includes('×')) {
      terminal.red(cleanMessage);
    } else if (cleanMessage.includes('⚠') || cleanMessage.includes('‼')) {
      terminal.yellow(cleanMessage);
    } else if (cleanMessage.includes('ℹ') || cleanMessage.includes('i')) {
      terminal.blue(cleanMessage);
    } else if (cleanMessage.includes('▶') || cleanMessage.includes('>')) {
      terminal.cyan(cleanMessage);
    } else {
      terminal.white(cleanMessage);
    }
  }

  clear() {
    this.scrollingMessages = [];
    this.scrollOffset = 0;
    this.render();
  }

  destroy() {
    if (this.isInitialized) {
      this.restoreConsole();
      terminal.grabInput(false);
      terminal.removeAllListeners('key');
      terminal.removeAllListeners('mouse');
      terminal.removeAllListeners('resize');
      terminal.fullscreen(false);
      terminal.hideCursor(false);
      terminal.styleReset();
      terminal.clear();
      this.isInitialized = false;
    }
  }

  // Console redirection methods
  redirectConsole() {
    if (this.isConsoleRedirected) return;

    this.isConsoleRedirected = true;

    // Override console methods to use ScrollingConsole
    console.log = (...args: any[]) => this.log(...args);
    console.info = (...args: any[]) => this.info(...args);
    console.warn = (...args: any[]) => this.warn(...args);
    console.error = (...args: any[]) => this.error(...args);
    console.debug = (...args: any[]) => this.debug(...args);
    console.trace = (...args: any[]) => this.trace(...args);
    console.assert = (condition?: boolean, ...args: any[]) => this.assert(condition, ...args);
    console.clear = () => this.clear();
    console.count = (label?: string) => this.count(label);
    console.countReset = (label?: string) => this.countReset(label);
    console.group = (...args: any[]) => this.group(...args);
    console.groupCollapsed = (...args: any[]) => this.groupCollapsed(...args);
    console.groupEnd = () => this.groupEnd();
    console.time = (label?: string) => this.time(label);
    console.timeEnd = (label?: string) => this.timeEnd(label);
    console.timeLog = (label?: string, ...args: any[]) => this.timeLog(label, ...args);
    console.dir = (obj: any, options?: any) => this.dir(obj, options);
    console.dirxml = (...args: any[]) => this.dirxml(...args);
    console.table = (tabularData: any, properties?: string[]) => this.table(tabularData, properties);
  }

  restoreConsole() {
    if (!this.isConsoleRedirected) return;

    this.isConsoleRedirected = false;

    // Restore original console methods
    Object.assign(console, this.originalConsole);
  }

  get redirected(): boolean {
    return this.isConsoleRedirected;
  }

  // Console API methods - perfectly compatible with native console
  private formatArguments(...args: any[]): string {
    return args.map(arg => formatForConsole(arg)).join(' ');
  }

  log(...args: any[]) {
    const message = this.formatArguments(...args);
    this.addMessage(message);
  }

  info(...args: any[]) {
    const message = `${TerminalIcon.info} ${this.formatArguments(...args)}`;
    this.addMessage(message);
  }

  warn(...args: any[]) {
    const message = `${TerminalIcon.warning} ${this.formatArguments(...args)}`;
    this.addMessage(message);
  }

  error(...args: any[]) {
    const message = `${TerminalIcon.error} ${this.formatArguments(...args)}`;
    this.addMessage(message);
  }

  debug(...args: any[]) {
    const message = `🐛 ${this.formatArguments(...args)}`;
    this.addMessage(message);
  }

  trace(...args: any[]) {
    const message = this.formatArguments(...args);
    this.addMessage(message);

    // Add stack trace
    const stack = new Error().stack;
    if (stack) {
      const stackLines = stack.split('\n').slice(2); // Remove Error and trace method lines
      stackLines.forEach(line => {
        this.addMessage(`    ${line.trim()}`);
      });
    }
  }

  assert(condition?: boolean, ...args: any[]) {
    if (!condition) {
      const message = args.length > 0
        ? `Assertion failed: ${this.formatArguments(...args)}`
        : 'Assertion failed';
      this.error(message);
    }
  }

  // Counter functionality
  private counters = new Map<string, number>();

  count(label: string = 'default') {
    const current = (this.counters.get(label) || 0) + 1;
    this.counters.set(label, current);
    this.log(`${label}: ${current}`);
  }

  countReset(label: string = 'default') {
    this.counters.delete(label);
  }

  // Group functionality
  private groupLevel = 0;
  private getGroupIndent(): string {
    return '  '.repeat(this.groupLevel);
  }

  group(...args: any[]) {
    if (args.length > 0) {
      this.log(`${this.getGroupIndent()}▼ ${this.formatArguments(...args)}`);
    }
    this.groupLevel++;
  }

  groupCollapsed(...args: any[]) {
    if (args.length > 0) {
      this.log(`${this.getGroupIndent()}▶ ${this.formatArguments(...args)}`);
    }
    this.groupLevel++;
  }

  groupEnd() {
    if (this.groupLevel > 0) {
      this.groupLevel--;
    }
  }

  // Timer functionality
  private timers = new Map<string, number>();

  time(label: string = 'default') {
    this.timers.set(label, performance.now());
  }

  timeEnd(label: string = 'default') {
    const startTime = this.timers.get(label);
    if (startTime !== undefined) {
      const elapsed = performance.now() - startTime;
      this.log(`${label}: ${elapsed.toFixed(3)}ms`);
      this.timers.delete(label);
    } else {
      this.warn(`Timer '${label}' does not exist`);
    }
  }

  timeLog(label: string = 'default', ...args: any[]) {
    const startTime = this.timers.get(label);
    if (startTime !== undefined) {
      const elapsed = performance.now() - startTime;
      const message = args.length > 0
        ? `${label}: ${elapsed.toFixed(3)}ms ${this.formatArguments(...args)}`
        : `${label}: ${elapsed.toFixed(3)}ms`;
      this.log(message);
    } else {
      this.warn(`Timer '${label}' does not exist`);
    }
  }

  // Directory and table methods
  dir(obj: any, options?: any) {
    try {
      const formatted = JSON.stringify(obj, null, 2);
      this.log(formatted);
    } catch (error) {
      this.log(String(obj));
    }
  }

  dirxml(...args: any[]) {
    this.log(...args);
  }

  table(tabularData: any, properties?: string[]) {
    try {
      if (Array.isArray(tabularData)) {
        // Simple table representation for arrays
        tabularData.forEach((item, index) => {
          this.log(`${index}: ${formatForConsole(item)}`);
        });
      } else {
        // For objects, show key-value pairs
        Object.entries(tabularData).forEach(([key, value]) => {
          this.log(`${key}: ${formatForConsole(value)}`);
        });
      }
    } catch (error) {
      this.log(formatForConsole(tabularData));
    }
  }
}

// Initialize global instance
globalThis.BunextConsole ??= ScrollingConsole.getInstance();

// Initialize the console (call this on server startup)
export function initializeDevConsole() {
  globalThis.BunextConsole.initialize();
  globalThis.BunextConsole.redirectConsole();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nReceived SIGINT, cleaning up...');
    globalThis.BunextConsole.destroy();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\nReceived SIGTERM, cleaning up...');
    globalThis.BunextConsole.destroy();
    process.exit(0);
  });
}

// Enhanced DevConsole that uses scrolling
export function DevConsole(data?: any) {
  const message = formatForConsole(data);
  if (data) globalThis.BunextConsole.addMessage(message);

  return {
    success: DevConsoleSuccess,
    info: DevConsoleInfo,
    warning: DevConsoleWarning,
    error: DevConsoleError,
  }
}

// Enhanced console functions
export function DevConsoleSuccess(message: string) {
  DevConsole(`${TerminalIcon.success} ${message}`);
}

export function DevConsoleInfo(message: string) {
  DevConsole(`${TerminalIcon.info} ${message}`);
}

export function DevConsoleWarning(message: string) {
  DevConsole(`${TerminalIcon.warning} ${message}`);
}

export function DevConsoleError(message: string, error?: any) {
  DevConsole(`${TerminalIcon.error} ${message}`);
  if (error) {
    // Use the enhanced formatting for error objects
    DevConsole(error);
  }
}

export function clearDevConsole() {
  if (process.env.NODE_ENV === "development") {
    globalThis.BunextConsole.clear();
  }
}

// Console redirection control functions
export function redirectConsoleToScrolling() {
  globalThis.BunextConsole.redirectConsole();
}

export function restoreOriginalConsole() {
  globalThis.BunextConsole.restoreConsole();
}

// Check if console is redirected
export function isConsoleRedirected(): boolean {
  return globalThis.BunextConsole?.redirected ?? false;
}
/**
 * time in ms
 */
export async function benchmark_console<T>(
  note: (time: number, res: T) => string | undefined | false | null,
  measuring: () => Promise<T> | T,
  onProduction = false
) {
  const start = process.hrtime();
  const measuringRes = await measuring();
  const elapsed = Math.round(process.hrtime(start)[1] / 1000000); // divide by a million to get nano to milli
  const res = note(elapsed, measuringRes);
  const enabled = process.env.NODE_ENV == "development" || onProduction;

  if (res && enabled) {
    if (process.env.NODE_ENV == "development") {
      DevConsole(res);
    } else {
      console.log(res);
    }
  }

  return measuringRes;
}
