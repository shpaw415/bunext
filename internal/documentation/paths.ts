export const Main_URL = "https://bunext.com" as const;
export const DOC_PATH = "doc" as const;
export const DOCS_URL = {
  dynamicComponents: "dynamic-components",
} as const;

export function makeDocURL(doc: keyof typeof DOCS_URL) {
  return `${Main_URL}/${DOC_PATH}/${DOCS_URL[doc]}`;
}
