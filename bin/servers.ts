import "./globals.ts";
import { paths } from "../internal/globals";
import { getStartLog } from "../internal/server/logs.ts";
import { OnServerClose } from "./onServerClose.ts";



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
 * Starts the development server with hot reloading
 */
function startDevServer(): void {
    const proc = Bun.spawnSync({
        cmd: ["bun", "--hot", `${paths.bunextDirName}/react-ssr/server.ts`],
        stdout: "inherit",
        env: {
            ...process.env,
            __HEAD_DATA__: JSON.stringify(globalThis.head),
            NODE_ENV: process.env.NODE_ENV,
        }
    });

    OnServerClose[proc.exitCode](proc);
}



/**
 * Starts the production server with automatic restart on certain exit codes
 */
export function startProductionServer(): void {
    console.log("Starting production server...");

    const serverProcess = Bun.spawnSync({
        cmd: ["bun", `${paths.bunextDirName}/react-ssr/server.ts`, "production"],
        env: {
            ...process.env,
            __HEAD_DATA__: JSON.stringify(globalThis.head),
            NODE_ENV: "production",
        },
        stdout: "inherit",
        stderr: "inherit",
    });

    OnServerClose[serverProcess.exitCode](serverProcess);

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