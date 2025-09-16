"use static";

import { useSession } from "public/session";

export function getServerSideProps() {
  console.log("server side props");
  return {
    test: true,
  };
}

export default function StaticPage({ props }: { props: any }) {
  return (
    <>
      <p>static pages {JSON.stringify(props)}</p>
      <Session />
    </>
  );
}

function Session() {
  const session = useSession();
  console.log("session data", session.getMetadata());
  return <pre>{JSON.stringify(session.getData<"public">())}</pre>;
}