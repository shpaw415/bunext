import "bunext-js/client/globals";
import { Dev } from "public/dev";
import { HeadProvider } from "bunext-js/head";
import { SessionProvider } from "internal/router";
import type { ReactShellComponent } from "internal/types";

export const Shell: ReactShellComponent = ({
  children,
  route,
  request
}) => {
  return (
    <SessionProvider>
      <html lang={request?.plugins.rawGlobalData?.__HTML_LANG__ as string || globalThis?.__HTML_LANG__ || "en"}>
        <HeadProvider currentPath={route}>
          <body>
            <Dev>{children}</Dev>
          </body>
        </HeadProvider>
      </html>
    </SessionProvider>
  );
};
