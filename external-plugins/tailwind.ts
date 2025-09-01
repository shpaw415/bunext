import type { BunextPlugin } from "../plugins/types";
import { join } from "path";



interface TailwindConfig {
  inputPath?: string;
  outputPath?: string;
  configFiles?: string[];
  watchMode?: boolean;
}

const DEFAULT_CONFIG: TailwindConfig = {
  inputPath: "./static/input-tailwind.css",
  outputPath: "./static/style.css",
  configFiles: ["tailwind.config.ts", "tailwind.config.js", "tailwind.config.mjs"],
  watchMode: process.env.NODE_ENV === "development"
};


/**
 * Tailwind CSS Plugin for Bunext
 * 
 * This plugin automatically:
 * - Detects Tailwind configuration files
 * - Creates the input CSS file if missing
 * - Compiles Tailwind CSS during build
 * - Supports both development and production modes
 * - Provides file system watching for config changes
 * 
 * @example Basic usage:
 * ```typescript
 * import tailwindPlugin from './external-plugins/tailwind';
 * 
 * const config: ServerConfig = {
 *   plugins: [tailwindPlugin]
 * };
 * ```
 * 
 * @example Custom configuration:
 * ```typescript
 * import { createTailwindPlugin } from './external-plugins/tailwind';
 * 
 * const customTailwind = createTailwindPlugin({
 *   inputPath: './styles/input.css',
 *   outputPath: './dist/styles.css',
 *   configFiles: ['tailwind.config.js']
 * });
 * 
 * const config: ServerConfig = {
 *   bunext_plugins: [customTailwind]
 * };
 * ```
 */
export const tailwindPlugin: BunextPlugin = {
  name: "tailwind-plugin",
  serverStart: {
    async dev() {
      await initializeTailwind(DEFAULT_CONFIG);
    },
    async main() {
      // Main server start logic, if needed
      console.log("🌟 Tailwind CSS plugin initialized in main server mode");
      await compileTailwindCSS(DEFAULT_CONFIG);
    }
  },

  before_build_main: async () => {
    if (process.env.NODE_ENV === "development") await compileTailwindCSS(DEFAULT_CONFIG);
  },

  onFileSystemChange: async (filePath?: string) => {
    // Watch for Tailwind config changes and recompile
    if (filePath && DEFAULT_CONFIG.configFiles?.some(config => filePath.includes(config))) {
      console.log("🎨 Tailwind config changed, recompiling...");
      await compileTailwindCSS(DEFAULT_CONFIG);
    }
  }
};

/**
 * Initialize Tailwind CSS setup
 */
async function initializeTailwind(config: TailwindConfig): Promise<void> {
  const cwd = process.cwd();
  let tailwindConfigFound = false;

  try {
    // Check for Tailwind configuration files
    for (const configFile of config.configFiles || []) {
      const configPath = join(cwd, configFile);

      if (await Bun.file(configPath).exists()) {
        tailwindConfigFound = true;
        console.log(`✅ Found Tailwind config: ${configFile}`);
        break;
      }
    }

    if (!tailwindConfigFound) {
      console.log("⚠️ No Tailwind config found, skipping Tailwind initialization");
      return;
    }

    // Set global flag for other parts of the framework
    //globalThis.tailwind_enabled = true;

    // Ensure input CSS file exists
    await ensureInputFile(config);

    console.log("🎨 Tailwind CSS plugin initialized successfully");

  } catch (error) {
    console.error("❌ Failed to initialize Tailwind:", error);
    throw error;
  }
}

/**
 * Ensure the Tailwind input CSS file exists
 */
async function ensureInputFile(config: TailwindConfig): Promise<void> {
  const inputPath = config.inputPath || DEFAULT_CONFIG.inputPath!;
  const inputFile = Bun.file(inputPath);

  if (!(await inputFile.exists())) {
    const defaultContent = `@import "tailwindcss/base";
@import "tailwindcss/components";
@import "tailwindcss/utilities";

/* Custom styles can be added here */`;

    await inputFile.write(defaultContent);
    console.log(`✅ Created Tailwind input file: ${inputPath}`);
  }
}

/**
 * Compile Tailwind CSS
 */
async function compileTailwindCSS(config: TailwindConfig): Promise<void> {

  const cwd = process.cwd();
  const inputPath = config.inputPath || DEFAULT_CONFIG.inputPath!;
  const outputPath = config.outputPath || DEFAULT_CONFIG.outputPath!;

  try {
    // Ensure input file exists before compilation
    await ensureInputFile(config);

    console.log("🔄 Compiling Tailwind CSS...");

    const buildArgs = [
      "@tailwindcss/cli",
      "-i", inputPath,
      "-o", outputPath
    ];

    // Add minification for production builds
    if (process.env.NODE_ENV === "production") {
      buildArgs.push("--minify");
      console.log("🗜️ Production mode: minifying CSS");
    }

    // Check if output directory exists, create if not
    const outputDir = outputPath.substring(0, outputPath.lastIndexOf('/'));
    if (outputDir && !(await Bun.file(outputDir).exists())) {
      await Bun.$`mkdir -p ${outputDir}`.cwd(cwd);
    }

    const result = await Bun.$`bunx ${buildArgs}`.cwd(cwd);

    if (result.exitCode === 0) {
      console.log("✅ Tailwind CSS compiled successfully");

      // Log file sizes in development
      if (process.env.NODE_ENV === "development") {
        try {
          const outputFile = Bun.file(outputPath);
          if (await outputFile.exists()) {
            const stats = outputFile.size;
            console.log(`📊 Generated CSS size: ${(stats / 1024).toFixed(2)} KB`);
          }
        } catch (error) {
          // Ignore file size errors
        }
      }
    } else {
      throw new Error(`Tailwind compilation failed with exit code ${result.exitCode}`);
    }

  } catch (error) {
    console.error("❌ Failed to compile Tailwind CSS:", error);

    // In development, don't throw - just log the error
    if (process.env.NODE_ENV === "development") {
      console.log("🔄 Will retry on next file change...");
    } else {
      throw error;
    }
  }
}

/**
 * Create a custom Tailwind plugin with user-defined configuration
 */
export function createTailwindPlugin(userConfig: Partial<TailwindConfig> = {}): BunextPlugin {
  const config = { ...DEFAULT_CONFIG, ...userConfig };

  return {
    name: "tailwind-plugin",
    serverStart: {
      async dev() {
        await initializeTailwind(config);
      },
      async main() {
        // Main server start logic, if needed
        console.log("🌟 Tailwind CSS plugin initialized in main server mode");
        await compileTailwindCSS(config);
      }
    },

    before_build_main: async () => {
      if (process.env.NODE_ENV === "development") await compileTailwindCSS(config);
    },

    onFileSystemChange: async (filePath?: string) => {
      // Watch for Tailwind config changes and recompile
      if (filePath && config.configFiles?.some(configFile => filePath.includes(configFile))) {
        console.log("🎨 Tailwind config changed, recompiling...");
        await compileTailwindCSS(config);
      }
    }
  };
}

// Export both named and default exports for flexibility
export default tailwindPlugin;
