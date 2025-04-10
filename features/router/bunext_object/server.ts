import type { Router } from "./types";
import { revalidate, revalidateEvery, revalidateStatic } from "../revalidate";
import { usePathname } from "../../../internal/router/index";
import { Link } from "../components";

const RouterInit: Router = {
  revalidate: {
    static: revalidateStatic,
    ssr: {
      every: revalidateEvery,
      now: revalidate,
    },
  },
  hooks: {
    usePathname,
  },
  navigate: {
    to: () => {
      throw new Error("cannot navigate in a server context");
    },
    components: {
      link: Link,
    },
  },
};

export default RouterInit;
