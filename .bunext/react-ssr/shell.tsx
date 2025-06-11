import "bunext-js/internal/globals.ts";
import { Dev } from "bunext-js/dev/dev.tsx";
import { type JSX } from "react";
import { HeadProvider } from "bunext-js/features/head.tsx";
import { SessionProvider } from "bunext-js/internal/router/index.tsx";

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
          <body>
            <Dev>{children}</Dev>
          </body>
        </HeadProvider>
      </html>
    </SessionProvider>
  ) as any;
};
