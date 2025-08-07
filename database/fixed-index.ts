/**
 * Fixed database with working autocomplete
 */

import type { _Users, SELECT_Users } from "./database_types";
import { FixedTable } from "./fixed-table";

export function FixedDatabase() {
    return {
        Users: new FixedTable<_Users, SELECT_Users>({ name: "Users", debug: true })
    } as const;
}
