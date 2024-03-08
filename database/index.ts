import { Table } from "./class";
("<Bunext_TypeImposts>");
import type { _Users, _purchase, _test } from "./database_types.ts";
("<Bunext_TypeImposts>");

("<Bunext_DBExport>");
export const database = {
 Users: new Table<_Users>({ name: "Users" }),
 purchase: new Table<_purchase>({ name: "purchase" }),
 test: new Table<_test>({ name: "test" }) 
} as const;
("<Bunext_DBExport>");
