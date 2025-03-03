import "@bunpmjs/bunext/internal/globals.ts";
import { Dev } from "@bunpmjs/bunext/dev/dev.tsx";
import { type JSX } from "react";
import { HeadProvider } from "@bunpmjs/bunext/head";
import { SessionProvider } from "@bunpmjs/bunext/internal/router/index.tsx";
export const Shell = ({
  children,
  route,
}: {
  children: JSX.Element;
  route: string;
}) => {
  return (
    <SessionProvider>
      <html>
        <HeadProvider currentPath={route}>
          <Dev>
            <body>{children}</body>
          </Dev>
        </HeadProvider>
      </html>
    </SessionProvider>
  );
};
