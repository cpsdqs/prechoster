import { h, VNode } from 'preact';
import { PureComponent, useEffect, useRef, useState } from 'preact/compat';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { Popover } from './popover';
import './post-preview.less';

const STRIP_ELEMENTS = [
    'script',
    'style',
    'frame',
    'iframe',
    'applet',
    'embed',
    'object',
    'link',
    'svg',
    'select',
    'form',
    'button',
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
                {isFirstOfType && <div class="quick-help">This element type is not supported in posts.</div>}
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
                {isFirstOfType && <div class="quick-help">A reference to this element ID elsewhere will be broken.</div>}
            </div>
        );
    },
    'strip-css-variable'({ name, node, isFirstOfType }: { name: string, node: HTMLElement | SVGElement } & ErrProps) {
        return (
            <div>
                CSS variable will be removed: <code>{name}</code>
                {isFirstOfType && <div class="quick-help">CSS variable declarations are not supported in posts.</div>}
            </div>
        );
    },
    'img-load-failed'({ url, isFirstOfType }: { url: string } & ErrProps) {
        return (
            <div>
                Could not load image resource:
                {' '}
                <code>{url.substr(0, 100)}{url.length > 100 ? '…' : ''}</code>
                {isFirstOfType && (
                    <div class="quick-help">
                        Check your URL maybe…<br />
                        To include an image in a post,
                        you can upload it to cohost in a draft post
                        and copy the image address,
                        or inline it as a data: URL if your image is small (see examples).
                    </div>
                )}
            </div>
        );
    },
};

interface ErrorMessage {
    id: keyof typeof ERRORS;
    props: { [k: string]: any };
}

function renderMarkdown(
    markdown: string,
    pushError: (id: keyof typeof ERRORS, props: { [k: string]: any }) => void,
) {
    const doc = new DOMParser().parseFromString([
        '<!doctype html><html><head></head><body>',
        micromark(markdown, {
            allowDangerousHtml: true,
            extensions: [gfm({ singleTilde: false })],
            htmlExtensions: [gfmHtml()],
        }),
        '</body></html>',
    ].join(''), 'text/html');
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
        if (idReferences.has(node.id)) {
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
    pushAsyncError: (id: keyof typeof ERRORS, props: { [k: string]: any }) => void,
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

export function PostPreview({ markdown, error, stale }: PostPreview.Props) {
    let html = '';
    const renderErrors: ErrorMessage[] = [];
    try {
        html = renderMarkdown(markdown, (id, props) => renderErrors.push({ id, props }));
    } catch (err) {
        error = err as Error;
    }

    const innerProse = useRef<HTMLDivElement>(null);
    const errorBtn = useRef<HTMLButtonElement>(null);
    const [errorsOpen, setErrorsOpen] = useState(false);
    const [asyncErrors, setAsyncErrors] = useState<ErrorMessage[]>([]);

    const pushAsyncError = (id: keyof typeof ERRORS, props: any) => {
        // we mutate to fix janky update coalescion issues
        asyncErrors.push({ id, props });
        setAsyncErrors([...asyncErrors]);
    };

    useEffect(() => {
        innerProse.current!.innerHTML = html;
        asyncErrors.splice(0);
        setAsyncErrors([...asyncErrors]);

        handleAsyncErrors(innerProse.current!, pushAsyncError);
    }, [html]);

    const errorCount = renderErrors.length + asyncErrors.length;

    return (
        <div class={'post-preview' + (stale ? ' is-stale' : '')}>
            <div class="post-header">
                <span />
                <span class="i-errors-container">
                    <button
                        ref={errorBtn}
                        class={'i-errors-button' + (errorCount ? ' has-errors' : '')}
                        disabled={!errorCount}
                        onClick={() => setErrorsOpen(true)}
                        aria-label={errorCount === 1 ? '1 error' : `${errorCount} errors`}>
                        <span class="i-errors-icon">!</span>
                        <span class="i-errors-count">
                            {errorCount}
                        </span>
                    </button>
                    <Popover
                        anchor={errorBtn.current}
                        open={errorsOpen}
                        onClose={() => setErrorsOpen(false)}>
                        <ErrorList errors={renderErrors.concat(asyncErrors)} />
                    </Popover>
                </span>
            </div>
            <hr />
            <div class="prose-container p-prose-outer">
                {error ? (
                    <div class="inner-prose p-prose is-error">
                        {error.toString().split('\n').map((line, i) => <div key={i}>{line}</div>)}
                    </div>
                ) : (
                    <div class="inner-prose p-prose" ref={innerProse} />
                )}
            </div>
            <hr />
            <div class="post-footer">
                <ByteSize size={html.length} />
                <CopyToClipboard disabled={!!error} data={markdown} label="Copy HTML to clipboard" />
            </div>
        </div>
    );
}
namespace PostPreview {
    export interface Props {
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
            onClick={copy}>
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
