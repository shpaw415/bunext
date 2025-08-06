import type { HeadData } from "../../features/head";


export type JsxToStringWorkerMessage = {
    type: "jsxToString";
    jsx: string;
    head: Record<string, HeadData>;
} | {
    type: "error";
    error: Error;
    message: string;
};