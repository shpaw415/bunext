import { Head } from "@bunpmjs/bunext/features/head";
import { Register } from "./register";

Head.setHead({
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
