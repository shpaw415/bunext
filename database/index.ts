("<Bunext_TypeImposts>");
("<Bunext_TypeImposts>");

export async function Database() {
  if (typeof window !== "undefined")
    throw new Error(`you cannot call database in a Client Context`);
  const Table = (await import("./class")).Table;
  ("<Bunext_DBExport>");
  ("<Bunext_DBExport>");
}
