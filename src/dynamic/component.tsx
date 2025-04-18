"use client";
import "./style.css";
import { TestComponent } from "./other";
import { useState } from "react";

export function DynamicComponent({ title }: { title: string }) {
  return (
    <span className="tester">
      <h1 className="test">{title}</h1>
      <h1 className="">Dynamic Component</h1>
      <p>This component is loaded dynamically.</p>
      <Test />
      <TestComponent />
    </span>
  );
}

export function one({ title }: { title: string }) {
  return (
    <span>
      <h1>{title}</h1>
      <p>One exported</p>
    </span>
  );
}

export function two({ title }: { title: string }) {
  return (
    <span>
      <h1>{title}</h1>
      <p>Two exported</p>
    </span>
  );
}

function Test() {
  const [state, set] = useState(0);
  return <button onClick={() => set(Math.random())}>{state}</button>;
}
