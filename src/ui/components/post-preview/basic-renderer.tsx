import React from 'react';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';

const STRIP_ELEMENTS = [
    'address',
    'applet',
    'area',
    'article',
    'base',
    'bdi',
    'button',
    'canvas',
    'col',
    'colgroup',
    'data',
    'datalist',
    'dialog',
    'embed',
    'header',
    'fieldset',
    'footer',
    'form',
    'frame',
    'iframe',
    'label',
    'legend',
    'link',
    'main',
    'map',
    'menu',
    'meta',
    'meter',
    'nav',
    'nobr',
    'noscript',
    'object',
    'optgroup',
    'option',
    'output',
    'portal',
    'progress',
    'script',
    'section',
    'select',
    'slot',
    'style',
    'svg',
    'template',
    'textarea',
    'title',
];

export interface ErrProps {
    isFirstOfType: boolean;
}

export interface ErrorMessage {
    id: keyof typeof ERRORS;
    props: { [k: string]: any };
}

export const ERRORS = {
    'strip-element'({ node, isFirstOfType }: { node: Element } & ErrProps) {
        let tagName = '???';
        if (node instanceof HTMLElement || node instanceof SVGElement) {
            tagName = node.tagName.toLowerCase();
        }

        return (
            <div>
                Element will be removed: &lt;{tagName}&gt;
                {isFirstOfType && (
                    <div className="quick-help">This element type is not supported in posts.</div>
                )}
            </div>
        );
    },
    'input-to-checkbox'({ type, isFirstOfType }: { type: string } & ErrProps) {
        return (
            <div>
                An input of type <code>{type}</code> will be converted to a checkbox.
                {isFirstOfType && (
                    <div className="quick-help">Cohost does this for some reason.</div>
                )}
            </div>
        );
    },
    'user-content-id'({ id, isFirstOfType }: { id: string } & ErrProps) {
        return (
            <div>
                The ID <code>{id}</code> will be renamed to <code>user-content-{id}</code>.
                {isFirstOfType && (
                    <div className="quick-help">
                        A reference to this element ID elsewhere will be broken.
                    </div>
                )}
            </div>
        );
    },
    'strip-css-variable'({
        name,
        isFirstOfType,
    }: { name: string; node: HTMLElement | SVGElement } & ErrProps) {
        return (
            <div>
                CSS variable will be removed: <code>{name}</code>
                {isFirstOfType && (
                    <div className="quick-help">
                        CSS variable declarations are not supported in posts.
                    </div>
                )}
            </div>
        );
    },
    'strip-img-src-protocol'({
        protocol,
        url,
        isFirstOfType,
    }: { protocol: string; url: string } & ErrProps) {
        return (
            <div>
                <code>{protocol}</code> image source will be removed:{' '}
                <code>
                    {url.substring(0, 100)}
                    {url.length > 100 ? '…' : ''}
                </code>
                {isFirstOfType && (
                    <div className="quick-help">
                        Things like <code>data:</code> URLs work in CSS background images, but they
                        don’t work in regular images.
                    </div>
                )}
            </div>
        );
    },
    'img-load-failed'({ url, isFirstOfType }: { url: string } & ErrProps) {
        return (
            <div>
                Could not load image resource:{' '}
                <code>
                    {url.substring(0, 100)}
                    {url.length > 100 ? '…' : ''}
                </code>
                {isFirstOfType && (
                    <div className="quick-help">
                        Check your URL maybe…
                        <br />
                        To include an image in a post, you can upload it to cohost in a draft post
                        and copy the image address, or inline it as a data: URL if your image is
                        small (see examples).
                    </div>
                )}
            </div>
        );
    },
    'position-fixed'({ node }: { node: HTMLElement }) {
        return (
            <div>
                <code>position: fixed</code> will be removed on a{' '}
                <code>{node.tagName.toLowerCase()}</code> element
            </div>
        );
    },
};

export function renderMarkdown(
    markdown: string,
    pushError: (id: keyof typeof ERRORS, props: { [k: string]: any }) => void
): string {
    const renderedMarkdown = unified()
        .use(remarkParse)
        .use(remarkBreaks)
        .use(remarkGfm, {
            singleTilde: false,
        })
        .use(remarkRehype, {
            allowDangerousHtml: true,
        })
        .use(rehypeStringify, {
            allowDangerousHtml: true,
        })
        .processSync(markdown)
        .toString();

    const doc = new DOMParser().parseFromString(
        ['<!doctype html><html><head></head><body>', renderedMarkdown, '</body></html>'].join(''),
        'text/html'
    );

    const footnotes = doc.querySelector('section[data-footnotes]');
    const ignoreUserContentId = new Set();
    if (footnotes) {
        // cohost does something weird with the footnotes that i cant be bothered
        // to replicate accurately here
        footnotes.remove();
        const innerFootnotes = footnotes.querySelector('ol')!;
        const hr = document.createElement('hr');
        hr.setAttribute('aria-label', 'Footnotes');
        hr.style.marginBottom = '-0.5rem';
        doc.body.append(hr);
        doc.body.append(innerFootnotes);

        // stop warning about footnotes
        for (const node of innerFootnotes.querySelectorAll('[id]')) {
            ignoreUserContentId.add(node.id);
        }
        for (const fnref of innerFootnotes.querySelectorAll('[href^="#user-content-fnref"]')) {
            const refId = fnref.getAttribute('href')!.substring(1);
            ignoreUserContentId.add(refId);
        }
    }

    for (const node of doc.querySelectorAll(STRIP_ELEMENTS.join(', '))) {
        pushError('strip-element', { node });
        // unsanitized output
        // node.remove();
    }
    for (const node of doc.querySelectorAll('input')) {
        node.disabled = true;
        if (node.type !== 'checkbox') {
            pushError('input-to-checkbox', { type: node.type });
            node.type = 'checkbox';
        }
    }

    for (const node of doc.querySelectorAll('img')) {
        const src = node.getAttribute('src');
        const allowedProtocols = ['http', 'https'];
        const protocol = (src || '').match(/^(\w+):/);
        if (protocol && !allowedProtocols.includes(protocol[1])) {
            pushError('strip-img-src-protocol', { protocol: protocol[1], url: src });
            // unsanitized output
            // node.removeAttribute('src');
        }
    }

    const idReferencingAttrs = [
        'aria-activedescendant',
        'aria-controls',
        'aria-describedby',
        'aria-errormessage',
        'aria-flowto',
        'aria-labelledby',
        'aria-owns',
        'for',
        'headers',
        'list',
    ];
    const idReferences = new Set();
    for (const attr of idReferencingAttrs) {
        for (const node of doc.querySelectorAll(`[${attr}]`)) {
            idReferences.add(node.getAttribute(attr));
        }
    }
    for (const node of doc.querySelectorAll(`[href]`)) {
        const href = node.getAttribute('href') || '';
        if (href.startsWith('#')) {
            idReferences.add(href.substr(1));
        }
    }

    // cohost adds user-content- before ids in posts
    for (const node of doc.querySelectorAll('[id]')) {
        if (idReferences.has(node.id) && !ignoreUserContentId.has(node.id)) {
            pushError('user-content-id', { id: node.id });
        }
        node.id = 'user-content-' + node.id;
    }

    for (const _node of doc.querySelectorAll(`[style]`)) {
        const node = _node as HTMLElement | SVGElement;
        const styleKeys: string[] = [];
        for (let i = 0; i < node.style.length; i++) {
            const key = node.style[i];
            styleKeys.push(key);
        }
        for (const key of styleKeys) {
            if (key.startsWith('--')) {
                node.style.setProperty(key, '');
                pushError('strip-css-variable', {
                    node,
                    name: key,
                });
            }
            if (key === 'position' && node.style.position === 'fixed') {
                node.style.position = 'static';
                pushError('position-fixed', { node });
            }
        }
    }

    return doc.body.innerHTML;
}

export const COHOST_APPROX_MAX_PAYLOAD_SIZE = 200000;
export function getExportWarnings(input: string): string[] {
    const doc = new DOMParser().parseFromString(
        ['<!doctype html><html><head></head><body>', input, '</body></html>'].join(''),
        'text/html'
    );

    const exportWarnings: string[] = [];

    if (input.length >= COHOST_APPROX_MAX_PAYLOAD_SIZE) {
        exportWarnings.push('this is probably too large to post');
    }

    const isUrlLoopback = (url: URL) => {
        console.log(url);
        if (!['http:', 'https:'].includes(url.protocol)) return false;
        if (url.hostname.match(/^localhost(\b|$)/i)) return true;
        if (url.hostname.match(/^127\.0\.0/)) return true;
        return false;
    };

    for (const node of doc.querySelectorAll('[src]')) {
        const url = node.getAttribute('src');
        if (!url) continue;
        try {
            const parsedUrl = new URL(url);
            if (parsedUrl.protocol === 'blob:') {
                exportWarnings.push(
                    `a <${node.tagName.toLowerCase()}> src has a blob: URL source. it will stop working on cohost`
                );
            } else if (isUrlLoopback(parsedUrl)) {
                exportWarnings.push(
                    `a <${node.tagName.toLowerCase()}> src has a localhost URL source. it will stop working for other people`
                );
            }
        } catch {}
    }
    for (const node of doc.querySelectorAll('[style]')) {
        if ((node as HTMLElement).style?.backgroundImage) {
            const urls = findUrlsInBackgroundImage((node as HTMLElement).style.backgroundImage);
            for (const url of urls) {
                try {
                    const parsedUrl = new URL(url);
                    if (parsedUrl.protocol === 'blob:') {
                        exportWarnings.push(
                            `a <${node.tagName.toLowerCase()}> background-image has a blob: URL source. it will stop working on cohost`
                        );
                    } else if (isUrlLoopback(parsedUrl)) {
                        exportWarnings.push(
                            `a <${node.tagName.toLowerCase()}> background-image has a localhost URL source. it will stop working for other people`
                        );
                    }
                } catch {}
            }
        }
    }

    return exportWarnings;
}

function findUrlsInBackgroundImage(s: string) {
    const urls = [];
    while (s) {
        const m = s.match(/url\((?:(?:'((?:[^\\']|\\')+?)')|(?:"((?:[^\\"]|\\")+?)")|([^)]+?))\)/i);
        if (m) {
            const url = m[1] || m[2] || m[3];
            urls.push(url);
            s = s.substr(m.index! + m[0].length);
        } else {
            break;
        }
    }
    return urls;
}

export function handleAsyncErrors(
    prose: HTMLElement,
    pushAsyncError: (id: keyof typeof ERRORS, props: { [k: string]: any }) => void
) {
    for (const img of prose.querySelectorAll('img')) {
        img.onerror = () => {
            pushAsyncError('img-load-failed', { url: img.getAttribute('src') || '???' });
        };
    }
    for (const node of prose.querySelectorAll('[style]')) {
        if ((node as HTMLElement).style?.backgroundImage) {
            const urls = findUrlsInBackgroundImage((node as HTMLElement).style.backgroundImage);
            for (const url of urls) {
                const image = new Image();
                image.src = url;
                image.onerror = () => {
                    pushAsyncError('img-load-failed', { url });
                };
            }
        }
    }
}
