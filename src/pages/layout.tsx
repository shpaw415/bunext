import { useState } from "react";

type LayoutProps = {
  children: JSX.Element;
};

export default function MainLayout({ children }: LayoutProps) {
  return (
    <div>
      Layout
      <Element />
      {children}
    </div>
  );
}

function Element() {
  const [state, setState] = useState(true);

  return <div>{state}</div>;
}
