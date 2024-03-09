("<Bunext_TypeImposts>");
import type { _Users } from "./database_types.ts";
("<Bunext_TypeImposts>");

export async function Database() {
  if (typeof window !== "undefined")
    throw new Error(`you cannot call database in a Client Context`);
  const Table = (await import("./class")).Table;
  ("<Bunext_DBExport>");
return {
 Users: new Table<_Users>({ name: "Users" }) 
} as const;
("<Bunext_DBExport>");
}
