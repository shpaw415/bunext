"server only";

import type { RequestManager } from "./router";

export default class PageManager {
    private readonly manager: RequestManager;

    constructor(manager: RequestManager) {
        this.manager = manager;
    }


}