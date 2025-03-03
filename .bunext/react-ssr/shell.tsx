import "@bunpmjs/bunext/internal/globals";
import { Dev } from "@bunpmjs/bunext/dev/dev.tsx";
import { type JSX } from "react";
import { HeadProvider } from "@bunpmjs/bunext/head";
export const Shell = ({
  children,
  route,
}: {
  children: JSX.Element;
  route: string;
}) => {
  return (
    <HeadProvider currentPath={route}>
      <html>
        <Dev>
          <body>{children}</body>
        </Dev>
      </html>
    </HeadProvider>
  );
};
