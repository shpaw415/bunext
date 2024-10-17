export function TestServerElement2() {
  return <div>{Bun.password.hashSync("allo")}</div>;
}
