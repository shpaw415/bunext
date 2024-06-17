import { Head } from "@bunpmjs/bunext/features/head";

Head.setHead({
  data: {
    title: "some other",
  },
});

export default function Page() {
  return <div>Page2</div>;
}
