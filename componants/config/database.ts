import type { DBSchema } from "@bunpmjs/bunext/database/schema";

const MyDatabaseShema: DBSchema = [
  {
    name: "Users",
    columns: [
      {
        name: "id",
        type: "number",
        unique: true,
        autoIncrement: true,
        primary: true,
      },
      {
        name: "username",
        unique: true,
        type: "string",
      },
      {
        name: "password",
        type: "string",
      },
      {
        name: "data",
        type: "json",
        nullable: true,
        DataType: {
          name: {
            firstName: "string",
            lastName: "string",
            birtDate: "Date",
          },
        },
      },
    ],
  },
  {
    name: "purchase",
    columns: [
      {
        name: "id",
        primary: true,
        type: "number",
        autoIncrement: true,
      },
      {
        name: "price",
        type: "float",
      },
      {
        name: "quantity",
        type: "number",
      },
    ],
  },
];

export default MyDatabaseShema;
