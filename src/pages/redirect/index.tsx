import type { ServerSideProps } from "internal/types";


export function getServerSideProps(): ServerSideProps {
    return {
        redirect: "/",
    };
}

export default function RedirectPage() {
    return (
        <div>
            <h1>Redirecting...</h1>
        </div>
    );
} 