import { test } from "bun:test";
import { ConvertShemaToType, Union } from "./schema";


test("shema maker", async () => {

    const types = ConvertShemaToType([
        {
            name: "test",
            columns: [
                {
                    name: "id",
                    type: "number",
                    autoIncrement: true,
                    unique: true,
                    primary: true
                },
                {
                    name: "test",
                    type: "string",
                    union: ["a", "b", "c"]
                },
                {
                    name: "test2",
                    type: "json",
                    DataType: {
                        test: Union("a", "b", "c")
                    }
                }
            ]
        }
    ]);
    console.log(types.types[0])
    await Bun.write("test.json", JSON.stringify(types.types, null, 2));
});