import type { JSX } from "react";

export type dynamicComponents = {
  id: string;
  content: string;
  pathname: string;
  element: {
    type: keyof JSX.IntrinsicElements;
    props: Record<string, any>;
  };
};
