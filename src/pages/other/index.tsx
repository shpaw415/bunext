import { Head } from "../../../features/head";

Head.setHead({
  data: {
    title: "some other",
  },
});

export default function Page() {
  return <div>Page2</div>;
}
