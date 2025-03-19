export function getServerSideProps() {
  return {
    test: true,
  };
}

export default function Page({ props }: { props: { test: boolean } }) {
  return <>{props.test ? "true" : "false"}</>;
}
