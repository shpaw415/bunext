import { Link } from "../../../features/router/components";
("use client");

export default function LinkPage() {
  return <Test />;
}

function Test() {
  return (
    <Link href="/dynamic/static/1">
      <button>Test</button>
    </Link>
  );
}
