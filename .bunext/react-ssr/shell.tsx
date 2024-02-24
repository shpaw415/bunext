"use client";
import React from "react";
import "./global";

export const Shell: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => (
  <html>
    <head></head>
    <body>{children}</body>
  </html>
);
