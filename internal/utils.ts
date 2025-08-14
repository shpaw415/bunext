export const SEPARATOR_REGEX = /[\/\\]/g;

interface HTMLFormatterOptions {
    indentSize?: number;
    indentChar?: string;
    maxLineLength?: number;
    preserveInlineElements?: boolean;
    sortAttributes?: boolean;
    removeEmptyAttributes?: boolean;
    selfClosingTags?: boolean;
}

const DEFAULT_OPTIONS: Required<HTMLFormatterOptions> = {
    indentSize: 2,
    indentChar: ' ',
    maxLineLength: 80,
    preserveInlineElements: true,
    sortAttributes: true,
    removeEmptyAttributes: true,
    selfClosingTags: true,
};

const VOID_ELEMENTS = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr'
]);

const INLINE_ELEMENTS = new Set([
    'a', 'abbr', 'acronym', 'b', 'bdi', 'bdo', 'big', 'br', 'button', 'cite',
    'code', 'dfn', 'em', 'i', 'img', 'input', 'kbd', 'label', 'map', 'mark',
    'meter', 'noscript', 'object', 'output', 'progress', 'q', 'ruby', 's',
    'samp', 'script', 'select', 'small', 'span', 'strong', 'sub', 'sup',
    'textarea', 'time', 'tt', 'u', 'var', 'wbr'
]);

const PRE_ELEMENTS = new Set(['pre', 'code', 'script', 'style', 'textarea']);

interface ParsedElement {
    type: 'element' | 'text' | 'comment' | 'doctype';
    tagName?: string;
    attributes?: Record<string, string>;
    children?: ParsedElement[];
    content?: string;
    isVoid?: boolean;
    isInline?: boolean;
    preserveWhitespace?: boolean;
}

function parseHTML(html: string): ParsedElement[] {
    const result: ParsedElement[] = [];
    let index = 0;

    while (index < html.length) {
        const char = html[index];

        if (char === '<') {
            const nextChar = html[index + 1];

            if (nextChar === '!') {
                if (html.slice(index, index + 4) === '<!--') {
                    // Comment
                    const commentEnd = html.indexOf('-->', index + 4);
                    if (commentEnd !== -1) {
                        const content = html.slice(index + 4, commentEnd);
                        result.push({ type: 'comment', content });
                        index = commentEnd + 3;
                        continue;
                    }
                } else if (html.slice(index, index + 9).toLowerCase() === '<!doctype') {
                    // Doctype
                    const doctypeEnd = html.indexOf('>', index);
                    if (doctypeEnd !== -1) {
                        const content = html.slice(index + 1, doctypeEnd);
                        result.push({ type: 'doctype', content });
                        index = doctypeEnd + 1;
                        continue;
                    }
                }
            } else if (nextChar === '/') {
                // Closing tag - handled by element parsing
                const tagEnd = html.indexOf('>', index);
                if (tagEnd !== -1) {
                    index = tagEnd + 1;
                    continue;
                }
            } else {
                // Opening tag
                const elementResult = parseElement(html, index);
                if (elementResult) {
                    result.push(elementResult.element);
                    index = elementResult.nextIndex;
                    continue;
                }
            }
        }

        // Text content
        const nextTagIndex = html.indexOf('<', index);
        const textEnd = nextTagIndex === -1 ? html.length : nextTagIndex;
        const textContent = html.slice(index, textEnd);

        if (textContent.trim()) {
            result.push({ type: 'text', content: textContent });
        }

        index = textEnd;
    }

    return result;
}

function parseElement(html: string, startIndex: number): { element: ParsedElement; nextIndex: number } | null {
    const tagMatch = html.slice(startIndex).match(/^<([a-zA-Z0-9-]+)([^>]*?)(\s*\/?)>/);
    if (!tagMatch) return null;

    const [fullMatch, tagName, attributesStr, selfClose] = tagMatch;
    const isSelfClosing = selfClose.trim() === '/' || VOID_ELEMENTS.has(tagName.toLowerCase());

    const attributes = parseAttributes(attributesStr);
    const isInline = INLINE_ELEMENTS.has(tagName.toLowerCase());
    const preserveWhitespace = PRE_ELEMENTS.has(tagName.toLowerCase());

    const element: ParsedElement = {
        type: 'element',
        tagName,
        attributes,
        isVoid: isSelfClosing,
        isInline,
        preserveWhitespace,
        children: []
    };

    let currentIndex = startIndex + fullMatch.length;

    if (!isSelfClosing) {
        // Parse children until closing tag
        const closingTag = `</${tagName}>`;
        const closingTagIndex = html.indexOf(closingTag, currentIndex);

        if (closingTagIndex !== -1) {
            const innerHtml = html.slice(currentIndex, closingTagIndex);
            if (preserveWhitespace) {
                element.children = [{ type: 'text', content: innerHtml }];
            } else {
                element.children = parseHTML(innerHtml);
            }
            currentIndex = closingTagIndex + closingTag.length;
        }
    }

    return { element, nextIndex: currentIndex };
}

function parseAttributes(attributesStr: string): Record<string, string> {
    const attributes: Record<string, string> = {};
    const attrRegex = /([a-zA-Z0-9-_:]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let match;

    while ((match = attrRegex.exec(attributesStr)) !== null) {
        const [, name, doubleQuoted, singleQuoted, unquoted] = match;
        const value = doubleQuoted ?? singleQuoted ?? unquoted ?? '';
        attributes[name] = value;
    }

    return attributes;
}

function formatAttributes(attributes: Record<string, string>, options: Required<HTMLFormatterOptions>): string {
    let attrs = Object.entries(attributes);

    if (options.removeEmptyAttributes) {
        attrs = attrs.filter(([, value]) => value !== '');
    }

    if (options.sortAttributes) {
        attrs.sort(([a], [b]) => a.localeCompare(b));
    }

    return attrs
        .map(([name, value]) => {
            if (value === '') {
                return name;
            }
            const quote = value.includes('"') ? "'" : '"';
            return `${name}=${quote}${value}${quote}`;
        })
        .join(' ');
}

function getIndentation(level: number, options: Required<HTMLFormatterOptions>): string {
    return options.indentChar.repeat(level * options.indentSize);
}

function formatElement(element: ParsedElement, level: number, options: Required<HTMLFormatterOptions>): string {
    if (element.type === 'text') {
        const content = element.content?.trim() || '';
        return content ? content : '';
    }

    if (element.type === 'comment') {
        return `<!--${element.content}-->`;
    }

    if (element.type === 'doctype') {
        return `<!${element.content}>`;
    }

    if (element.type !== 'element' || !element.tagName) {
        return '';
    }

    const indent = getIndentation(level, options);
    const tagName = element.tagName.toLowerCase();

    let result = `<${tagName}`;

    // Add attributes
    if (element.attributes && Object.keys(element.attributes).length > 0) {
        const formattedAttrs = formatAttributes(element.attributes, options);
        result += ` ${formattedAttrs}`;
    }

    // Handle void/self-closing elements
    if (element.isVoid) {
        result += options.selfClosingTags ? ' />' : '>';
        return result;
    }

    result += '>';

    // Handle children
    if (element.children && element.children.length > 0) {
        if (element.preserveWhitespace) {
            // Preserve whitespace for pre, code, script, style, textarea
            const content = element.children.map(child => child.content || '').join('');
            result += content;
        } else {
            const hasOnlyInlineChildren = element.children.every(child =>
                child.type === 'text' || (child.type === 'element' && child.isInline)
            );

            const shouldInline = options.preserveInlineElements &&
                (element.isInline || hasOnlyInlineChildren) &&
                element.children.length === 1 &&
                element.children[0].type === 'text';

            if (shouldInline) {
                // Inline formatting
                const content = element.children
                    .map(child => formatElement(child, level, options))
                    .join('')
                    .trim();
                result += content;
            } else {
                // Block formatting
                const formattedChildren = element.children
                    .map(child => formatElement(child, level + 1, options))
                    .filter(child => child.trim())
                    .map(child => `\n${getIndentation(level + 1, options)}${child}`);

                if (formattedChildren.length > 0) {
                    result += formattedChildren.join('');
                    result += `\n${indent}`;
                }
            }
        }
    }

    result += `</${tagName}>`;
    return result;
}

export function formatHTML(html: string, options: HTMLFormatterOptions = {}): string {
    const mergedOptions = { ...DEFAULT_OPTIONS, ...options };

    // Remove extra whitespace and normalize
    const cleanedHtml = html
        .replace(/\s+/g, ' ')
        .replace(/>\s+</g, '><')
        .trim();

    if (!cleanedHtml) return '';

    try {
        const parsed = parseHTML(cleanedHtml);
        const formatted = parsed
            .map(element => formatElement(element, 0, mergedOptions))
            .filter(result => result.trim())
            .join('\n');

        return formatted;
    } catch (error) {
        // Fallback: return original HTML with basic formatting
        console.warn('HTML formatting failed, returning original:', error);
        return html
            .replace(/></g, '>\n<')
            .split('\n')
            .map(line => line.trim())
            .filter(line => line)
            .join('\n');
    }
}