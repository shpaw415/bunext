export type DBSchema = TableSchema[];

export interface TableSchema {
  name: string;
  columns: ColumnsSchema[];
}

export type ColumnsSchema =
  | ({
      type: "number";
      autoIncrement?: true;
      default?: number;
    } & common)
  | ({
      type: "string";
      default?: string;
    } & common)
  | ({
      type: "Date";
      default?: Date;
    } & common)
  | ({
      type: "json";
      default?: any;
      DataType: _DataType;
    } & common)
  | ({
      type: "float";
      default?: number;
    } & common);

type _Type = "number" | "string" | "Date" | "json" | "float";
type _DataType = { [key: string]: _DataType | _Type } | _Type[] | _DataType[];

type common = { name: string; nullable?: true; unique?: true; primary?: true };

export async function ConvertShemaToType(filePath: string) {
  const Schema = (await import(filePath)).default as DBSchema;
  console.log(Schema);
  const types = Schema.map((table) => {
    return `type _${table.name} = { ${table.columns
      .map((column) => {
        let autoIncrement = false;
        let dataType = "";
        if (column.type === "number") {
          autoIncrement = column.autoIncrement ? true : false;
        }
        switch (column.type) {
          case "string":
          case "Date":
          case "number":
            dataType = column.type;
            break;
          case "float":
            dataType = "number";
            break;
          case "json":
            dataType = "object";
            break;
        }
        return `${column.name}${
          column.nullable || autoIncrement ? "?" : ""
        }: ${dataType};`;
      })
      .join("\n")}\n};`;
  });

  console.log(types);
}

function TableToType(table: TableSchema) {}

function ColumnToType(column: ColumnsSchema) {}
