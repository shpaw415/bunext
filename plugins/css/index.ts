import type { BunextPlugin } from "../types";
import { readdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { DevConsole } from "../../internal/server/logs";

interface CSSModulesConfig {
    srcDir?: string;
}

const DEFAULT_CONFIG: CSSModulesConfig = {
    srcDir: "./src",
};

export const cssModulesTypesPlugin: BunextPlugin = {
    priority: 11,

    serverStart: {
        async main() {
            await generateAllCSSModuleTypes(DEFAULT_CONFIG);
        }
    },
    router: {
        async request(manager) {
            if (!manager.bunextReq.isAskingHTML && !manager.bunextReq.isClientNavigating) return;
            const cssPaths = await manager.router.getCssPaths(true);
            manager.bunextReq.InjectGlobalValues({
                __CSS_PATHS__: cssPaths
            });
        }
    },

    onFileSystemChange: async (filePath, preventBuild) => {

        if (filePath?.endsWith('.module.css')) {
            preventBuild();
            await generateAllCSSModuleTypes(DEFAULT_CONFIG);
        }
    }
};

async function generateAllCSSModuleTypes(config: CSSModulesConfig) {
    try {
        const srcDir = config.srcDir || "./src";
        await walkDirectory(srcDir, async (filePath) => {
            if (filePath.endsWith('.module.css')) {
                await generateSingleCSSModuleType(filePath);
            }
        });
    } catch (error) {
        console.error("❌ Failed to generate CSS Module types:");
        console.error(error);
    }
}

async function generateSingleCSSModuleType(filePath: string) {
    try {
        const cssContent = await Bun.file(filePath).text();
        const classNames = extractClassNames(cssContent);

        if (classNames.length === 0) {
            return; // No classes found, skip type generation
        }

        const typeDefinition = generateTypeDefinition(classNames);
        const typeFilePath = `${filePath}.d.ts`;
        await Bun.file(typeFilePath).write(typeDefinition);
    } catch (error) {
        console.error(`❌ Failed to generate types for ${filePath}:`, error);
    }
}

function extractClassNames(cssContent: string): string[] {
    // Match CSS class selectors (.className)
    const classRegex = /\.([a-zA-Z][a-zA-Z0-9_-]*)\s*\{/g;
    const classNames: Set<string> = new Set();
    let match;

    while ((match = classRegex.exec(cssContent)) !== null) {
        const className = match[1];
        // Skip CSS pseudo-classes and ensure valid identifier
        if (isValidIdentifier(className)) {
            classNames.add(className);
        }
    }

    return Array.from(classNames).sort();
}

function isValidIdentifier(name: string): boolean {
    // Check if it's a valid TypeScript identifier
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name);
}

function generateTypeDefinition(classNames: string[]): string {
    const properties = classNames
        .map(name => `  readonly ${name}: string;`)
        .join('\n');

    return `declare const styles: {
${properties}
};

export default styles;
`;
}

async function walkDirectory(dir: string, callback: (filePath: string) => Promise<void>) {
    try {
        const entries = await readdir(dir);

        for (const entry of entries) {
            const fullPath = join(dir, entry);
            const stats = await stat(fullPath);

            if (stats.isDirectory()) {
                await walkDirectory(fullPath, callback);
            } else {
                await callback(fullPath);
            }
        }
    } catch (error) {
        // Ignore errors for directories that don't exist or can't be read
    }
}

export function createCSSModulesTypesPlugin(config: CSSModulesConfig = {}) {
    const mergedConfig = { ...DEFAULT_CONFIG, ...config };

    return {
        ...cssModulesTypesPlugin,
        serverStart: {
            async dev() {
                DevConsole("🎨 Generating CSS Module types with custom config...");
                await generateAllCSSModuleTypes(mergedConfig);
            },
            async main() {
                await generateAllCSSModuleTypes(mergedConfig);
            }
        }
    };
}

export default cssModulesTypesPlugin;