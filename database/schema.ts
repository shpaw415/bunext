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
    /**  */
    union?: number[];
  } & common)
  | ({
    type: "string";
    default?: string;
    /**  */
    union?: string[];
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
    /**  */
    union?: number[];
  } & common)
  | ({
    type: "boolean";
    default?: boolean;
  } & common);

type _TypeJson = "number" | "string" | "undefined" | "float" | "boolean";

type _DataTypeObject = {
  [key: string]: _TypeJson | _TypeJson[] | _DataType;
};

export type _DataType =
  | _DataTypeObject
  | (_DataTypeObject & Array<_TypeJson>)
  | (_DataTypeObject & _TypeJson)
  | Array<_DataTypeObject | _TypeJson>
  | ReservedType;


type ReservedType = {
  "!union_type!": string[];
  "!intersection_type!": string[];
};
const ReservedTypeKeys = ["!union_type!"];


type common = { name: string; nullable?: true; unique?: true; primary?: true };



export function ConvertShemaToType(Schema: DBSchema) {
  let tables: string[] = [];
  const types = Schema.map((table) => {
    if (tables.includes(table.name))
      throw new Error(`Table name: ${table.name} is already taken`, {
        cause: "DUPLICATE_TABLE",
      });
    else tables.push(table.name);
    return `type _${table.name} = {\n${table.columns
      .map((column) => ColumnsSchemaToType(column, true))
      .join("\n")}\n};`;
  });
  const typesWithDefaultAsRequired = Schema.map((table) => `type SELECT_${table.name} = {\n${table.columns
    .map((column) => ColumnsSchemaToType(column, false))
    .join("\n")}\n};`);

  return {
    tables,
    types,
    typesWithDefaultAsRequired
  };
}
/** create a union  */
export function Union(...type: string[]): ReservedType {
  return { "!union_type!": type } as ReservedType;
}
export function Intersection(...type: string[]): ReservedType {
  return { "!intersection_type!": type } as ReservedType;
}

function ColumnsSchemaToType(column: ColumnsSchema, defaultAsOptional: boolean) {
  let autoIncrement = false;
  let dataType = "";
  if (column.type == "number") {
    autoIncrement = column.autoIncrement ? true : false;
  }
  switch (column.type) {
    case "string":
      if (column?.union) dataType = column.union.map((e) => `"${e}"`).join(" | ");
      else dataType = column.type;
      break;
    case "number":
      if (column?.union) dataType = column.union.map((e) => `"${e}"`).join(" | ");
      else dataType = column.type;
      break;
    case "Date":
    case "boolean":
      dataType = column.type;
      break;
    case "float":
      if (column?.union) dataType = column.union.map((e) => `"${e}"`).join(" | ");
      else dataType = "number";
      break;
    case "json":
      dataType = dataTypeToType(column.DataType);
      break;
  }
  return `"${column.name}"${column.nullable || autoIncrement || (column?.default && defaultAsOptional) ? "?" : ""
    }: ${dataType};`;
}

function sqliteTypeToTypeScript(type: _TypeJson): _TypeJson | undefined {
  switch (type) {
    case "number":
    case "string":
    case "boolean":
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
    returnString += dataTypeArrayToType(dataType).text;
  } else {
    returnString += dataTypeObjectToType(dataType as _DataTypeObject).text;
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
      if (typeof d == "string") return sqliteTypeToTypeScript(d);
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
    .join(" & ");
  returnString += ">";
  return {
    text: returnString,
    optional,
  };
}

type DataTypeObjectTypeParams = {
  [key: string]: _DataType | _TypeJson | _TypeJson[];
};

function dataTypeObjectToType(dataTypeObject: DataTypeObjectTypeParams) {

  const isInReservedMode = ReservedTypeKeys.includes(Object.keys(dataTypeObject).at(0) || "");
  let returnString = "";

  returnString += (Object.keys(dataTypeObject) as Array<keyof _DataType>)
    .map((d) => {
      const dType = dataTypeObject[d];

      if (isInReservedMode) {
        switch (d as keyof ReservedType) {
          case "!union_type!":
            return DatatypeToUnion(dType as string[]);
          case "!intersection_type!":
            return DataTypeToIntersection(dType as string[]);
        }
      } else if (Array.isArray(dType)) {
        const parsed = dataTypeArrayToType(dType as _TypeJson[]);
        return `"${d}"${parsed.optional ? "?" : ""}: ${parsed.text}`;
      } else if (typeof dType == "string") {
        return `"${d}": ${sqliteTypeToTypeScript(dType)}`;
      } else {
        const parsed = dataTypeObjectToType(dType as _DataTypeObject);
        return `"${d}": ${parsed.text}`;
      }
    })
    .join(", ");

  if (!isInReservedMode) returnString = `{ ${returnString} }`;
  return {
    text: returnString,
    optional: false,
  };
}

function DatatypeToUnion(types: Array<string | number>) {
  return `( ${types.map((type) => `"${type}"`).join(" | ")} )`;
}
function DataTypeToIntersection(types: Array<string | number>) {
  return `( ${types.map((type) => `"${type}"`).join(" & ")} )`
}