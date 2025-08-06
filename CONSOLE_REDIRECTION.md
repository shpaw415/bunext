# Enhanced Scrolling Console

The enhanced ScrollingConsole in `logs.ts` provides a fully compatible replacement for the native console with terminal-based scrolling capabilities.

## Features

### Complete Console API Compatibility
- All standard console methods: `log`, `info`, `warn`, `error`, `debug`, `trace`
- Console utilities: `clear`, `assert`, `count`, `countReset`
- Grouping: `group`, `groupCollapsed`, `groupEnd`
- Timing: `time`, `timeEnd`, `timeLog`
- Data inspection: `dir`, `dirxml`, `table`

### Enhanced Terminal Interface
- Scrollable message history (use arrow keys, mouse wheel)
- Colorized output with icons
- Persistent header with server info
- Automatic timestamps
- Supports multi-line messages

### Console Redirection
- Automatic redirection in development mode
- Manual control with `redirectConsoleToScrolling()` and `restoreOriginalConsole()`
- Fallback to original console when not initialized

## Usage

### Automatic Setup (Recommended)
```typescript
import { initializeDevConsole } from './internal/server/logs.ts';

// In development mode, this automatically redirects console
initializeDevConsole();

// Now all console.* calls use the scrolling interface
console.log("Hello world!");
console.error("This shows with an error icon");
console.group("Grouped messages");
console.log("Inside group");
console.groupEnd();
```

### Manual Control
```typescript
import { 
  redirectConsoleToScrolling, 
  restoreOriginalConsole, 
  isConsoleRedirected 
} from './internal/server/logs.ts';

// Manually redirect console
redirectConsoleToScrolling();
console.log("This uses ScrollingConsole");

// Check if redirected
if (isConsoleRedirected()) {
  console.log("Console is redirected");
}

// Restore original console
restoreOriginalConsole();
console.log("Back to normal console");
```

### Advanced Features
```typescript
// Timing operations
console.time("operation");
setTimeout(() => {
  console.timeLog("operation", "halfway done");
  console.timeEnd("operation");
}, 1000);

// Counting
console.count("requests"); // requests: 1
console.count("requests"); // requests: 2

// Assertions
console.assert(condition, "This only shows if condition is false");

// Tables and objects
console.table([{ name: "Alice", age: 30 }]);
console.dir({ complex: { object: true } });
```

## Keyboard Controls

When the scrolling console is active:
- `↑/↓` - Scroll through messages
- `Home` - Jump to top of history
- `End` - Jump to bottom (latest messages)
- `Mouse Wheel` - Scroll messages
- `Ctrl+C` - Exit gracefully

## Configuration

The console can be configured through the ScrollingConsole class:
- `maxScrollingLines`: Maximum number of messages to keep (default: 50)
- Message formatting and colorization can be customized in `renderColoredMessage()`

## Testing

Run the test file to see the console redirection in action:
```bash
bun run test-console-redirection.ts
```
