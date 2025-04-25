import { useEffect, useRef } from "react";
import { navigate } from "./revalidate";
import type { RoutesType } from "../../plugins/typed-route/type";

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
  }, [props.href]);

  return <a ref={_ref} {...props} />;
}
