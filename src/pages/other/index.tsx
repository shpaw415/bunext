import { Head } from "@bunpmjs/bunext/features/head";
import "@static/style/other.css";

Head.setHead({
  data: {
    title: "some other",
  },
  path: "/other",
});

export function getServerSideProps() {
  return {
    test: "test",
  };
}

export default function Page({ params, props }: { params: any; props: any }) {
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
