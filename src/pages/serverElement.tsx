export function TestServerElement2() {
  return <div>He {Bun.password.hashSync("allo").toLocaleString()}</div>;
}
