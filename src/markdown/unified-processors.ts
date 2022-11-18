import type { Root, Element, Text } from 'hast';
import { SKIP, visit } from 'unist-util-visit';
import { extractMentions } from './mention-parsing';

export const processMatches =
    (
        regex: RegExp,
        callback: (
            matches: string[],
            splits: string[],
            node: Text,
            index: number,
            parent: Root | Element
        ) => void
    ) =>
    (hast: Root) => {
        // we only want to check on text nodes for this
        visit(hast, 'text', (node, index, parent) => {
            // there is no such thing as a text node without a parent.
            // but if there is we want nothing to do with it.
            if (parent === null || index === null) return;

            const matches = node.value.match(regex);

            // if this text has mentions, process them
            if (matches) {
                const splits = node.value.split(regex);
                if (splits.length - 1 !== matches.length) {
                    // something isn't how it should be. bail.
                    return;
                }

                return callback(matches, splits, node, index, parent);
            }
        });
    };

export const convertMentions = (hast: Root) => {
    // we only want to check on text nodes for this
    visit(hast, 'text', (node, index, parent) => {
        // there is no such thing as a text node without a parent.
        // but if there is we want nothing to do with it.
        if (parent === null || index === null) return;

        const text = node.value;
        const names = extractMentions(text);

        // if this text has mentions, process them
        if (names.length) {
            const els: Array<Element | Text> = [];
            let currentStart = 0;

            names.forEach((token, idx, names) => {
                const [startPosition, endPosition] = token.indices;
                els.push({
                    type: 'text',
                    value: text.slice(currentStart, startPosition),
                });
                els.push({
                    type: 'element',
                    tagName: 'Mention',
                    properties: {
                        handle: token.handle,
                    },
                    children: [
                        {
                            type: 'text',
                            value: `@${token.handle}`,
                        },
                    ],
                });
                currentStart = endPosition;

                if (idx === names.length - 1) {
                    // if we're last we need to grab the rest of the string
                    els.push({
                        type: 'text',
                        value: text.slice(currentStart),
                    });
                }
            });

            parent.children.splice(index, 1, ...els);
            // skip over all the new elements we just created
            return [SKIP, index + els.length];
        }
    });
};

export const cleanUpFootnotes = (hast: Root) => {
    visit(hast, 'element', (node, index, parent) => {
        if (parent === null || index === null) return;
        // remove the link from the superscript number
        if (node.tagName === 'a' && (node.properties?.id as string)?.includes('fnref')) {
            parent.children.splice(index, 1, ...node.children);
            return [SKIP, index];
        }

        // remove the little arrow at the bottom
        if (node.tagName === 'a' && (node.properties?.href as string)?.includes('fnref')) {
            parent.children.splice(index, 1);
            return [SKIP, index];
        }

        // replace the invisible label with a hr
        if (node.tagName === 'h2' && (node.properties?.id as string)?.includes('footnote-label')) {
            const hrEl: Element = {
                tagName: 'hr',
                type: 'element',
                children: [],
                properties: {
                    'aria-label': 'Footnotes',
                    style: 'margin-bottom: -0.5rem;',
                },
            };
            parent.children.splice(index, 1, hrEl);
        }
    });
};

export const copyImgAltToTitle = (hast: Root) => {
    visit(hast, { type: 'element', tagName: 'img' }, (node) => {
        if (node.properties?.alt) {
            node.properties.title = node.properties.alt;
        }
    });
};

export const makeIframelyEmbeds = (hast: Root) => {
    visit(hast, { type: 'element', tagName: 'a' }, (node, index, parent) => {
        if (parent === null || index === null) return;

        // GFM autolink literals have the following two properties:
        // - they have exactly one child, and it's a text child;
        if (node.children.length != 1 || node.children[0].type != 'text') return;
        // - the starting offset of the text child matches the starting offset
        //   of the node (angle-bracket autolinks and explicit links differ by 1
        //   char)
        if (
            !node.position ||
            !node.children[0].position ||
            node.children[0].position.start.offset != node.position.start.offset
        )
            return;

        // additionally, GFM autolink literals in their own paragraph are the
        // only child of their parent node.
        if (parent.children.length != 1) return;

        // change the type of the parent to a div because you can't nest a div
        // inside a paragraph
        if (parent.type === 'element') parent.tagName = 'div';

        parent.children.splice(index, 1, {
            type: 'element',
            tagName: 'IframelyEmbed',
            properties: {
                url: node.properties?.href,
            },
            children: [],
        });

        return true;
    });
};
