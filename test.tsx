import { navigate } from "@bunpmjs/bunext/bun-react-ssr/router";
function NextPage() {
  return <button onClick={() => navigate("/new/location")}>Next page</button>;
}
