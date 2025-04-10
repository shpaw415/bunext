"use client";

export default function DynamicImport({ props }: { props: any }) {
  return (
    <Bunext.plugins.onRequest.components.DynamicComponent
      pathName={`/src/dynamic/component`}
      elementName="DynamicComponent"
      bootStrap={{
        style: ["/src/dynamic/style.css"],
      }}
      props={{ title: "title" }}
    />
  );
}
