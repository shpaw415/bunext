import type { Database } from "./types";

const BunextRequest: Database = new Error(
  "cannot use Database in a Client context"
) as any;

export default BunextRequest;
