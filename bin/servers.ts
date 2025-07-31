import "./globals.ts";
import { exitCodes, paths } from "../internal/globals";
import { getStartLog } from "../internal/server/logs.ts";


/**
 * Starts the development server with hot reloading
 */
export function startDevServer(): void {
    const serverProcess = Bun.spawn({
        cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`],
        stdout: "inherit",
        stderr: "inherit",
        env: {
            ...process.env,
            __HEAD_DATA__: JSON.stringify(globalThis.head),
            NODE_ENV: process.env.NODE_ENV,
        },
        onExit() {
            console.log("Development server restarting...");
            startDevServer();
        },
    });

    globalThis.processes.push(serverProcess);
}

/**
 * Starts the production server with automatic restart on certain exit codes
 */
export function startProductionServer(): void {
    const serverProcess = Bun.spawn({
        cmd: ["bun", `${paths.bunextDirName}/react-ssr/server.ts`, "production"],
        env: {
            ...process.env,
            __HEAD_DATA__: JSON.stringify(globalThis.head),
            NODE_ENV: "production",
        },
        stdout: "inherit",
        onExit(subprocess, exitCode, signalCode, error) {
            if (exitCode === exitCodes.runtime || exitCode === exitCodes.build) {
                console.log("Production server restarting due to runtime/build error...");
                startProductionServer();
            } else {
                console.log("Bunext server exited.");
                process.exit(exitCode || 0);
            }
        },
    });

    globalThis.processes.push(serverProcess);
}

/**
 * Handles the 'dev' command - starts development server with hot reloading
 */
export async function handleDev(): Promise<void> {
    try {
        process.env.NODE_ENV = "development";
        startDevServer();
    } catch (error) {
        throw new Error(`Failed to start development server: ${error}`);
    }
}

/**
 * Handles the 'production' command - starts production server
 */
export async function handleProduction(): Promise<void> {
    try {
        process.env.NODE_ENV = "production";
        console.log(getStartLog());
        startProductionServer();
    } catch (error) {
        throw new Error(`Failed to start production server: ${error}`);
    }
}