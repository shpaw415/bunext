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
        name: "test",
        type: "boolean",
      },
      {
        name: "foo",
        type: "json",
        DataType: [
          {
            foo: "string",
            bar: ["number"],
          },
        ],
      },
    ],
  },
];
