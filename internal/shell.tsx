import "../.bunext/react-ssr/global";
import { Head } from "../componants/head";
import { Dev } from "../dev/dev";
export const Shell = ({
  children,
  route,
}: {
  children: JSX.Element;
  route: string;
}) => {
  return (
    <html>
      <Head currentPath={route} />
      <body>{children}</body>
      <Dev />
    </html>
  );
};
