"use client";
import "./style.css";
export function DynamicComponent({ title }: { title: string }) {
  return (
    <div>
      <h1 className="test">{title}</h1>
      <h1 className="">Dynamic Component</h1>
      <p>This component is loaded dynamically.</p>
    </div>
  );
}
