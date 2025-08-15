"use static";
import { useHead } from "bunext-js/head";
import type { BunextRequest } from "bunext-js/request";
import { generateRandomString } from "features/utils";

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
    id: `allo-${generateRandomString(5)}`,
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
