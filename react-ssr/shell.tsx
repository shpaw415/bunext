import { Head } from "bunext/componants/head";

export const Shell: React.FC<{ children: React.ReactElement }> = ({
  children,
}) => (
  <html>
    <Head />
    <body>{children}</body>
  </html>
);
