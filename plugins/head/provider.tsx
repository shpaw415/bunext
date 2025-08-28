import type { HeadData } from "public/head";
import { match, usePathname, useReloadEffect } from "internal/router";
import { router } from "internal/server/router";
import type { _globalThis } from "internal/types";
import { Component, createContext, useCallback, useContext, useEffect, useMemo, useState, type ErrorInfo } from "react";
import type { headProviderType } from "./types";
import { removeDuplicate, safeMerge } from "./utils";
import { GetCssPathsFromPathname } from "plugins/server-features/style-insert";




/**
 * Error boundary for head management system
 */
class HeadErrorBoundary extends Component<
    { children: React.ReactNode; fallback?: React.ReactNode },
    { hasError: boolean; error?: Error }
> {
    constructor(props: { children: React.ReactNode; fallback?: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: Error) {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[Bunext Head] Error in head management:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback || (
                <head suppressHydrationWarning>
                    <title>Error - Bunext</title>
                    <meta name="description" content="An error occurred while loading page metadata" />
                </head>
            );
        }

        return this.props.children;
    }
}

export const HeadContext = createContext<headProviderType>([() => { }, "/"]);

export function HeadProvider({
    children,
}: {
    children: React.ReactNode;
}) {
    const [data, setData] = useState<HeadData>(globalThis.__HEAD_DATA__);
    const [pendingData, setPendingData] = useState<HeadData>(globalThis.__HEAD_DATA__);
    const currentPath = usePathname();
    useEffect(() => {
        setPendingData((current) => {
            console.log({ current });
            setData(removeDuplicate(current));
            return {};
        })
    }, [currentPath]);

    // Clean up query parameters from the path
    const cleanPath = useMemo(() => currentPath.split("?")[0], [currentPath]);
    const pathname = useMemo(() => match(cleanPath)?.path as string, [cleanPath]);

    const path = useMemo(() => {
        try {
            if (typeof window !== "undefined") {
                return match(cleanPath)?.path;
            } else {
                return router.server?.match(cleanPath)?.name;
            }
        } catch (error) {
            console.error('[Bunext Head] Error matching path:', cleanPath, error);
            return undefined;
        }
    }, [cleanPath]);

    // Memoized CSS paths to avoid recalculation
    const cssPaths = useMemo(() => {
        try {
            return globalThis.__CSS_PATHS__ ? globalThis.__CSS_PATHS__ : [];
        } catch (error) {
            console.error('[Bunext Head] Error getting CSS paths:', error);
            return [];
        }
    }, [cleanPath]);

    const styles = useMemo(() => GetCssPathsFromPathname(
        pathname,
        cssPaths,
        {
            layoutRoutes: globalThis.__LAYOUT_ROUTE__,
            pagesDir: globalThis.__PAGES_DIR__
        }).map((link) => ({
            rel: "stylesheet",
            href: link,
        })), [pathname]);

    if (!path) {
        throw new Error(`[Bunext Head] Route not found: ${cleanPath}`);
    }

    const providerData: headProviderType = useMemo(
        () => [(data: HeadData) => setPendingData((current_data) => {
            console.log("providerData", { current_data, data });
            return safeMerge(current_data, data);
        }), path],
        [setPendingData, path]
    );
    return (
        <HeadErrorBoundary>
            <HeadElement
                data={data}
                style={styles}
            />
            <HeadContext.Provider value={providerData}>
                {children}
            </HeadContext.Provider>
        </HeadErrorBoundary>
    );
}


function HeadElement({
    data,
    style,
}: {
    data: HeadData;
    style: HeadData["link"];
}) {
    const [clearSSRStyle, setClearSSRStyle] = useState(false);
    const [loadedLinksCount, setLoadedLinksCount] = useState(0);
    const totalLinksCount = useMemo(() => (style?.length || 0), []);

    // Clear SSR styles when all links are loaded
    useEffect(() => {
        if (totalLinksCount > 0 && loadedLinksCount >= totalLinksCount && !clearSSRStyle) {
            setClearSSRStyle(true);
        }
    }, [loadedLinksCount]);

    const handleLinkLoad = useCallback(() => {
        setLoadedLinksCount(prev => prev + 1);
    }, []);

    const clearSSRStyleElements = useCallback(() => {
        const styles = document.querySelector(".bunext-ssr-style");
        styles?.remove();
    }, []);

    // Clear SSR styles when clearSSRStyle becomes true
    useEffect(() => {
        clearSSRStyle && clearSSRStyleElements();
    }, [clearSSRStyle]);

    return (
        <head suppressHydrationWarning>
            {data?.title && <title>{data.title}</title>}
            {data?.author && <meta name="author" content={data.author} />}
            {data?.publisher && <meta name="publisher" content={data.publisher} />}
            {data?.meta?.map((e, index) => (
                <meta key={index} {...e} />
            ))}
            {data?.link?.map((e, index) => (
                <link key={index} {...e} />
            ))}
            {typeof window !== "undefined" &&
                style?.map((props, i) => <link key={i} rel="stylesheet" onLoad={handleLinkLoad} {...props} />)}
        </head>
    );
}