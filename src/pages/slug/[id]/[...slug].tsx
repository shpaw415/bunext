

export default function Page({ params }: { params: { slug: string[], id: string } }) {
    console.log("Dynamic Slug Page Params:", params);
    return <div>Dynamic Slug Page: {params.slug.join("/")}</div>;
}