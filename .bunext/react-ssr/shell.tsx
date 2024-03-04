import React from "react";
import "./global";
import { Head } from "@bunpmjs/bunext/componants/head";
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
      <Head currentPath={route} />
      <body>{children}</body>
      <Dev />
    </html>
  );
};
