import type { BunextRequest } from "@bunpmjs/bunext/server/request";
import "@static/style/other.css";

export function getServerSideProps() {
  return {
    test: "test",
  };
}

export default function Page({
  params,
  props,
  request,
}: {
  params: any;
  props: any;
  request?: BunextRequest;
}) {
  request?.setHead({
    title: `Custom-title-${Math.random()}`,
  });

  return (
    <div>
      <div>{JSON.stringify(props)}</div>
      <div
        onClick={() => {
          ServerGet();
        }}
      >
        {JSON.stringify(params || {})}
      </div>
    </div>
  );
}

export async function ServerGet() {
  return "";
}
