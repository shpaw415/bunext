"use client";
import type { PreBuildContextDefaultValues } from "plugins/types";
import { createContext, useContext, type JSX } from "react";


export const PreLoadSSRContext = createContext<Record<string, unknown> | undefined>(undefined);

/**
 * Hook to access the plugin context
 *
 * **this will be undefined anywhere outside the pre-build process**
 *
 */
export function usePluginContext<T extends Record<string, unknown> = {}>() {
    return useContext(PreLoadSSRContext) as T & PreBuildContextDefaultValues | undefined;
}

export async function Wrapper(ToCall: () => Promise<JSX.Element>, ContextValue: Record<string, unknown>) {
    return <PreLoadSSRContext.Provider value={ContextValue}>{await ToCall()}</PreLoadSSRContext.Provider>;
}