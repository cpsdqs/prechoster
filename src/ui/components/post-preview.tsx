import { h, VNode } from 'preact';
import { Fragment, PureComponent, useEffect, useMemo, useRef, useState } from 'preact/compat';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { Popover } from './popover';
import { loadRenderer, RenderFn, RenderConfig, RenderResult } from './cohost-renderer';
import './post-preview.less';

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

interface ErrProps {
    isFirstOfType: boolean;
}
const ERRORS = {
    'strip-element'({ node, isFirstOfType }: { node: Element } & ErrProps) {
        let tagName = '???';
        if (node instanceof HTMLElement || node instanceof SVGElement) {
            tagName = node.tagName.toLowerCase();
        }

        return (
            <div>
                Element will be removed: &lt;{tagName}&gt;
                {isFirstOfType && (
                    <div class="quick-help">This element type is not supported in posts.</div>
                )}
            </div>
        );
    },
    'input-to-checkbox'({ type, isFirstOfType }: { type: string } & ErrProps) {
        return (
            <div>
                An input of type <code>{type}</code> will be converted to a checkbox.
                {isFirstOfType && <div class="quick-help">Cohost does this for some reason.</div>}
            </div>
        );
    },
    'user-content-id'({ id, isFirstOfType }: { id: string } & ErrProps) {
        return (
            <div>
                The ID <code>{id}</code> will be renamed to <code>user-content-{id}</code>.
                {isFirstOfType && (
                    <div class="quick-help">
                        A reference to this element ID elsewhere will be broken.
                    </div>
                )}
            </div>
        );
    },
    'strip-css-variable'({
        name,
        node,
        isFirstOfType,
    }: { name: string; node: HTMLElement | SVGElement } & ErrProps) {
        return (
            <div>
                CSS variable will be removed: <code>{name}</code>
                {isFirstOfType && (
                    <div class="quick-help">
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
                    {url.substr(0, 100)}
                    {url.length > 100 ? '…' : ''}
                </code>
                {isFirstOfType && (
                    <div class="quick-help">
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
                    {url.substr(0, 100)}
                    {url.length > 100 ? '…' : ''}
                </code>
                {isFirstOfType && (
                    <div class="quick-help">
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

interface ErrorMessage {
    id: keyof typeof ERRORS;
    props: { [k: string]: any };
}

function BasicRenderer({ html }: { html: string }) {
    return (
        <div
            class="inner-prose p-prose basic-renderer"
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

// TODO: make this configurable maybe
const RESET_ON_RENDER = true;

function CohostRenderer({
    renderId,
    rendered,
    readMore,
    onReadMoreChange,
}: {
    renderId: string;
    rendered: RenderResult;
    readMore: boolean;
    onReadMoreChange: (r: boolean) => void;
}) {
    return (
        <Fragment>
            <div class="inner-prose p-prose cohost-renderer" key={RESET_ON_RENDER && renderId}>
                {rendered.initial}
                {readMore ? rendered.expanded : null}
            </div>
            {rendered.expandedLength ? (
                <a class="prose-read-more" onClick={() => onReadMoreChange(!readMore)}>
                    {readMore ? 'read less' : 'read more'}
                </a>
            ) : null}
        </Fragment>
    );
}

function useCohostRenderer(): RenderFn | null {
    const rendererPromise = useMemo(() => loadRenderer(), undefined);
    const [renderer, setRenderer] = useState<{ current: RenderFn | null }>({ current: null });

    useEffect(() => {
        rendererPromise.then((renderer) => {
            setRenderer({ current: renderer });
        });
    }, [rendererPromise]);

    return renderer.current;
}

function MarkdownRenderer({
    renderId,
    cohostRenderer,
    config,
    markdown,
    fallbackHtml,
    readMore,
    onReadMoreChange,
}: {
    renderId: string;
    cohostRenderer: RenderFn | null;
    config: RenderConfig;
    markdown: string;
    fallbackHtml: string;
    readMore: boolean;
    onReadMoreChange: (b: boolean) => void;
}) {
    if (cohostRenderer) {
        try {
            const rendered = cohostRenderer(markdown, config);
            return (
                <CohostRenderer
                    renderId={renderId}
                    rendered={rendered}
                    readMore={readMore}
                    onReadMoreChange={onReadMoreChange}
                />
            );
        } catch (err) {
            // oh well
            console.error('cohost renderer error', err);
        }
    }
    return <BasicRenderer html={fallbackHtml} />;
}

function renderMarkdown(
    markdown: string,
    pushError: (id: keyof typeof ERRORS, props: { [k: string]: any }) => void
) {
    const doc = new DOMParser().parseFromString(
        [
            '<!doctype html><html><head></head><body>',
            micromark(markdown, {
                allowDangerousHtml: true,
                extensions: [gfm({ singleTilde: false })],
                htmlExtensions: [gfmHtml()],
            }),
            '</body></html>',
        ].join(''),
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
        node.remove();
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
            node.removeAttribute('src');
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

function handleAsyncErrors(
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

export function PostPreview({ renderId, markdown, error, stale }: PostPreview.Props) {
    let html = '';
    const renderErrors: ErrorMessage[] = [];
    try {
        html = renderMarkdown(markdown, (id, props) => renderErrors.push({ id, props }));
    } catch (err) {
        error = err as Error;
    }

    const cohostRenderer = useCohostRenderer();
    const [config, setConfig] = useState<RenderConfig>({
        disableEmbeds: false,
        externalLinksInNewTab: true,
        hasCohostPlus: true,
    });
    const [readMore, setReadMore] = useState(false);

    const proseContainer = useRef<HTMLDivElement>(null);
    const errorBtn = useRef<HTMLButtonElement>(null);
    const [errorsOpen, setErrorsOpen] = useState(false);
    const [asyncErrors, setAsyncErrors] = useState<ErrorMessage[]>([]);

    const pushAsyncError = (id: keyof typeof ERRORS, props: any) => {
        // we mutate to fix janky update coalescion issues
        asyncErrors.push({ id, props });
        setAsyncErrors([...asyncErrors]);
    };

    useEffect(() => {
        asyncErrors.splice(0);
        setAsyncErrors([...asyncErrors]);

        handleAsyncErrors(proseContainer.current!, pushAsyncError);
    }, [html]);

    const errorCount = renderErrors.length + asyncErrors.length;

    return (
        <div class={'post-preview' + (stale ? ' is-stale' : '')}>
            <div class="post-header">
                <RenderConfig
                    hasCohostRenderer={!!cohostRenderer}
                    config={config}
                    onConfigChange={setConfig}
                />
                <span class="i-errors-container">
                    <button
                        ref={errorBtn}
                        class={'i-errors-button' + (errorCount ? ' has-errors' : '')}
                        disabled={!errorCount}
                        onClick={() => setErrorsOpen(true)}
                        aria-label={errorCount === 1 ? '1 error' : `${errorCount} errors`}
                    >
                        <span class="i-errors-icon">!</span>
                        <span class="i-errors-count">{errorCount}</span>
                    </button>
                    <Popover
                        anchor={errorBtn.current}
                        open={errorsOpen}
                        onClose={() => setErrorsOpen(false)}
                    >
                        <ErrorList errors={renderErrors.concat(asyncErrors)} />
                    </Popover>
                </span>
            </div>
            <hr />
            {error ? (
                <div class="prose-container p-prose-outer">
                    <div class="inner-prose p-prose is-error">
                        {error
                            .toString()
                            .split('\n')
                            .map((line, i) => (
                                <div key={i}>{line}</div>
                            ))}
                    </div>
                </div>
            ) : (
                <div class="prose-container p-prose-outer" ref={proseContainer}>
                    <MarkdownRenderer
                        renderId={renderId}
                        cohostRenderer={cohostRenderer}
                        config={config}
                        markdown={markdown}
                        fallbackHtml={html}
                        readMore={readMore}
                        onReadMoreChange={setReadMore}
                    />
                </div>
            )}
            <hr />
            <div class="post-footer">
                <ByteSize size={html.length} />
                <CopyToClipboard disabled={!!error} data={markdown} label="Copy to clipboard" />
            </div>
        </div>
    );
}
namespace PostPreview {
    export interface Props {
        renderId: string;
        markdown: string;
        error?: Error | null;
        stale?: boolean;
    }
}

function ErrorList({ errors }: { errors: ErrorMessage[] }) {
    const seenTypes = new Set<string>();

    return (
        <ul class="i-errors">
            {errors.map(({ id, props }, i) => {
                const Component = (ERRORS as any)[id];
                const isFirstOfType = !seenTypes.has(id.toString());
                seenTypes.add(id.toString());
                return (
                    <li class="i-error" key={'r' + i}>
                        <Component {...props} isFirstOfType={isFirstOfType} />
                    </li>
                );
            })}
        </ul>
    );
}

function RenderConfig({
    hasCohostRenderer,
    config,
    onConfigChange,
}: {
    hasCohostRenderer: boolean;
    config: RenderConfig;
    onConfigChange: (c: RenderConfig) => void;
}) {
    const cohostPlusId = Math.random().toString(36);
    const embedsId = Math.random().toString(36);

    if (!hasCohostRenderer) {
        return <div class="render-config">(using fallback renderer)</div>;
    }

    return (
        <div class="render-config">
            <span class="config-item">
                <input
                    id={cohostPlusId}
                    type="checkbox"
                    checked={config.hasCohostPlus}
                    onChange={(e) => {
                        onConfigChange({
                            ...config,
                            hasCohostPlus: (e.target as HTMLInputElement).checked,
                        });
                    }}
                />{' '}
                <label for={cohostPlusId}>Cohost Plus!</label>
            </span>
            <span class="config-item">
                <input
                    id={embedsId}
                    type="checkbox"
                    checked={config.disableEmbeds}
                    onChange={(e) => {
                        onConfigChange({
                            ...config,
                            disableEmbeds: (e.target as HTMLInputElement).checked,
                        });
                    }}
                />{' '}
                <label for={embedsId}>Disable Embeds</label>
            </span>
        </div>
    );
}

function ByteSize({ size }: { size: number }) {
    let label;
    if (size < 1000) {
        label = size + ' bytes';
    } else {
        size = +(size / 1000).toFixed(2);
        if (size < 1000) {
            label = size + ' kB';
        } else {
            size = +(size / 1000).toFixed(2);
            label = size + ' MB';
        }
    }
    return <span>{label}</span>;
}

function CopyToClipboard({ data, label, disabled }: CopyToClipboard.Props) {
    const [copied, setCopied] = useState(false);

    const copy = () => {
        try {
            navigator.clipboard.writeText(data);
            setCopied(true);
            setTimeout(() => {
                setCopied(false);
            }, 1000);
        } catch (err) {
            alert('Could not copy to clipboard\n\n' + err);
        }
    };

    return (
        <button
            disabled={disabled}
            class={'copy-to-clipboard' + (copied ? ' did-copy' : '')}
            onClick={copy}
        >
            {label}
        </button>
    );
}
namespace CopyToClipboard {
    export interface Props {
        data: string;
        label: string;
        disabled?: boolean;
    }
}
