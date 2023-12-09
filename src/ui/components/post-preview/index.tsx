import React, { Fragment, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DirPopover } from '../../../uikit/dir-popover';
import {
    COHOST_RENDERER_VERSION,
    loadRenderer,
    RenderFn,
    RenderConfig,
    RenderResult,
} from './cohost-renderer';
import { RenderContext } from '../../render-context';
import { CohostPlusIcon, CohostRegularIcon, PreviewRenderIcon } from '../icons';
import './index.less';
import {
    COHOST_APPROX_MAX_PAYLOAD_SIZE,
    ErrorMessage,
    ERRORS,
    getExportWarnings,
    handleAsyncErrors,
    renderMarkdown,
} from './basic-renderer';
import { Button } from '../../../uikit/button';
import { createPortal } from 'react-dom';

const RESET_ON_RENDER = true;

function BasicRenderer({
    html,
    error,
    errorPortal,
}: {
    html: string;
    error: React.ReactNode | null;
    errorPortal: HTMLDivElement | null;
}) {
    return (
        <>
            <div
                className="inner-prose p-prose basic-renderer"
                role="article"
                dangerouslySetInnerHTML={{ __html: html }}
            />
            {error && errorPortal
                ? createPortal(<div className="inner-cohost-error">{error}</div>, errorPortal)
                : null}
        </>
    );
}

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
            <div
                className="inner-prose p-prose cohost-renderer"
                role="article"
                key={RESET_ON_RENDER && renderId}
            >
                {rendered.initial}
                {readMore ? rendered.expanded : null}
            </div>
            {rendered.expandedLength ? (
                <a className="prose-read-more" onClick={() => onReadMoreChange(!readMore)}>
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

function getCohostErrorMessage(rendered: any): React.ReactNode | null {
    if (rendered?.props?.className === 'not-prose' && rendered?.props?.children?.type === 'p') {
        return rendered;
    }
    return null;
}

function MarkdownRenderer({
    renderId,
    cohostRenderer,
    config,
    markdown,
    fallbackHtml,
    readMore,
    onReadMoreChange,
    errorPortal,
    onRender,
}: {
    renderId: string;
    cohostRenderer: RenderFn | null;
    config: RenderConfig;
    markdown: string;
    fallbackHtml: string;
    readMore: boolean;
    onReadMoreChange: (b: boolean) => void;
    errorPortal: HTMLDivElement | null;
    onRender: () => void;
}) {
    const [rendered, setRendered] = useState<RenderResult | null>(null);
    const [error, setError] = useState<React.ReactNode | null>(null);

    const [triggerOnRender, setTriggerOnRender] = useState(0);

    useEffect(() => {
        if (cohostRenderer) {
            const thisRenderId = renderId;

            cohostRenderer(markdown, config)
                .then((result) => {
                    if (renderId !== thisRenderId) return;

                    const error =
                        getCohostErrorMessage(result.initial) ||
                        getCohostErrorMessage(result.expanded);
                    setError(error);

                    if (error) {
                        setRendered(null);
                    } else {
                        setRendered(result);
                    }
                })
                .catch((error) => {
                    if (renderId !== thisRenderId) return;
                    // oh well
                    console.error('cohost renderer error', error);
                    setRendered(null);
                    setError(<div className="cohost-message-box">{error.toString()}</div>);
                })
                .finally(() => {
                    setTriggerOnRender(triggerOnRender + 1);
                });
        } else {
            setTriggerOnRender(triggerOnRender + 1);
        }
    }, [cohostRenderer, config, markdown]);

    useEffect(() => {
        onRender();
    }, [triggerOnRender]);

    if (cohostRenderer && rendered) {
        return (
            <CohostRenderer
                renderId={renderId}
                rendered={rendered}
                readMore={readMore}
                onReadMoreChange={onReadMoreChange}
            />
        );
    }

    return <BasicRenderer html={fallbackHtml} error={error} errorPortal={errorPortal} />;
}

export interface PreviewConfig {
    render: RenderConfig;
    cohostRenderer: boolean;
    prefersReducedMotion: boolean;
    simulateUserstyles: boolean;
    darkMode: boolean;
}

const DEFAULT_RENDER_CONFIG: RenderConfig = {
    disableEmbeds: false,
    externalLinksInNewTab: true,
    hasCohostPlus: true,
};

export const DEFAULT_PREVIEW_CONFIG: PreviewConfig = {
    render: DEFAULT_RENDER_CONFIG,

    cohostRenderer: true,
    prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    simulateUserstyles: false,
    darkMode: false
};

export function PostPreview({
    renderId,
    markdown,
    error,
    stale,
    config,
    onConfigChange,
    readMore,
    onReadMoreChange,
    errorPortal,
}: PostPreview.Props) {
    let html = '';
    const renderErrors: ErrorMessage[] = [];
    try {
        html = renderMarkdown(markdown, (id, props) => renderErrors.push({ id, props }));
    } catch (err) {
        error = err as Error;
    }

    const cohostRenderer = useCohostRenderer();

    const proseContainer = useRef<HTMLDivElement>(null);
    const errorBtn = useRef<HTMLButtonElement>(null);
    const [errorsOpen, setErrorsOpen] = useState(false);
    const [asyncErrors, setAsyncErrors] = useState<ErrorMessage[]>([]);

    const newAsyncErrors = asyncErrors.slice();
    const pushAsyncError = (id: keyof typeof ERRORS, props: any) => {
        // we mutate to fix janky update coalescion issues
        newAsyncErrors.push({ id, props });
        setAsyncErrors(newAsyncErrors);
    };

    const pushAsyncErrorRef = useRef(pushAsyncError);
    pushAsyncErrorRef.current = pushAsyncError;
    const asyncErrorRenderId = useRef(0);

    const onRender = () => {
        newAsyncErrors.splice(0);
        setAsyncErrors(newAsyncErrors);
        const thisRenderId = ++asyncErrorRenderId.current;

        if (proseContainer.current) {
            handleAsyncErrors(proseContainer.current, (id, props) => {
                if (thisRenderId !== asyncErrorRenderId.current) return;
                pushAsyncErrorRef.current(id, props);
            });
        }
    };

    const errorCount = renderErrors.length + asyncErrors.length;

    return (
        <div
            className={
                'post-preview' +
                (stale ? ' is-stale' : '') +
                (config.simulateUserstyles ? ' simulate-userstyles' : '') +
                (config.darkMode ? ' dark-mode' : '')
            }
        >
            <div className="post-header">
                <RenderConfigEditor
                    hasCohostRenderer={!!cohostRenderer}
                    config={config}
                    onConfigChange={onConfigChange}
                />
                <span className="i-errors-container">
                    <button
                        ref={errorBtn}
                        className={'i-errors-button' + (errorCount ? ' has-errors' : '')}
                        disabled={!errorCount}
                        onClick={() => setErrorsOpen(true)}
                        aria-label={errorCount === 1 ? '1 error' : `${errorCount} errors`}
                    >
                        <span className="i-errors-icon">!</span>
                        <span className="i-errors-count">{errorCount}</span>
                    </button>
                    <DirPopover
                        anchor={errorBtn.current}
                        open={errorsOpen}
                        onClose={() => setErrorsOpen(false)}
                    >
                        <ErrorList errors={renderErrors.concat(asyncErrors)} />
                    </DirPopover>
                </span>
            </div>
            <hr />
            {error ? (
                <div className="prose-container p-prose-outer">
                    <div className="inner-prose p-prose is-error">
                        {error
                            .toString()
                            .split('\n')
                            .map((line, i) => (
                                <div key={i}>{line}</div>
                            ))}
                    </div>
                </div>
            ) : (
                <div className="prose-container p-prose-outer" ref={proseContainer}>
                    <DynamicStyles config={config} />
                    <MarkdownRenderer
                        renderId={renderId}
                        cohostRenderer={config.cohostRenderer ? cohostRenderer : null}
                        config={config.render}
                        markdown={markdown}
                        fallbackHtml={html}
                        readMore={readMore}
                        onReadMoreChange={onReadMoreChange}
                        errorPortal={errorPortal}
                        onRender={onRender}
                    />
                </div>
            )}
            <hr />
            <div className="post-footer">
                <PostSize size={markdown.length} />
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
        config: PreviewConfig;
        onConfigChange: (c: PreviewConfig) => void;
        readMore: boolean;
        onReadMoreChange: (b: boolean) => void;
        errorPortal: HTMLDivElement | null;
    }
}

function ErrorList({ errors }: { errors: ErrorMessage[] }) {
    const seenTypes = new Set<string>();

    return (
        <ul className="i-errors">
            {errors.map(({ id, props }, i) => {
                const Component = (ERRORS as any)[id];
                const isFirstOfType = !seenTypes.has(id.toString());
                seenTypes.add(id.toString());
                return (
                    <li className="i-error" key={'r' + i}>
                        <Component {...props} isFirstOfType={isFirstOfType} />
                    </li>
                );
            })}
        </ul>
    );
}

interface RenderConfigItem {
    short: [string | null, string] | null;
    label: string;
    description: string;
    inRender?: boolean;
    renderOnChange?: boolean;
    requiresCohostRenderer?: boolean;
}

const RENDER_CONFIG_ITEMS: { [k: string]: RenderConfigItem } = {
    cohostRenderer: {
        short: null,
        label: 'Cohost Renderer',
        description: `Uses the cohost markdown renderer (from ${COHOST_RENDERER_VERSION}). Turn this off to test with an approximate renderer that is less strict.`,
        requiresCohostRenderer: true,
    },
    hasCohostPlus: {
        short: null,
        label: 'Cohost Plus!',
        description: 'Enables Cohost Plus! features (emoji). Use this if you have Cohost Plus!',
        inRender: true,
        requiresCohostRenderer: true,
    },
    disableEmbeds: {
        short: [null, 'no embeds'],
        label: 'Disable Embeds',
        description:
            'Disables iframely embeds in the post. This is a feature in cohost settings. Though, quite frankly, it’s not very useful here.',
        inRender: true,
        requiresCohostRenderer: true,
    },
    prefersReducedMotion: {
        short: ['motion ✓', 'reduced motion'],
        label: 'Reduced Motion',
        description:
            'Disables the `spin` animation and enables the `pulse` animation. This simulates the effect of @media (prefers-reduced-motion: reduce) on cohost.',
        renderOnChange: true,
    },
    simulateUserstyles: {
        short: [null, 'userstyles ✓'],
        label: 'Simulate Userstyles',
        description:
            'Changes a bunch of colors to a dark theme, for testing the effects of some cohost userstyles.',
    },
    darkMode: {
        short: [null, 'dark mode ✓'],
        label: 'Dark Mode',
        description:
            'Switches over to cohost\'s dark mode colors.',
    }
};

function RenderConfigEditor({
    hasCohostRenderer,
    config,
    onConfigChange,
}: {
    hasCohostRenderer: boolean;
    config: PreviewConfig;
    onConfigChange: (c: PreviewConfig) => void;
}) {
    const configButton = useRef<HTMLButtonElement>(null);
    const [configOpen, setConfigOpen] = useState(false);

    const items = [];

    if (!hasCohostRenderer || !config.cohostRenderer) {
        items.push(<PreviewRenderIcon key="preview" />);
    } else if (config.render.hasCohostPlus) {
        items.push(<CohostPlusIcon key="preview" />);
    } else {
        items.push(<CohostRegularIcon key="preview" />);
    }

    for (const k in RENDER_CONFIG_ITEMS) {
        const v = RENDER_CONFIG_ITEMS[k];

        if (!v.short) continue;
        if (v.requiresCohostRenderer && (!hasCohostRenderer || !config.cohostRenderer)) continue;
        const enabled = v.inRender
            ? config.render[k as unknown as keyof RenderConfig]
            : config[k as unknown as keyof PreviewConfig];
        const label = enabled ? v.short[1] : v.short[0];
        if (!label) continue;
        items.push(
            <div className="config-preview-item" key={k}>
                {label}
            </div>
        );
    }

    return (
        <div className="render-config">
            <button
                ref={configButton}
                className="i-config-button"
                onClick={() => setConfigOpen(true)}
            >
                <svg className="config-icon" viewBox="0 0 20 20">
                    <path
                        fill="currentcolor"
                        fillRule="evenodd"
                        d="M11 2a1 1 0 0 1 1 1v1.342A5.994 5.994 0 0 1 13.9 5.439l1.163-.671a1 1 0 0 1 1.366.366l1 1.732a1 1 0 0 1-.366 1.366l-1.162.672a6.034 6.034 0 0 1 0 2.192l1.162.672a1 1 0 0 1 .366 1.366l-1 1.732a1 1 0 0 1-1.366.366l-1.163-.671A5.994 5.994 0 0 1 12 15.658V17a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-1.342A5.994 5.994 0 0 1 6.1 14.561l-1.163.671a1 1 0 0 1-1.366-.366l-1-1.732a1 1 0 0 1 .366-1.366l1.162-.672a6.034 6.034 0 0 1 0-2.192l-1.162-.672a1 1 0 0 1-.366-1.366l1-1.732a1 1 0 0 1 1.366-.366l1.163.671A5.994 5.994 0 0 1 8 4.342V3a1 1 0 0 1 1-1h2Zm-1 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Zm0 1a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
                    />
                </svg>
                {items}
            </button>
            <DirPopover
                anchor={configButton.current}
                anchorBias="left"
                open={configOpen}
                onClose={() => setConfigOpen(false)}
            >
                <RenderConfigPopover
                    hasCohostRenderer={hasCohostRenderer}
                    config={config}
                    onConfigChange={onConfigChange}
                />
            </DirPopover>
        </div>
    );
}

function RenderConfigPopover({
    hasCohostRenderer,
    config,
    onConfigChange,
}: {
    hasCohostRenderer: boolean;
    config: PreviewConfig;
    onConfigChange: (c: PreviewConfig) => void;
}) {
    const renderContext = useContext(RenderContext);

    return (
        <div className="i-config-contents">
            <div className="i-config-title">Post Preview Settings</div>
            {!hasCohostRenderer && (
                <div className="i-cohost-unavailable">
                    <div className="i-icon">
                        <PreviewRenderIcon />
                    </div>
                    <div>cohost renderer unavailable</div>
                </div>
            )}
            {Object.entries(RENDER_CONFIG_ITEMS).map(([k, v]) => {
                if (v.requiresCohostRenderer && !hasCohostRenderer) return null;
                if (k !== 'cohostRenderer' && v.requiresCohostRenderer && !config.cohostRenderer)
                    return null;
                const checkboxId = Math.random().toString(36);
                return (
                    <div className="config-item" key={k}>
                        <div className="item-header">
                            <input
                                id={checkboxId}
                                type="checkbox"
                                checked={
                                    v.inRender ? (config.render as any)[k] : (config as any)[k]
                                }
                                onChange={(e) => {
                                    const value = (e.target as HTMLInputElement).checked;
                                    const newConfig = { ...config };
                                    if (v.inRender) {
                                        newConfig.render = { ...newConfig.render, [k]: value };
                                    } else {
                                        newConfig[k as unknown as keyof PreviewConfig] =
                                            value as any;
                                    }
                                    onConfigChange(newConfig);
                                    if (v.renderOnChange) {
                                        renderContext.scheduleRender();
                                    }
                                }}
                            />{' '}
                            <label htmlFor={checkboxId}>{v.label}</label>
                        </div>
                        <div className="item-description">{v.description}</div>
                    </div>
                );
            })}
        </div>
    );
}

function DynamicStyles({ config }: { config: PreviewConfig }) {
    const div = useRef<HTMLDivElement>(null);
    const contents: string[] = [];

    if (config.prefersReducedMotion) {
        contents.push(
            `
@keyframes pulse {
  50% {
    opacity: 0.5;
  }
}
      `.trim()
        );
    } else {
        contents.push(
            `
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
      `.trim()
        );
    }

    useEffect(() => {
        if (!div.current) return;
        div.current.innerHTML = '';
        const style = document.createElement('style');
        style.innerHTML = contents.join('\n');
        div.current.append(style);
    }, [config]);

    return <div className="post-dynamic-styles" ref={div}></div>;
}

function PostSize({ size }: { size: number }) {
    const byteSize = size;

    let sizeLabel;
    if (size < 1000) {
        sizeLabel = size + ' bytes';
    } else {
        size = +(size / 1000).toFixed(2);
        if (size < 1000) {
            sizeLabel = size + ' kB';
        } else {
            size = +(size / 1000).toFixed(2);
            sizeLabel = size + ' MB';
        }
    }

    let sizeOfMax = byteSize / COHOST_APPROX_MAX_PAYLOAD_SIZE;

    return (
        <span
            className="post-size-meter"
            style={
                {
                    '--size-of-max': Math.min(1, sizeOfMax),
                } as any
            }
        >
            {sizeLabel}{' '}
            {sizeOfMax >= 1 ? (
                <span className="i-warning">probably too large</span>
            ) : sizeOfMax >= 0.95 ? (
                <span className="i-warning">close to size limit</span>
            ) : null}
        </span>
    );
}

function CopyToClipboard({ data, label, disabled }: CopyToClipboard.Props) {
    const [copied, setCopied] = useState(false);
    const [warnings, setWarnings] = useState<string[]>([]);
    const [warningsOpen, setWarningsOpen] = useState(false);

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

    const tryCopy = () => {
        const warnings = getExportWarnings(data);
        setWarnings(warnings);
        if (warnings.length) {
            setWarningsOpen(true);
        } else {
            copy();
        }
    };

    const button = useRef<HTMLButtonElement>(null);

    return (
        <>
            <button
                ref={button}
                disabled={disabled}
                className={'copy-to-clipboard' + (copied ? ' did-copy' : '')}
                onClick={tryCopy}
            >
                {label}
            </button>
            <DirPopover
                anchor={button.current}
                open={warningsOpen}
                onClose={() => setWarningsOpen(false)}
            >
                <div className="copy-to-clipboard-warnings">
                    <ul className="i-warnings">
                        {warnings.map((warning, i) => (
                            <li key={i}>{warning}</li>
                        ))}
                    </ul>
                    <div className="i-buttons">
                        <Button
                            primary
                            run={() => {
                                setWarningsOpen(false);
                            }}
                        >
                            cancel
                        </Button>
                        <Button
                            run={() => {
                                copy();
                                setWarningsOpen(false);
                            }}
                        >
                            copy anyway
                        </Button>
                    </div>
                </div>
            </DirPopover>
        </>
    );
}

namespace CopyToClipboard {
    export interface Props {
        data: string;
        label: string;
        disabled?: boolean;
    }
}
