import { useHead } from "@bunpmjs/bunext/head";
import type { BunextRequest } from "@bunpmjs/bunext/features/client/request.ts";
import { revalidateStatic } from "@bunpmjs/bunext/router";

type Props = {
  id: string;
};

export async function getServerSideProps({
  request,
}: {
  request: Request;
}): Promise<Props> {
  /*revalidateStatic(request, 5);
  const fake = await (
    await fetch("https://jsonplaceholder.typicode.com/todos/1")
  ).json();
  console.log(fake);*/
  return {
    id: "allo",
  };
}

export default function Page({
  props,
}: {
  props: Props;
  request: BunextRequest;
}) {
  return (
    <Head>
      <div>{props.id}</div>
    </Head>
  );
}

function Head({ children }: { children: any }) {
  useHead({
    data: {
      title: "TESTER",
    },
  });
  return children;
}
