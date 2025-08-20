import type { Router } from "./types";
import { revalidateStatic } from "plugins/static_page";
import { usePathname } from "../../../internal/router/index";
import { Link } from "../components";
import { revalidate, revalidateEvery } from "plugins/server-features/ssr-page";

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
