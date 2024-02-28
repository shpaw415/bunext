"use client";

import { useState } from "react";

export function TestComponant({ content }: { content: string }) {
  const [state, set] = useState(true);
  return (
    <button onClick={() => set(!state)}>
      {content} {state ? "click" : "unclicked"}
    </button>
  );
}
