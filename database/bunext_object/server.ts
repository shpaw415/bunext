"server only";

import { type Database } from "./types";
import { Database as db } from "..";




let BunextDatabase: Database;
try {
    BunextDatabase = db();
} catch (error) {
    BunextDatabase = {
        __BUNEXT_DATABASE_NOT_DEFINED: "database/bunext_object/server.ts"
    } as any;
}

export default BunextDatabase;
