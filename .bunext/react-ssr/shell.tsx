import "@bunpmjs/bunext/internal/globals";
import { Head } from "@bunpmjs/bunext/componants/head";
import { Dev } from "@bunpmjs/bunext/dev/dev";
import React from "react";
export const Shell = ({
  children,
  route,
}: {
  children: JSX.Element;
  route: string;
}) => {
  return (
    <html>
      <Head currentPath={route} />
      <body>{children}</body>
      {process.env.NODE_ENV == "development" ||
      globalThis.__NODE_ENV__ == "development" ? (
        <Dev />
      ) : (
        <></>
      )}
    </html>
  );
};
