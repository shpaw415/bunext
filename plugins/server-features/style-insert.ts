import { generateRandomString, normalize } from "features/utils";
import { RequestManager, router } from "internal/server/router";
import type { _GlobalData } from "internal/types";



export async function getRelatedCssContent(manager: RequestManager): Promise<string> {
    const cssPaths = await router.getCssPaths(true);

    if (process.env.NODE_ENV === "development") {
        return (await Promise.all(cssPaths.map(path => Bun.file(router.buildDir + path).text()))).join("\n");
    }
    const files = GetCssPathsFromPathname(manager.pathname, cssPaths, {
        layoutRoutes: router.layoutPaths,
        pagesDir: router.pageDir
    });
    return (await Promise.all(files.map(path => Bun.file(router.buildDir + path).text()))).join("\n");

}
const CSS_CACHE_MAX_SIZE = 100 as const;
const cssPathCache = new Map<string, string[]>();

/**
 * Extracts CSS paths for a given pathname from available CSS paths
 * @param pathname - The route pathname (e.g., "/users", "/")
 * @param availableCssPaths - Array of all available CSS file paths
 * @param options - Configuration options
 * @returns Array of relevant CSS paths for the given pathname
 */
export function GetCssPathsFromPathname(
    pathname: string,
    availableCssPaths: string[],
    options?: {
        onlyFilePath?: boolean;
        layoutRoutes?: string[];
        pagesDir?: string;
    }
): string[] {
    if (!pathname || !availableCssPaths || availableCssPaths.length === 0) {
        return [];
    }

    // Create cache key
    const cacheKey = `${pathname}-${availableCssPaths.length}-${JSON.stringify(options)}`;

    // Check cache first
    if (cssPathCache.has(cacheKey)) {
        return cssPathCache.get(cacheKey)!;
    }

    const layoutRoutes = options?.layoutRoutes || [];
    const pagesDir = options?.pagesDir || '';

    let currentPath = "/";
    const cssPaths: Array<string> = [];
    const formattedPath = pathname === "/" ? [""] : pathname.split("/");

    // Process layout CSS files for each path segment
    for (const pathSegment of formattedPath) {
        currentPath += pathSegment.length > 0 ? pathSegment : "";

        if (layoutRoutes.includes(currentPath)) {
            const normalizedPath = normalize(
                `/${pagesDir}${currentPath}/layout.css`
            );

            if (availableCssPaths.includes(normalizedPath)) {
                cssPaths.push(
                    normalizedPath + (options?.onlyFilePath ? "" : setParamOnDevMode())
                );
            }
        }

        if (pathSegment.length > 0) currentPath += "/";
    }

    // Process page-specific CSS file
    // Convert pathname to potential CSS file path
    let pageSpecificCssPath: string;

    if (pathname === "/") {
        pageSpecificCssPath = normalize(`/${pagesDir}/index.css`);
    } else {
        // Handle both directory and file-based routing
        const cleanPath = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
        pageSpecificCssPath = normalize(`/${pagesDir}${cleanPath}.css`);

        // Also check for index.css in the directory
        const indexCssPath = normalize(`/${pagesDir}${cleanPath}/index.css`);
        if (availableCssPaths.includes(indexCssPath)) {
            cssPaths.push(
                indexCssPath + (options?.onlyFilePath ? "" : setParamOnDevMode())
            );
        }
    }

    if (availableCssPaths.includes(pageSpecificCssPath)) {
        cssPaths.push(
            normalize(
                `${pageSpecificCssPath}${options?.onlyFilePath ? "" : setParamOnDevMode()}`
            )
        );
    }

    // Cache the result with size limit
    if (cssPathCache.size >= CSS_CACHE_MAX_SIZE) {
        const firstKey = cssPathCache.keys().next().value;
        if (firstKey) {
            cssPathCache.delete(firstKey);
        }
    }
    cssPathCache.set(cacheKey, cssPaths);

    return cssPaths;
}

function setParamOnDevMode(): string {
    if (process.env.NODE_ENV === "development") {
        return `?${generateRandomString(5)}`;
    }
    return "";
}
