import type { Table } from "../../../../database/class";
import { CacheManagerExtends } from "../../../../internal/caching";

export type dynamicComponents = {
  id: string;
  content: string;
  pathname: string;
};

class dynamicComponentsCache extends CacheManagerExtends {
  private dynamic: Table<dynamicComponents, dynamicComponents>;
  constructor() {
    super({
      shema: [
        {
          name: "dynamic_components",
          columns: [
            {
              name: "id_no",
              primary: true,
              type: "number",
              autoIncrement: true,
            },
            {
              name: "pathname",
              type: "string",
            },
            {
              name: "id",
              type: "string",
            },
            {
              name: "content",
              type: "string",
            },
          ],
        },
      ],
    });
    this.dynamic = this.CreateTable<dynamicComponents, dynamicComponents>(
      "dynamic_components"
    );
  }

  add(props: { pathname: string; id: string; content: string }) {
    if (
      this.dynamic.select({
        where: {
          id: props.id,
          content: props.content,
        },
        limit: 1,
      }).length
    )
      this.dynamic.update({
        where: {
          id: props.id,
          pathname: props.pathname,
        },
        values: {
          content: props.content,
        },
      });
    else this.dynamic.insert([props]);
  }
  get(props: { pathname: string; id?: string }) {
    return this.dynamic.select({
      where: props,
    });
  }
}

export { dynamicComponentsCache };
