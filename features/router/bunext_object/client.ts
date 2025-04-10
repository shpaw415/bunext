import type { Router } from "./types";
import { navigate, usePathname } from "../../../internal/router/index";
import { Link } from "../components";

const RouterInit: Router = {
  revalidate: {
    static: CannotUseInClientContext as any,
    ssr: {
      every: CannotUseInClientContext as any,
      now: CannotUseInClientContext as any,
    },
  },
  hooks: {
    usePathname,
  },
  navigate: {
    to: navigate,
    components: {
      link: Link,
    },
  },
};

function CannotUseInClientContext() {
  throw new Error("cannot use revalidate in a client context");
}

export default RouterInit;
