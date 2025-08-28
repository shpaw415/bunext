
export type JsxToStringWorkerMessage = {
    type: "jsxToString";
    jsx: string;
} | {
    type: keyof typeof console;
    message: Array<any>;
};