export default function ServerActionPage() {
  return (
    <>
      <h1>Server action test page</h1>
      <button onClick={() => ServerConsole({ foo: "bar" })}>Console log</button>
    </>
  );
}

export async function ServerConsole(data: any) {
  console.log(data);
}
