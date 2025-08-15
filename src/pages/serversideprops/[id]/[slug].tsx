"use static";
type paramsType = {
    id: string;
    slug: string;
}

export function getServerSideProps({ params }: { params: paramsType }) {
    const { id, slug } = params;

    console.log(id, slug);

    return "ok"
}


export default function Page({ params, props }: { params: paramsType, props: string }) {
    return (
        <div>
            <h1>Page</h1>
            <p>ID: {params.id}</p>
            <p>Slug: {params.slug}</p>
            <p>Props: {props}</p>
        </div>
    );
}