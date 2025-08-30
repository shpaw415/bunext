import { useRequest } from "features/request/hooks";
import { useCallback, useContext, useEffect, useMemo } from "react";
import { HeadContext } from "./provider";
import type { ContextType, HeadData, PreBuildContextType } from "./types";
import { safeMerge, validateHeadData } from "./utils";
import type { BunextRequest } from "public/request";
import { usePathname, useReloadEffect } from "internal/router";
import { usePluginContext } from "public/plugins";


function injectHeadData(data: HeadData, request: BunextRequest<ContextType>) {
    const currentData = request.getContext()?.__HEAD_DATA__ || {};
    request.setContext({
        __HEAD_DATA__: safeMerge(currentData, data)
    });
}


/**
 * Hook for managing head data within components
 * @param data - Default head data to set
 * @returns updater function for updating head data
 */
export function useHead({ data }: { data?: HeadData } = {}) {
    const [updater, path] = useContext(HeadContext);
    const request = useRequest();
    const pluginContext = usePluginContext<PreBuildContextType>();
    const currentRoute = usePathname();
    // Validate data if provided
    const validatedData = useMemo(() => {
        if (data && !validateHeadData(data)) {
            console.warn('[Bunext Head] Invalid head data provided to useHead:', data);
            return undefined;
        }
        return data;
    }, [data]);

    // Set head data on server-side request if available
    if (request && validatedData) {
        try {
            injectHeadData(validatedData, request);

        } catch (error) {
            console.error('[Bunext Head] Error setting head data on request:', error);
        }
    }
    if (typeof window == "undefined" && validatedData) {
        pluginContext?.__HEAD_DATA__.set(validatedData);
    }

    // Update head data on client-side
    useEffect(() => {
        if (validatedData) {
            try {
                updater(validatedData);
            } catch (error) {
                console.error('[Bunext Head] Error updating head data:', error);
            }
        }
    }, [validatedData, updater]);

    // Return a safe updater function
    const safeUpdater = useCallback((newData: HeadData) => {
        if (!validateHeadData(newData)) {
            console.warn('[Bunext Head] Invalid head data provided to updater:', newData);
            return;
        }

        try {
            updater(newData);
        } catch (error) {
            console.error('[Bunext Head] Error in head updater:', error);
        }
    }, [updater]);

    useEffect(() => {
        validatedData && updater(validatedData);
    }, [currentRoute]);

    return safeUpdater;
}