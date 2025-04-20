import { useHead } from "bunext-js/head";
import type { BunextRequest } from "bunext-js/internal/server/bunextRequest.ts";

type Props = {
  id: string;
};

export async function getServerSideProps({
  request,
}: {
  request: Request;
}): Promise<Props> {
  Bunext.router.revalidate.static(request, 5);
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
