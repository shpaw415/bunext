import type { Link as _Link } from "../components";
import type { navigate, usePathname } from "../../../internal/router/index";
import type {
  revalidate,
  revalidateEvery,
  revalidateStatic,
} from "../revalidate";

export type Router = {
  revalidate: Revalidate;
  navigate: Navigate;
  hooks: Hooks;
};

declare global {
  var Link: typeof _Link;
}

type Revalidate = {
  /**
   * revalidate the specific path like: /some/path/id_1
   * @param pathname pathLike of the route you want to revalidate
   * @param timeout timeout in seconds
   */
  static: typeof revalidateStatic;
  ssr: {
    /**
     * @param path relative path from src/pages Exemple: "/" or "/user"
     */
    now: typeof revalidate;
    /**
     * @param path relative path from src/pages Exemple: "/" or "/user"
     * @param seconde every x seconde to revalide
     */
    every: typeof revalidateEvery;
  };
};

type Navigate = {
  to: typeof navigate;
  components: {
    link: typeof _Link;
  };
};

type Hooks = {
  /**
   * a hook that returns the current pathname
   * @returns the current pathname
   */
  usePathname: typeof usePathname;
};
