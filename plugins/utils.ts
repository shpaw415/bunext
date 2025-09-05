import cluster, { type Cluster } from "node:cluster";

export type Directives = "use-client" | "use-server" | "use-static" | "server-only";

type DirectiveEntry = { path: string, route?: string };

export class DirectiveTool {
    private entries: Map<Directives, Array<DirectiveEntry>> = new Map<Directives, Array<DirectiveEntry>>();
    private directiveToRegex: Map<Directives, RegExp> = new Map();
    private filePaths: string[] = [];

    constructor() {
        // Improved regex patterns to match directives at the beginning of the file
        // Supports both hyphen and space formats (e.g., "use-client" or "use client")
        // Allows for optional whitespace, comments, and flexible quote styles
        this.directiveToRegex.set("use-client", /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]client['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m);
        this.directiveToRegex.set("use-server", /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]server['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m);
        this.directiveToRegex.set("use-static", /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]use[-\s]static['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m);
        this.directiveToRegex.set("server-only", /^(?:\s*(?:\/\/.*?\n|\s)*)?['"]server[-\s]only['"];?\s*(?:\/\/.*)?(?:\r?\n|$)/m);

    }

    static async getInstance(init?: Array<DirectiveEntry>) {
        const instance = new DirectiveTool();
        if (init) {
            await Promise.all(init.map(entry => instance.addEntry(entry.path, entry.route)));
        }
        return instance;
    }

    /**
     * Check if a file path is associated with a specific directive.
     * @param directive The directive to check against.
     * @param filePath The file path to check.
     * @param route Optional route information.
     * @returns True if the file path is associated with the directive, false otherwise.
     */
    public async pathIs(directive: Directives, filePath: string, route?: string): Promise<boolean> {
        if (!this.filePaths.includes(filePath)) return ((await this.addEntry(filePath, route)) == directive);
        return this.entries.get(directive)?.some((entry) => entry.path === filePath) ?? false;
    }

    public getFromDirective(directive: Directives): Array<DirectiveEntry> {
        return this.entries.get(directive) || [];
    }
    /**
     * Get the directive associated with a specific route.
     * @param route The route to check.
     * @returns The directive associated with the route, or null if none found.
     */
    public getDirectiveFromRoute(route: string): Directives | null {
        for (const [directive, entries] of this.entries) {
            if (entries.some(entry => entry.route === route)) {
                return directive;
            }
        }
        return null;
    }
    /**
     * Get the directive associated with a specific file path.
     * @param filePath The file path to check.
     * @returns The directive associated with the file path, or null if none found.
     */
    public getDirectiveFromFilePath(filePath: string) {
        for (const [directive, entries] of this.entries) {
            if (entries.some(entry => entry.path === filePath)) {
                return directive;
            }
        }
        return null;
    }

    /**
     * Add a new entry for a file path and its associated route.
     * @param filePath The file path to add.
     * @param route The route associated with the file path.
     * @returns The directive associated with the file path, default: use-server
     */
    public async addEntry(filePath: string, route?: string) {
        if (this.filePaths.includes(filePath)) return this.getDirectiveFromFilePath(filePath) as Directives;
        const directive = await this.detectDirective(filePath);
        if (!this.entries.has(directive)) {
            this.entries.set(directive, []);
        }
        this.entries.get(directive)?.push({ path: filePath, route });
        this.filePaths.push(filePath);
        return directive;
    }

    private async detectDirective(filePath: string): Promise<Directives> {
        const fileContent = await Bun.file(filePath).text();
        // Trim leading whitespace to check if directive is at the very beginning
        const trimmedContent = fileContent.trimStart();

        for (const [directive, regex] of this.directiveToRegex) {
            if (regex.test(trimmedContent)) {
                return directive;
            }
        }
        return "use-server";
    }

}



type IPCProcesses = {
    builder: Bun.Subprocess<"ignore", "inherit", "inherit"> | null;
    clusters: Array<Cluster["worker"]> | null;
};

type IPCProcessType = "builder" | "cluster" | "main";
type IPCManagerOptions = {
    type: IPCProcessType;
};

type IPCMessageFormat<T extends unknown> = {
    from: IPCProcessType;
    to: IPCProcessType;
    id: string;
    data: T
};

export type ClientIPCManager<T extends IPCProcessType> = Omit<
    IPCManager<T>,
    "processes" |
    "initMain" |
    "initSubProcesses" |
    "__DISPATCH__" |
    "__VERIFY_MESSAGE_FORMAT__" |
    "call" |
    "setBuilderProcess" |
    "setClusterProcesses" |
    "getInstanceForCurrentProcess"
>;

declare global {
    var IPCManagerMain: IPCManager<"main">;
    var IPCManagerBuilder: IPCManager<"builder">;
    var IPCManagerCluster: IPCManager<"cluster">;
}

export class IPCManager<ProcessType extends IPCProcessType = IPCProcessType> {
    public type: ProcessType = "main" as ProcessType;
    private onMessageCallbacks: Map<string, (message: any, from: IPCProcessType) => void> = new Map();

    private processes: IPCProcesses = {
        builder: null,
        clusters: null,
    };
    private isBuilderInited: boolean = false;
    private isClusterInited: boolean = false;
    private queuedMessages: Array<IPCMessageFormat<unknown>> = [];

    constructor({ type }: IPCManagerOptions) {
        this.type = type as ProcessType;
        if (type !== "main") this.initSubProcesses();
        else this.initMain();
    }

    private initMain() {
        cluster.on("message", async (worker, _message) => {
            this.__DISPATCH__(_message);
        });
    }

    private initSubProcesses() {
        process.on("message", (message) => {
            const messageObj = message as IPCMessageFormat<unknown>;
            this.__DISPATCH__(messageObj);
        });
    }

    public setBuilderProcess(builder: Bun.Subprocess<"ignore", "inherit", "inherit"> | null) {
        this.processes.builder = builder;
        this.isBuilderInited = true;
        this.queuedMessages.filter(msg => msg.to === "builder").forEach(msg => this.__DISPATCH__(msg));
        this.queuedMessages = this.queuedMessages.filter(msg => msg.to !== "builder");
    }
    public setClusterProcesses(clusters: Array<Cluster["worker"]>) {
        this.processes.clusters = clusters;
        this.isClusterInited = true;
        this.queuedMessages.filter(msg => msg.to === "cluster").forEach(msg => this.__DISPATCH__(msg));
        this.queuedMessages = this.queuedMessages.filter(msg => msg.to !== "cluster");
    }

    public static getInstanceForCurrentProcess() {
        if (cluster.isWorker) {
            return IPCManager.getInstanceForCluster();
        } else if (globalThis.__IS_BUILDER_WORKER__) {
            return IPCManager.getInstanceForBuilder();
        } else {
            return IPCManager.getInstanceForMain();
        }
    }

    public static getInstanceForMain() {
        globalThis.IPCManagerMain ??= new IPCManager<"main">({ type: "main" });
        return globalThis.IPCManagerMain;
    }
    /**
     * Get the singleton instance of IPCManager for builder process.
     * @returns The singleton instance of IPCManager for builder process.
     * 
     * **process.on("message", ...) is already handled in initSubProcesses**
     */
    public static getInstanceForBuilder() {
        globalThis.IPCManagerBuilder ??= new IPCManager<"builder">({ type: "builder" });
        return globalThis.IPCManagerBuilder;
    }
    /**
     * Get the singleton instance of IPCManager for cluster processes.
     * @returns The singleton instance of IPCManager for cluster processes.
     * 
     * **process.on("message", ...) is already handled in initSubProcesses**
     */
    public static getInstanceForCluster() {
        globalThis.IPCManagerCluster ??= new IPCManager<"cluster">({ type: "cluster" });
        return globalThis.IPCManagerCluster;
    }
    public send<T extends unknown>(to: IPCProcessType, id: string, data: T) {
        if (!this.isBuilderInited && to === "builder" || !this.isClusterInited && to === "cluster") {
            this.queuedMessages.push({ from: this.type, to, id, data });
            return;
        }
        if (this.type === to) {
            console.warn(`IPCManager: Attempting to send a message to the same process type (${to}). Message ignored.`);
            return;
        }
        const message: IPCMessageFormat<T> = {
            from: this.type,
            to: to as IPCProcessType,
            id,
            data
        };
        this.__DISPATCH__(message);
    }
    public onMessage<T extends unknown>(id: string, callback: (message: T, from: IPCProcessType) => void) {
        this.onMessageCallbacks.set(id, callback);
    }
    /**
     * Dispatch a message to the appropriate process.
     * @param message Message received from another process
     *
     * **Note: This method is intended for internal use only and should not be called directly.**
     */
    public __DISPATCH__(message: IPCMessageFormat<unknown>) {
        if (!this.__VERIFY_MESSAGE_FORMAT__(message)) {
            console.warn(`IPCManager: Invalid message format:\n`, message);
            return;
        }
        if (this.type === message.to) {
            this.call(message.id, message);
        } else if (this.type !== "main") {
            process.send?.(message);
        } else if (message.to == "builder") {
            if (this.processes.builder === null) {
                console.warn("IPCManager: Builder process is not initialized. Message ignored.");
                return;
            }
            this.processes.builder.send(message);
        } else if (message.to == "cluster") {
            if (this.processes.clusters === null) {
                console.warn("IPCManager: Cluster processes are not initialized. Message ignored.");
                return;
            }
            this.processes.clusters.forEach((cluster) => {
                cluster?.send(message);
            });
        } else {
            console.warn(`IPCManager: Message intended for ${message.to} received by ${this.type}. Message ignored.`);
        }
    }
    /**
     * Verify the format of an IPC message.
     * @param message Message to verify
     * @returns This instance if the message format is valid, otherwise undefined.
     */
    private __VERIFY_MESSAGE_FORMAT__(message: unknown): boolean {
        if (message && typeof message === "object" && "from" in message && "to" in message && "id" in message && "data" in message) {
            return true;
        } else {
            return false;
        }
    }
    private call(id: string, message: IPCMessageFormat<unknown>) {
        this.onMessageCallbacks.get(id)?.(message.data, message.from);
    }

}