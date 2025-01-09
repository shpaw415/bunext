import { Database } from "@bunpmjs/bunext/database";
import type { _Users } from "@bunpmjs/bunext/database/database_types";

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
