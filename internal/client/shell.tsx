import "bunext-js/client/globals";
import { Dev } from "public/dev";
import { HeadProvider } from "../../plugins/head/provider";
import { SessionProvider } from "internal/router";
import type { ReactShellComponent } from "internal/types";

export const Shell: ReactShellComponent = ({
  children,
  request
}) => {
  return (
    <SessionProvider>
      <html lang={request?.getContext<{ __HTML_LANG__: string }>()?.__HTML_LANG__ || globalThis?.__HTML_LANG__ || "en"}>
        <HeadProvider>
          <body>
            <Dev>{children}</Dev>
          </body>
        </HeadProvider>
      </html>
    </SessionProvider>
  );
};
