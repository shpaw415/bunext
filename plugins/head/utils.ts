"use client";
import type { HeadData } from "./types";

export function deepMerge(obj: HeadData, assign: HeadData): HeadData {
    const copy = structuredClone(obj || {});
    for (const key of Object.keys(assign || {}) as Array<keyof HeadData>) {
        switch (key) {
            case "author":
            case "publisher":
            case "title":
                copy[key] = assign[key];
                break;
            case "link":
            case "meta":
                if (copy[key]) copy[key].push(...(assign[key] as any));
                else copy[key] = assign[key] as any;
                break;
        }
    }
    return copy;
}

/**
   * Validates head data structure
   */
export function validateHeadData(data: any): data is HeadData {
    if (!data || typeof data !== 'object') return false;

    const validKeys = ['title', 'author', 'publisher', 'meta', 'link'];
    const dataKeys = Object.keys(data);

    return dataKeys.every(key => validKeys.includes(key));
}

/**
 * Safely merges multiple head data objects
 */
export function safeMerge(...headDataArray: (HeadData | undefined)[]): HeadData {
    return headDataArray.reduce<HeadData>((acc, data) => {
        if (data && validateHeadData(data)) {
            return deepMerge(acc, data);
        }
        return acc;
    }, {});
}

export function removeDuplicate(data: HeadData): HeadData {
    const seenMeta = new Set<string>();
    const seenLink = new Set<string>();

    const filteredMeta = data.meta?.filter((meta) => {
        const key = JSON.stringify(meta);
        if (seenMeta.has(key)) {
            return false;
        }
        seenMeta.add(key);
        return true;
    });

    const filteredLink = data.link?.filter((link) => {
        const key = JSON.stringify(link);
        if (seenLink.has(key)) {
            return false;
        }
        seenLink.add(key);
        return true;
    });

    return {
        ...data,
        meta: filteredMeta,
        link: filteredLink,
    };
}

export class PreBuildContext {
    head: HeadData | undefined;
    set(data: HeadData) {
        this.head = removeDuplicate(safeMerge(this.head, data));
    }
};