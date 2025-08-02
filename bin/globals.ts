
// Global type declarations
declare global {
    var __INIT__: boolean | undefined;
}

// Initialize global variables safely
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