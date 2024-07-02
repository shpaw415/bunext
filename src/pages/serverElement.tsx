export function TestServerElement() {
  return <div>{Bun.password.hashSync("allo")}</div>;
}
