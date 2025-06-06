"use client";
("<Bunext_TypeImposts>");
import type { _Users, SELECT_Users, _purchase, SELECT_purchase } from "./database_types.ts";
("<Bunext_TypeImposts>");

import { Table } from "./class";

export function Database() {
  if (typeof window !== "undefined")
    throw new Error(`you cannot call database in a Client Context`);
  ("<Bunext_DBExport>");
  return {
    Users: new Table<_Users, SELECT_Users>({ name: "Users" }),
    purchase: new Table<_purchase, SELECT_purchase>({ name: "purchase" })
  } as const;
  ("<Bunext_DBExport>");
}
