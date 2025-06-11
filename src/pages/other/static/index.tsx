"use static";

export function getServerSideProps() {
  Bun.sleepSync(2000);
  return {
    test: true,
  };
}

export default function StaticPage({ props }: { props: any }) {
  return (
    <>
      <p>static page {JSON.stringify(props)}</p>
    </>
  );
}
