import type { HeadData } from "./types";
import { renderToString } from "react-dom/server";



export function RewriteHeadData(data: HeadData): string {
    const el = <>
        {data?.title && <title>{data.title}</title>}
        {data?.author && <meta name="author" content={data.author} />}
        {data?.publisher && <meta name="publisher" content={data.publisher} />}
        {data?.meta?.map((e, index) => (
            <meta key={index} {...e} />
        ))}
        {data?.link?.map((e, index) => (
            <link key={index} {...e} />
        ))}
    </>;

    return renderToString(el);
}