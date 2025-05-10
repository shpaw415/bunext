import { Head } from "bunext-js/head";
import { useState, type JSX } from "react";
import "@static/index.css";
import "@static/style.css";

type LayoutProps = {
  children: JSX.Element;
};

Head.setHead({
  path: "*",
  data: {
    author: "shpaw415",
    publisher: "Bunext",
    meta: [
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1.0",
      },
    ],
  },
});

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
