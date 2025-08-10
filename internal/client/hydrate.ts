"use client";
import { hydrate } from "bunext-js/client/hydrate";
import { Shell } from "./shell";
import "bunext-js/client/globals";

await hydrate(Shell);
