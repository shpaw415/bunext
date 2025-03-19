"use static";
import { useRequest, type BunextRequest } from "@bunpmjs/bunext/client/request";
import "@static/style.css";

type Params = {
  segment: string;
};

function Head() {
  const req = useRequest();
  req?.setHead({
    title: "super-title",
  });

  return <></>;
}

export default function Page({
  params,
  request,
}: {
  params: Params;
  request?: BunextRequest;
}) {
  return (
    <p>
      <Head />
      {params.segment}
      test
    </p>
  );
}
