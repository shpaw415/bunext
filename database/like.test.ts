import Database from "bun:sqlite";
import { test, beforeAll, expect, describe } from "bun:test";

import { _Database, Table } from "./class";

const db = new _Database(new Database());
const table = new Table<TestDBSchema, TestDBSchema>({
  name: "test",
  db: db.databaseInstance,
  debug: false,
});
type TestDBSchema = {
  id?: number;
  name: string;
  surname: string;
};

beforeAll(() => {
  db.create({
    name: "test",
    columns: [
      {
        name: "id",
        type: "number",
        autoIncrement: true,
        primary: true,
      },
      {
        name: "name",
        type: "string",
      },
      {
        name: "surname",
        type: "string",
      },
    ],
  });

  table.insert([
    {
      name: "te",
      surname: "free",
    },
    {
      name: "test",
      surname: "great",
    },
    {
      name: "LIKE",
      surname: "LIKE",
    },
    {
      name: "LIKE-OR",
      surname: "LIKE-OR",
    },
    {
      name: "LIKE-OR-2",
      surname: "LIKE-OR-2",
    },
    {
      name: "DELETE",
      surname: "DEL",
    },
  ]);
});
describe("SELECT", () => {
  test("normal query", () => {
    expect(
      table.select({
        where: {
          name: "test",
          surname: "great",
        },
      }).length
    ).toBe(1);
  });
  test("normal OR query", () => {
    expect(
      table.select({
        where: {
          OR: [
            {
              name: "test",
              surname: "great",
            },
            {
              name: "te",
            },
          ],
        },
      }).length
    ).toBe(2);
  });
  test("like single operator", () => {
    const res = table.select({
      where: {
        LIKE: {
          name: "t_",
        },
      },
    });

    expect(res.length).toBe(1);
  });
  test("Multiple OR LIKE operator", () => {
    const res = table.select({
      where: {
        OR: [
          {
            LIKE: {
              name: "t_",
              surname: "fr%",
            },
          },
          {
            LIKE: {
              name: "te%",
              surname: "%at",
            },
          },
        ],
      },
    });

    expect(res.length).toBe(2);
  });
});

describe("UPDATE", () => {
  test("normal quey", () => {
    table.update({ where: { name: "te" }, values: { name: "te-1" } });
    expect(table.select({ where: { name: "te-1" } }).length).toBe(1);
  });
});

describe("DELETE", () => {
  test("normal query", () => {
    expect(table.select({ where: { name: "DELETE" } }).length).toBe(1);
    table.delete({
      where: {
        name: "DELETE",
        surname: "DEL",
      },
    });
    expect(table.select({ where: { name: "DELETE" } }).length).toBe(0);
  });
});
