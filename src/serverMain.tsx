// must keep import as it is
import React from "react";
import { App } from "./server-response";

export const ServerApp = async (children?: JSX.Element) => {
  return <App children={children} />;
};
