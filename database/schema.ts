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

type _TypeJson =
  | "number"
  | "string"
  | "Date"
  | "undefined"
  | "float"
  | "number";

type _DataTypeObject = {
  [key: string]: _TypeJson | _TypeJson[] | _DataType;
};

type _DataType =
  | _DataTypeObject
  | (_DataTypeObject & Array<_TypeJson>)
  | (_DataTypeObject & _TypeJson)
  | Array<_DataTypeObject | _TypeJson>;

type common = { name: string; nullable?: true; unique?: true; primary?: true };

export async function ConvertShemaToType(filePath: string) {
  const Schema = (await import(filePath)).default as DBSchema;
  let tables: string[] = [];
  const types = Schema.map((table) => {
    if (tables.includes(table.name))
      throw new Error(`Table name: ${table.name} is already taken`, {
        cause: "DUPLICATE_TABLE",
      });
    else tables.push(table.name);
    return `type _${table.name} = {\n${table.columns
      .map((column) => {
        let autoIncrement = false;
        let dataType = "";
        if (column.type === "number") {
          autoIncrement = column.autoIncrement ? true : false;
        }
        if (
          (column.nullable && column.primary) ||
          (column.nullable && autoIncrement)
        ) {
          throw new Error(
            `${table.name}.${column.name} cannot be nullable if it's a primary key or autoIncrement flag is set`,
            {
              cause: "NOT_NULL",
            }
          );
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
            dataType = dataTypeToType(column.DataType);
            break;
        }
        return `${column.name}${
          column.nullable && !autoIncrement && !column.primary ? "?" : ""
        }: ${dataType};`;
      })
      .join("\n")}\n};`;
  });

  return {
    tables: tables,
    types: types,
  };
}

function sqliteTypeToTypeScript(type: _TypeJson): _TypeJson | undefined {
  switch (type) {
    case "Date":
    case "number":
    case "string":
      return type;
    case "float":
      return "number";
    case "undefined":
      return undefined;
  }
}

function dataTypeToType(dataType: _DataType) {
  let returnString = "";
  if (Array.isArray(dataType)) {
    returnString += dataTypeArrayToType(dataType);
  } else {
    returnString += dataTypeObjectToType(dataType).text;
  }
  return returnString;
}
function dataTypeArrayToType(
  dataTypeArray: _TypeJson[] | Array<_DataTypeObject | _TypeJson>
) {
  let optional = false;
  let returnString = "";
  returnString += "Array<";
  returnString += dataTypeArray
    .map((d) => {
      if (typeof d === "string") return sqliteTypeToTypeScript(d);
      else {
        const data = dataTypeObjectToType(d);
        return data.text;
      }
    })
    .filter((d) => {
      if (typeof d != "undefined") return true;
      optional = true;
      return false;
    })
    .join(" | ");
  returnString += ">";
  return {
    text: returnString,
    optional,
  };
}
function dataTypeObjectToType(dataTypeObject: {
  [key: string]: _DataType | _TypeJson | _TypeJson[];
}) {
  let returnString = "";
  returnString += "{";

  returnString += Object.keys(dataTypeObject)
    .map((d) => {
      const dType = dataTypeObject[d as keyof _DataType];
      if (Array.isArray(dType)) {
        const parsed = dataTypeArrayToType(dType);
        return `${d}${parsed.optional ? "?" : ""}: ${parsed.text}`;
      } else if (typeof dType === "string") {
        return `${d}: ${dType}`;
      } else {
        const parsed = dataTypeObjectToType(dType as _DataTypeObject);
        return `${d}: ${parsed.text}`;
      }
    })
    .join(", ");

  returnString += "}";
  return {
    text: returnString,
    optional: false,
  };
}
