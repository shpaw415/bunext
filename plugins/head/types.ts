import type { PreBuildContext } from "./utils";

export type headProviderType = [(data: HeadData) => void, string];

export type HeadData = {
    title?: string;
    author?: string;
    publisher?: string;
    meta?: React.DetailedHTMLProps<
        React.MetaHTMLAttributes<HTMLMetaElement>,
        HTMLMetaElement
    >[];
    link?: React.DetailedHTMLProps<
        React.LinkHTMLAttributes<HTMLLinkElement>,
        HTMLLinkElement
    >[];
};

export type ContextType = { __HEAD_DATA__?: HeadData };

export type PreBuildContextType = {
    __HEAD_DATA__: PreBuildContext
}