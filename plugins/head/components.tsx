import { useHead } from "./hooks";
import type { HeadData } from "./types";


export function Head({ children, data }: { children: React.ReactNode, data: HeadData }) {
    useHead({ data });
    return children;
}