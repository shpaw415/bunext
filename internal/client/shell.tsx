import "bunext-js/client/globals";
import { Dev } from "public/dev";
import { HeadProvider } from "bunext-js/head";
import { SessionProvider } from "internal/router";
import type { ReactShellComponent } from "internal/types";

export const Shell: ReactShellComponent = ({
  children,
  lang,
  route,
}) => {
  return (
    <SessionProvider>
      <html lang={lang || "en"}>
        <HeadProvider currentPath={route}>
          <body>
            <Dev>{children}</Dev>
          </body>
        </HeadProvider>
      </html>
    </SessionProvider>
  ) as any;
};
