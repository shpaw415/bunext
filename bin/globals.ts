
// Global type declarations
declare global {
    var __INIT__: boolean | undefined;
}
// Configuration constants
export const CONFIG = {
    DATABASE_PATH: (process.env.DATABASE_NAME || "bunext") + ".sqlite",
    DATABASE_SCHEMA_PATH: "database.ts",
} as const;