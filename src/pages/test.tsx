"use client";
import { useState } from "react";
import { ServerDoStuff } from "./action";

export function TestElement() {
  const [current, set] = useState(true);
  return (
    <button
      onClick={async () => {
        set(!current);
        console.log(await ServerDoStuff());
      }}
    >
      {current ? "a" : "b"}
    </button>
  );
}
