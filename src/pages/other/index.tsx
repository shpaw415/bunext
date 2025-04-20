import { useHead } from "bunext-js/head";
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
      <Bunext.router.navigate.components.link href="/other/static">
        <button>Go to static</button>
      </Bunext.router.navigate.components.link>
    </div>
  );
}

export async function ServerGet() {
  return "";
}
