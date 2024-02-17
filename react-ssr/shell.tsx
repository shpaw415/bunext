import { Head } from "@bunpmjs/bunext/componants/head";
import { LoadScript, addScript } from "@bunpmjs/bunext/componants/script";
import React from "react";
import "./global";

addScript(() => {
  console.log("test");
});

export const Shell: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => (
  <html>
    <Head />
    <body>
      {children}
      <LoadScript />
    </body>
  </html>
);
