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
          age: "number",
          address: "string",
          name: {
            name: "string",
            lastName: "string",
          },
        },
      },
    ],
  },
];

export default MyDatabaseShema;
