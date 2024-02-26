"use client";

import { useState } from "react";
import { ServerAction } from ".";

export function Button({ content }: { content: string }) {
  const [state, set] = useState(content);
  return (
    <button
      onClick={async () => {
        set(
          await ServerAction({
            data: "Some Client Data",
          })
        );
      }}
    >
      {state}
    </button>
  );
}
