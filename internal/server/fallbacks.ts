import { SEPARATOR_REGEX } from "internal/utils";
import type { RequestManager } from "./router";
import type { JSX } from "react";
import type { ErrorFallbackComponent } from "internal/types";
import { ErrorFallback } from "components/fallback";
import { normalize } from "path";

export class fallBackComponents {

    static async getErrorFallbackComponent(manager: RequestManager, e: Error): Promise<JSX.Element> {

        const fileNameArray = manager.serverSide?.filePath.split(SEPARATOR_REGEX);
        fileNameArray?.pop();
        fileNameArray?.push("error.tsx");
        const errorFilePath = normalize(fileNameArray?.join("/") || "");
        if (await Bun.file(errorFilePath).exists()) {
            const errorModule = await import(errorFilePath) as { default: ErrorFallbackComponent };
            if (errorModule?.default) {
                return await errorModule.default({ error: e, requestManager: manager });
            }
        }
        return ErrorFallback({ error: e }) as JSX.Element;
    }
}