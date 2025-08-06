#!/usr/bin/env bun
import { initializeDevConsole, restoreOriginalConsole, isConsoleRedirected } from './internal/server/logs.ts';

console.log("Before redirection - this goes to normal console");

// Initialize the scrolling console (this will redirect console automatically in dev mode)
process.env.NODE_ENV = "development";
initializeDevConsole();

console.log("After redirection - this goes to ScrollingConsole");
console.info("Info message with icon");
console.warn("Warning message with icon");
console.error("Error message with icon");
console.debug("Debug message");

// Test grouping
console.group("Group 1");
console.log("Inside group 1");
console.group("Nested group");
console.log("Inside nested group");
console.groupEnd();
console.log("Back to group 1");
console.groupEnd();

// Test timing
console.time("test-timer");
setTimeout(() => {
    console.timeLog("test-timer", "intermediate log");
    setTimeout(() => {
        console.timeEnd("test-timer");

        // Test counting
        console.count("test-counter");
        console.count("test-counter");
        console.count();
        console.count();

        // Test assertions
        console.assert(true, "This should not show");
        console.assert(false, "This assertion failed as expected");

        // Test table
        console.table([
            { name: "Alice", age: 30 },
            { name: "Bob", age: 25 }
        ]);

        // Test objects
        console.dir({ complex: { nested: { object: true } } });

        console.log(`Console redirected: ${isConsoleRedirected()}`);

        // You can manually restore original console if needed
        // restoreOriginalConsole();
        // console.log("Back to original console");

    }, 500);
}, 500);
