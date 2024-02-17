import { Head } from "@bunpmjs/bunext/componants/head";
import { LoadScript } from "@bunpmjs/bunext/componants/script";
import React from "react";
import "./global";
export const Shell: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => (
  <html>
    <Head />
    <body>{children}</body>
    <LoadScript />
  </html>
);
