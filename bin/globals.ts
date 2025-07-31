import { type Subprocess } from "bun";


// Global type declarations
declare global {
    var processes: Subprocess[];
    var __INIT__: boolean | undefined;
}

// Initialize global variables safely
globalThis.processes ??= [];
globalThis.head ??= {};

// Configuration constants
export const CONFIG = {
    DATABASE_PATH: (process.env.DATABASE_NAME || "bunext") + ".sqlite",
    DATABASE_SCHEMA_PATH: "database.ts",
    SEPARATORS: {
        IMPORT: '("<Bunext_TypeImposts>");',
        EXPORT: '("<Bunext_DBExport>");',
    },
} as const;