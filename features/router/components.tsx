import { cloneElement, type JSX } from "react";

export function Link({
  href,
  children,
}: {
  href: string;
  children: JSX.Element;
}) {
  return cloneElement<React.HTMLAttributes<HTMLElement>>(children, {
    onClick: (e) => {
      children.props.onClick && children.props.onClick(e);
      Bunext.router.navigate.to(href);
    },
  });
}
