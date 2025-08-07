/**
 * Simple database setup with working autocomplete
 */

import type { _Users, SELECT_Users } from "./database_types";
import { SimpleTable } from "./simple-table";

export function SimpleDatabase() {
    return {
        Users: new SimpleTable<_Users, SELECT_Users>({ name: "Users" })
    } as const;
}
