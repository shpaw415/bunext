import { Database } from "@bunpmjs/bunext/database";
import type { _Users } from "@bunpmjs/bunext/database/types";
import "@static/style.css";
type Props = {
  params: {
    bar: string;
  };
  props: _Users[];
};

export function getServerSideProps() {
  return Database().Users.select({});
}

export default function BarPage({ params, props }: Props) {
  return <div>{JSON.stringify(props)}</div>;
}
