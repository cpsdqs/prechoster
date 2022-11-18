import { CustomEmoji } from './components/custom-emoji';
import {
    isMarkdownViewBlock,
    MarkdownViewBlock,
    summaryContent,
    ViewBlock,
} from './types/post-blocks';
import deepmerge from 'deepmerge';
import { compile } from 'html-to-text';
import i18n from 'i18next';
import type { VNode } from 'preact';
import { createElement, Fragment } from 'preact/compat';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeRaw from 'rehype-raw';
import rehypeReact from 'rehype-react';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { Mention } from './components/mention';
import { IframelyEmbed } from './components/iframely';
import { parseEmoji } from './emoji';
import {
    cleanUpFootnotes,
    convertMentions,
    copyImgAltToTitle,
    makeIframelyEmbeds,
} from './unified-processors';
import { DateTime } from 'luxon';
import { Root } from 'hast';
import { visit } from 'unist-util-visit';
import parseStyle from 'style-to-object';

export type RenderedPost = {
    initial: VNode<any> | null;
    initialLength: number;
    expanded: VNode<any> | null;
    expandedLength: number;
};

const MAX_GFM_LINES = 256;

const convert = compile({
    wordwrap: false,
});

const FIRST_AGE_SCHEMA = deepmerge(defaultSchema, {
    attributes: {
        '*': ['style'],
    },
    tagNames: ['video', 'audio', 'aside'], // consistency with current rules,
});

// Wednesday, June 29, 2022 6:00:00 PM GMT
const FIRST_AGE_CUTOFF = new Date(1656525600000);

const SECOND_AGE_SCHEMA = deepmerge(defaultSchema, {
    attributes: {
        '*': ['style'],
    },
    tagNames: ['video', 'audio', 'aside'], // consistency with current rules,
});

// Monday, November 14, 2022 6:00:00 AM GMT
const SECOND_AGE_CUTOFF = new Date(1668405600000);

const THIRD_AGE_SCHEMA = deepmerge(defaultSchema, {
    attributes: {
        '*': ['style'],
    },
    tagNames: ['video', 'audio', 'aside'], // consistency with current rules,
});

const chooseAgeRuleset = (postDate: Date) => {
    if (postDate < FIRST_AGE_CUTOFF) {
        return FIRST_AGE_SCHEMA;
    } else if (postDate < SECOND_AGE_CUTOFF) {
        return SECOND_AGE_SCHEMA;
    } else {
        return THIRD_AGE_SCHEMA;
    }
};

const stripSecondAgeStyles = (effectiveDate: Date) => (hast: Root) => {
    // this function is second age and beyond. don't run for first page posts.
    if (effectiveDate < FIRST_AGE_CUTOFF) return;

    visit(hast, 'element', (node, index, parent) => {
        if (parent === null || index === null) return;

        if (node.properties?.style && typeof node.properties.style === 'string') {
            try {
                let changed = false;
                const parsed = parseStyle(node.properties.style);
                if (
                    parsed &&
                    parsed['position'] &&
                    parsed['position'].toLowerCase().includes('fixed')
                ) {
                    parsed.position = 'static';
                    changed = true;
                }

                if (parsed && changed) {
                    node.properties.style = Object.entries(parsed)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(';');
                }
            } catch (e) {
                // couldn't parse, don't worry about it
                return;
            }
        }
    });
};

const stripThirdAgeStyles = (effectiveDate: Date) => (hast: Root) => {
    // this function is second age and beyond. don't run for first page posts.
    if (effectiveDate < SECOND_AGE_CUTOFF) return;

    visit(hast, 'element', (node, index, parent) => {
        if (parent === null || index === null) return;

        if (node.properties?.style && typeof node.properties.style === 'string') {
            try {
                let changed = false;
                const parsed = parseStyle(node.properties.style);

                if (parsed) {
                    for (const key in parsed) {
                        // drop all CSS variables
                        if (key.startsWith('--')) {
                            delete parsed[key];
                            changed = true;
                        }
                    }
                }

                if (parsed && changed) {
                    node.properties.style = Object.entries(parsed)
                        .map(([k, v]) => `${k}:${v}`)
                        .join(';');
                }
            } catch (e) {
                // couldn't parse, don't worry about it
                return;
            }
        }
    });
};

/**
 * Used for posts only, supports arbitrary HTML
 * @returns
 */
const markdownRenderStack = (postDate: Date, lineLength: number, options: RenderingOptions) => {
    let stack = unified().use(remarkParse);

    const externalRel = ['nofollow'];
    if (options.externalLinksInNewTab) {
        externalRel.push('noopener', 'noreferrer');
    }

    if (lineLength < MAX_GFM_LINES) {
        stack = stack.use(remarkGfm, {
            singleTilde: false,
        });
    }
    return stack
        .use(remarkRehype, {
            allowDangerousHtml: true,
        })
        .use(() => copyImgAltToTitle)
        .use(() => cleanUpFootnotes)
        .use(rehypeRaw)
        .use(rehypeSanitize, {
            ...chooseAgeRuleset(postDate),
        })
        .use(() => stripSecondAgeStyles(postDate))
        .use(() => stripThirdAgeStyles(postDate))
        .use(rehypeExternalLinks, {
            rel: externalRel,
            target: options.externalLinksInNewTab ? '_blank' : '_self',
        });
};

/**
 * Used in places like comments, page descriptions, etc. places we don't want to
 * support arbitrary HTML
 * @returns
 */
const markdownRenderStackNoHTML = (
    postDate: Date,
    lineLength: number,
    options: RenderingOptions
) => {
    let stack = unified().use(remarkParse);

    const externalRel = ['nofollow'];
    if (options.externalLinksInNewTab) {
        externalRel.push('noopener', 'noreferrer');
    }

    if (lineLength < MAX_GFM_LINES) {
        stack = stack.use(remarkGfm, {
            singleTilde: false,
        });
    }

    return stack
        .use(remarkRehype)
        .use(() => copyImgAltToTitle)
        .use(() => cleanUpFootnotes)
        .use(rehypeSanitize, {
            ...chooseAgeRuleset(postDate),
        })
        .use(() => stripSecondAgeStyles(postDate))
        .use(rehypeExternalLinks, {
            rel: externalRel,
            target: options.externalLinksInNewTab ? '_blank' : '_self',
        });
};

export type RenderingOptions = {
    hasCohostPlus: boolean;
    disableEmbeds: boolean;
    externalLinksInNewTab: boolean;
};

/**
 * Used for posts only
 * @param blocks
 * @returns
 */
function renderMarkdownReact(
    blocks: MarkdownViewBlock[],
    publishDate: Date,
    options: RenderingOptions
) {
    const src = blocks.map((block) => block.markdown.content).join('\n\n');
    let lineLength = 0;

    // get the max line length among the blocks. while we group all blocks
    // together for rendering, the performance regression associated with GFM
    // tables only occurs with single line breaks, which can only exist within a
    // single block. if the total number of line breaks ACROSS THE ENTIRE POST
    // is >256, this isn't an issue. we're only impacted if it's in a single
    // block.
    for (const block of blocks) {
        if (lineLength >= MAX_GFM_LINES) {
            break;
        }

        lineLength = Math.max(lineLength, block.markdown.content.split('\n', MAX_GFM_LINES).length);
    }

    try {
        let stack = markdownRenderStack(publishDate, lineLength, options).use(
            () => convertMentions
        );

        if (!options.disableEmbeds) {
            stack = stack.use(() => makeIframelyEmbeds);
        }

        return (
            stack
                .use(parseEmoji, { cohostPlus: options.hasCohostPlus })
                // @ts-expect-error: Typings don't natively support custom elements
                .use(rehypeReact, {
                    createElement,
                    Fragment,
                    components: {
                        Mention,
                        CustomEmoji,
                        IframelyEmbed,
                    },
                })
                .processSync(src).result
        );
    } catch (e) {
        return createElement(Fragment, {}, [
            createElement(
                'div',
                {
                    className:
                        'm-3 flex w-fit flex-row gap-2 rounded-lg border-2 border-solid border-cherry p-2 text-cherry no-prose',
                },
                [
                    createElement(
                        'p',
                        { className: 'not-prose m-0 text-sm' },
                        "There was an issue rendering the HTML for this post! We've swapped to an HTML-less version for now, please check your syntax!"
                    ),
                ]
            ),
            renderMarkdownReactNoHTML(src, publishDate, options),
        ]);
    }
}

function renderMarkdownReactNoHTML(src: string, publishDate: Date, options: RenderingOptions) {
    const lineLength = src.split('\n', MAX_GFM_LINES).length;
    return (
        markdownRenderStackNoHTML(publishDate, lineLength, options)
            .use(() => convertMentions)
            .use(parseEmoji, { cohostPlus: options.hasCohostPlus })
            // @ts-expect-error: Typings don't natively support custom elements
            .use(rehypeReact, {
                createElement,
                Fragment,
                components: {
                    Mention,
                    CustomEmoji,
                },
            })
            .processSync(src).result
    );
}

function renderMarkdown(src: string, publishDate: Date, options: RenderingOptions): string {
    const lineLength = src.split('\n', MAX_GFM_LINES).length;
    return markdownRenderStack(publishDate, lineLength, options)
        .use(rehypeStringify)
        .processSync(src)
        .toString();
}

function renderMarkdownNoHTML(src: string, publishDate: Date, options: RenderingOptions): string {
    const lineLength = src.split('\n', MAX_GFM_LINES).length;
    return markdownRenderStackNoHTML(publishDate, lineLength, options)
        .use(rehypeStringify)
        .processSync(src)
        .toString();
}

function renderSummaryNoHTML(src: string, publishDate: Date): string {
    const options: RenderingOptions = {
        disableEmbeds: true,
        externalLinksInNewTab: true,
        hasCohostPlus: false,
    };
    const renderedBody = renderMarkdownNoHTML(src, publishDate, options);
    return convert(renderedBody);
}

function renderSummary(viewModel: any): string {
    const options: RenderingOptions = {
        disableEmbeds: true,
        externalLinksInNewTab: true,
        hasCohostPlus: false,
    };

    if (viewModel.cws.length > 0) {
        const cwList = viewModel.cws.join(', ');

        return i18n.t('client:opengraph.cws', {
            defaultValue: 'content warning: {{cwList}}',
            cwList,
        });
    } else {
        const effectiveDate = viewModel.publishedAt
            ? DateTime.fromISO(viewModel.publishedAt).toJSDate()
            : new Date();
        const markdownBlocks = viewModel.blocks.filter(isMarkdownViewBlock);
        const textContent = (markdownBlocks.length > 0 ? markdownBlocks : viewModel.blocks)
            .map((block: any) => summaryContent(block))
            .join('\n\n');
        const renderedBody = renderMarkdown(textContent, effectiveDate, options);
        return convert(renderedBody);
    }
}

export function renderPostToReact(
    viewBlocks: ViewBlock[],
    publishDate: Date,
    options: RenderingOptions
): RenderedPost {
    const origBlocks = viewBlocks.filter(isMarkdownViewBlock);
    const readmoreIndex = origBlocks.findIndex((block) => block.markdown.content === '---');
    let collapsedBlocks: MarkdownViewBlock[] = [];
    if (readmoreIndex > -1) {
        collapsedBlocks = origBlocks.splice(readmoreIndex);
    }
    const initialMarkdownContent = renderMarkdownReact(origBlocks, publishDate, options);
    const collapsedMarkdownContent = renderMarkdownReact(collapsedBlocks, publishDate, options);

    return {
        initial: initialMarkdownContent,
        initialLength: origBlocks.length,
        expanded: collapsedMarkdownContent,
        expandedLength: collapsedBlocks.length,
    };
}
