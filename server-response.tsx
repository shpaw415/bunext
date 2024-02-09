export function createRootPage(jsxStack: JSX.Element) {
  return <div id="root">{jsxStack}</div>;
}

export function addScriptToResponse(
  ScriptElement: JSX.Element | JSX.Element[]
) {
  if (!Array.isArray(ScriptElement)) ScriptElement = [ScriptElement];
  globalThis.scripts.push(...ScriptElement);
}

export function addJSXElementToResponse(Element: JSX.Element) {
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
