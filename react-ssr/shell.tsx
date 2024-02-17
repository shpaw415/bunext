import { Head } from "@bunpmjs/bunext/componants/head";
import { LoadScript, addScriptToList } from "@bunpmjs/bunext/componants/script";
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

addScriptToList(() => {
  console.log("test");
});
