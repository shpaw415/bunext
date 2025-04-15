"use static";

export function getServerSideProps(): { path: string } {
  const request = Bunext.request.get.request(arguments);
  Bun.sleepSync(2000);
  return {
    path: new URL(request.url).pathname,
  };
}

export default function DynamicImport({
  params,
  props,
}: {
  params: { module: string };
  props: { path: string };
}) {
  return (
    <>
      <Bunext.plugins.onRequest.components.DynamicComponent
        pathName={`/src/dynamic/component`}
        elementName={params.module}
        bootStrap={{
          style: ["/src/dynamic/style.css"],
        }}
        props={{ title: "hello" }}
        id="test"
      />
      <ButtonRevalidate path={props.path} />
    </>
  );
}

function ButtonRevalidate({ path }: { path: string }) {
  return (
    <button onClick={() => ServerRevalidate(path)}>Revalidate {path}</button>
  );
}

export async function ServerRevalidate(path: string) {
  console.log(`revalidating static path: ${path}`);
  Bunext.router.revalidate.static(path);
}
