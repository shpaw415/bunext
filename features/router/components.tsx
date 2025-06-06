import { useEffect, useRef } from "react";
import { navigate } from "./revalidate";
import type { RoutesType } from "../../plugins/typed-route/type";
import { PreLoadPath } from "../../internal/router";

/**
 * Renders an anchor element that intercepts navigation to handle client-side routing.
 *
 * When clicked, opens the link in a new tab if the Ctrl key is pressed; otherwise, navigates programmatically using the custom {@link navigate} function.
 *
 * @param href - The destination route to navigate to.
 * @param preloadOnHover - Preload Javascript on mouse over
 *
 * @remark
 * The native click event is intercepted to prevent default browser navigation. All standard anchor attributes except `href` are supported.
 */
function Link({
  preloadOnHover,
  ...props
}: { href: RoutesType; preloadOnHover?: boolean } & Omit<
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
    preloadOnHover &&
      ref.current?.addEventListener(
        "mouseenter",
        (ev) => {
          PreLoadPath(props.href);
        },
        { signal: ctrl.signal }
      );
    return () => ctrl.abort();
  }, [props.href]);

  return <a ref={_ref} {...props} />;
}

export { Link };
export default Link;
