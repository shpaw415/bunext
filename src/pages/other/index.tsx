import { useHead } from "@bunpmjs/bunext/head";
import "@static/style/other.css";

export function getServerSideProps() {
  return {
    test: "test",
  };
}

function Header() {
  useHead({ data: { title: `Custom-title-${Math.random()}` } });
  return <></>;
}

export default function Page({ params, props }: { params: any; props: any }) {
  return (
    <div>
      <Header />
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
