"use static";
import "@static/style.css";

type Params = {
  segment: string;
};

function Head() {
  const req = Bunext.request.hook.useRequest();
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
  request?: typeof Bunext.request.bunext;
}) {
  return (
    <p>
      <Head />
      {params.segment}
      test
    </p>
  );
}
