"use static";

import { useSession } from "public/session";

export function getServerSideProps() {
  console.log("server side props");
  Bun.sleepSync(2000);
  return {
    test: true,
  };
}

export default function StaticPage({ props }: { props: any }) {
  return (
    <>
      <p>static page {JSON.stringify(props)}</p>
      <Session />
    </>
  );
}

function Session() {
  const session = useSession();
  return <pre>{JSON.stringify(session.getData<"public">())}</pre>;
}