import type { MatchedRoute } from "bun";


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