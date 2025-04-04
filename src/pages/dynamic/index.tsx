"use client";

export default async function DynamicImport() {
  const dynamicPath = `/src/dynamic/component`;

  return (
    <div>
      {typeof window != "undefined" ? (
        (await import(dynamicPath)).DynamicComponent()
      ) : (
        <></>
      )}
    </div>
  );
}
