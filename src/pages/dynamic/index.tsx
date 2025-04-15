"use static";

export function getServerSideProps() {
  return "component";
}

export default function DynamicImport({ props }: { props: {} }) {
  return (
    <Bunext.plugins.onRequest.components.DynamicComponent
      pathName={`/src/dynamic/${props}`}
      elementName="DynamicComponent"
      bootStrap={{
        style: ["/src/dynamic/style.css"],
      }}
      props={{ title: "hello" }}
      id="test"
    />
  );
}
