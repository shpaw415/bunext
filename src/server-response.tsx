import { StrictMode, useState } from "react";
import { Head } from "./head";

export function App({ children }: { children?: JSX.Element }) {
  const [val, call] = useState("t");
  return (
    <StrictMode>
      <html>
        <Head />
        <body>
          <div id="root">{children}</div>
        </body>
      </html>
      {globalThis.scripts}
    </StrictMode>
  );
}

export function addScriptToResponse(
  ScriptElement: JSX.Element | JSX.Element[]
) {
  if (!Array.isArray(ScriptElement)) ScriptElement = [ScriptElement];
  globalThis.scripts.push(...ScriptElement);
}

export function setJSXElementToResponse(Element: JSX.Element) {
  globalThis.responseData = Element;
}

export function compileGlobalResponse() {
  return (
    <>
      {globalThis.responseData}
      {globalThis.scripts}
    </>
  );
}
