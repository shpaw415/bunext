import "@bunpmjs/bunext/internal/globals";
import { HeadElement } from "@bunpmjs/bunext/features/head";
import { Dev } from "@bunpmjs/bunext/dev/dev";

export const Shell = ({
  children,
  route,
}: {
  children: JSX.Element;
  route: string;
}) => {
  return (
    <html>
      <Dev>
        <HeadElement currentPath={route} />
        <body>{children}</body>
      </Dev>
    </html>
  );
};
