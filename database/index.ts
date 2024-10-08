"use client";
("<Bunext_TypeImposts>");
import type { _Users, _purchase } from "./database_types.ts";
("<Bunext_TypeImposts>");

import { Table } from "./class";

export function Database() {
  if (typeof window !== "undefined")
    throw new Error(`you cannot call database in a Client Context`);
  ("<Bunext_DBExport>");
  return {
    Users: new Table<_Users>({ name: "Users" }),
    purchase: new Table<_purchase>({ name: "purchase" }),
  } as const;
  ("<Bunext_DBExport>");
}
