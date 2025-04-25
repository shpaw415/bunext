import { useEffect, useRef } from "react";
import { navigate } from "./revalidate";
import type { RoutesType } from "../../plugins/typed-route/type";

/**
 * Renders a typed anchor element that handles client-side navigation.
 *
 * Navigates to the specified route without a full page reload. If the Ctrl key is held during click, opens the link in a new browser tab.
 *
 * @param href - The destination route to navigate to.
 */
export function Link({
  ...props
}: { href: RoutesType } & Omit<
  React.DetailedHTMLProps<
    React.AnchorHTMLAttributes<HTMLAnchorElement>,
    HTMLAnchorElement
  >,
  "href"
>) {
  const _ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    const ref =
      (props.ref as React.RefObject<HTMLAnchorElement> | undefined) ?? _ref;
    ref.current?.addEventListener(
      "click",
      (c) => {
        c.preventDefault();
        if (c.ctrlKey) return window.open(props.href, "_blank");
        navigate(props.href);
      },
      { signal: ctrl.signal }
    );
    return () => ctrl.abort();
  }, []);

  return <a ref={_ref} {...props} />;
}
