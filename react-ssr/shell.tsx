import { Head } from "@bunpmjs/bunext/componants/head";
import { Script } from "@bunpmjs/bunext/componants/script";
import React from "react";
import "./global";
export const Shell: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => (
  <html>
    <Head />
    <body>{children}</body>
    {globalThis.mode === "dev" && (
      <Script
        fn={() => {
          const p = window.location;
          const ws = new WebSocket(`${p.protocol}//${p.hostname}:3001`);
          ws.on("message", (data) => {
            const message = data.toString();
            console.log(message);
          });
        }}
        call
      />
    )}
  </html>
);
