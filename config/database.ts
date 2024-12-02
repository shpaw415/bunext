import type { DBSchema } from "@bunpmjs/bunext/database/schema";
import { Union } from "@bunpmjs/bunext/database/schema";

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
        name: "role",
        type: "string",
        union: ["admin", "user"]
      },
      {
        name: "data",
        type: "json",
        nullable: true,
        DataType: {
          friends: [
            {
              username: "string",
            },
          ],
          purchases: [
            "undefined",
            {
              id: "string",
              type: Union("drink", "food", "other")
            },
          ],
        },
      },
    ],
  }
];

export default MyDatabaseShema;
