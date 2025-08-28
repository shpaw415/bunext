"use static";
import "@static/style.css";
import { useHead } from "public/head";

type Params = {
  segment: string;
};

function CustomHead() {
  useHead({
    data: {
      title: "super-title",
    },
  });
  return <></>;
}

export default function Page({
  params,
  request,
}: {
  params: Params;
  request?: typeof Bunext.request.bunext;
}) {
  return (
    <p>
      <CustomHead />
      {params.segment}
      test
    </p>
  );
}
