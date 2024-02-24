// TODO: make it only avalable from the request and not global

export type _Head = {
  title?: string;
  author?: string;
  publisher?: string;
  meta?: {
    name: string;
    content: string;
  }[];
};

declare global {
  var head: _Head;
}

export function Head() {
  const data = globalThis.head;
  return (
    <head>
      {data?.meta?.map((e) => (
        <meta name={e.name} content={e.content} />
      ))}
      {Object.keys(data || {})
        .filter((n) => n != "meta")
        .map((e) => {
          const val = data[e as keyof _Head] as string;
          if (e === "title") return <title>{val}</title>;
          return <meta name={e} content={val} />;
        })}
    </head>
  );
}
/** @param [reset=false] true for wipe the head data false to update already setted data */
export function setHead(data: _Head, reset: boolean = false) {
  globalThis.head = reset ? data : { ...globalThis.head, ...data };
}
