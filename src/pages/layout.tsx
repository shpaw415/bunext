import { Head } from "public/head";
import { useState, type JSX } from "react";
import "@static/index.css";


type LayoutProps = {
  children: JSX.Element;
};

export default async function MainLayout({ children }: LayoutProps) {
  return (
    <Head data={{
      author: "shpaw415",
      publisher: "Bunext",
      meta: [
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1.0",
        },
      ],
    }}>
      <div
        style={{
          width: "100%",
          minHeight: "100%",
        }}
      >
        {children}
      </div>
    </Head>
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
