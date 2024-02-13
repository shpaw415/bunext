/**
 * Represents the header data for a web page.
 */
export interface headerData {
  /**
   * The meta data elements to be included in the head section of the page.
   */
  metaData?: JSX.Element[];

  /**
   * The character set used for the page.
   */
  charSet?: "UTF-8";

  /**
   * The viewport settings for the page.
   */
  viewport?: string;

  /**
   * The title of the page.
   */
  title?: string;

  /**
   * The keywords associated with the page.
   */
  keywords?: string[];

  /**
   * The description of the page.
   */
  description?: string;

  /**
   * The author of the page.
   */
  author?: string;
}

/**
 * Sets the header data for the web page.
 * @param headerData - The header data to be set.
 */
export function setHeadData(headerData: headerData) {
  const head = globalThis.head;
  globalThis.head = {
    metaData: headerData.metaData || head.metaData,
    charSet: headerData.charSet || head.charSet,
    viewport: headerData.viewport || head.viewport,
    title: headerData.title || head.title,
    author: headerData.author || head.author,
    keywords: headerData.keywords || head.keywords,
    description: headerData.description || head.description,
  };
}

/**
 * Renders the head section of the web page.
 * @returns The JSX element representing the head section.
 */
export function Head() {
  const header = globalThis.head;
  return (
    <head>
      <meta charSet={header.charSet} />
      <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
      {Object.keys(header)
        .filter((i) => i !== "metaData" && i !== "title")
        .map((item) => {
          return (
            <meta name={item} content={(header as any)[item]} key={item} />
          );
        })}
      {header.metaData && header.metaData}
      <title>{header.title}</title>
    </head>
  );
}
