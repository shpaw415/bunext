import { useState } from "react";

type LayoutProps = {
  children: JSX.Element;
};

export default async function MainLayout({ children }: LayoutProps) {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "100%",
      }}
    >
      {children}
    </div>
  );
}

function Element() {
  const [state, setState] = useState(true);

  return (
    <div>
      {state ? "a" : "b"}
      <button onClick={() => setState(!state)}>update</button>
    </div>
  );
}
