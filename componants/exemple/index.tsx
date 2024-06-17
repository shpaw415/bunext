import { setHead } from "../../features/head";
import { Register } from "./register";
import { Session } from "@bunpmjs/bunext/features/session";

setHead({
  data: {
    title: "My Bunext powered WebSite",
    author: "shpaw415",
    publisher: "bunpmjs",
  },
});

export default function page() {
  return (
    <>
      <h1>Hello World!</h1>
      <p>this is my Website</p>
      <Register content="Register Now!" />
    </>
  );
}

export async function ServerCreateUser({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  Bun.sleepSync(1000); // some backend work
  Session.setData({
    username: username,
    password: password,
  });
  return `Data: ${username} with password: ${password} now registered`;
}
