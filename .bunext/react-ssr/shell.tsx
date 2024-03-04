import React from "react";
import "./global";
import { Head } from "@bunpmjs/bunext/componants/head";

export const Shell = (props: { children: JSX.Element; route: string }) => {
  return (
    <html>
      <Head currentPath={props.route} />
      <body>{props.children}</body>
    </html>
  );
};
