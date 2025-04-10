import { useState } from "react";

export default function Page({ props }: any) {
  return (
    <div>
      {JSON.stringify(props)}
      <Test />
    </div>
  );
}

function Test() {
  const [state, setState] = useState("allo1");
  Bunext.request.hook.useRequest()?.setHead({
    title: `random-${Math.random()}`,
  });
  return <div>{state}</div>;
}

export async function TestElement() {
  return <div></div>;
}

export async function getServerSideProps(props: any) {
  return {
    allo: true,
    other: [1, 3, 3],
  };
}
