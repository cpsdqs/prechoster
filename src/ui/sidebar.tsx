import './sidebar.css';
import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DocumentInfo, Storage } from '../storage';
import { Document } from '../document';
import { StorageContext } from '../storage-context';
import { ExamplesMenu } from './examples';
// @ts-ignore
import { homepage as sourceLink } from '../../package.json';
// @ts-ignore
import { gitCommitHash } from 'prechoster:config';
import { useOptHeld } from './opt-held';
import { Button } from '../uikit/button';
import { DirPopover } from '../uikit/dir-popover';
import { TextField } from '../uikit/text-field';

export function ApplicationSidebar({
    currentFile,
    onOpen,
    onLoad,
}: {
    currentFile: string | null;
    onOpen: (id: string) => void;
    onLoad: (doc: Document) => void;
}) {
    return (
        <div className="application-sidebar">
            <div className="i-header" role="group" aria-label="prechoster title">
                <div className="i-title-line">
                    <h1 className="i-title">prechoster</h1>
                    <div className="i-version">rev. {gitCommitHash}</div>
                    <a
                        className="i-source"
                        href={sourceLink}
                        target="_blank"
                        rel="nofollow noreferrer"
                    >
                        source
                    </a>
                </div>
                <p className="i-subtitle">
                    <PostName /> <span className="i-end">preprocessor</span>
                </p>
            </div>
            <div className="i-section i-files">
                <Files currentFile={currentFile} onOpen={onOpen} />
            </div>
            <div className="i-section i-examples">
                <ExamplesMenu onLoad={onLoad} />
            </div>
            <Extras />
        </div>
    );
}

const NAMES_FOR_POSTS = [
    'chost',
    'copost',
    'bugpost',
    'cohost post',
    'cohost.org website post',
    'cohost.org online website copost',
];

function PostName() {
    const [nameIndex, setNameIndex] = useState(Math.floor(Math.random() * NAMES_FOR_POSTS.length));
    const node = useRef<HTMLSpanElement>(null);
    const [width, setWidth] = useState(0);

    useEffect(() => {
        // get initial width
        if (node.current) setWidth(node.current.offsetWidth);
    }, []);

    useLayoutEffect(() => {
        const domNode = node.current;
        if (!domNode) return;
        const nodeWidth = domNode.offsetWidth;
        const prevWidth = width;
        setWidth(nodeWidth);

        if (prevWidth) {
            for (const anim of domNode.getAnimations()) anim.cancel();
            domNode.animate([{ width: prevWidth + 'px' }, { width: nodeWidth + 'px' }], {
                duration: 200,
                easing: 'cubic-bezier(.2, .3, 0, 1)',
            });
        }
    }, [nameIndex]);

    const cycle = () => {
        setNameIndex((nameIndex + 1) % NAMES_FOR_POSTS.length);
    };

    return (
        <span className="i-post" onClick={cycle} ref={node}>
            {NAMES_FOR_POSTS[nameIndex]}
        </span>
    );
}

function Files({
    currentFile,
    onOpen,
}: {
    currentFile: string | null;
    onOpen: (id: string) => void;
}) {
    const storage = useContext(StorageContext);
    const [fileIds, setFileIds] = useState<string[]>([]);
    const [version, setVersion] = useState(0);
    const [cache, setCache] = useState(new Map<string, [number, DocumentInfo]>());

    const [isEditing, setEditing] = useState(false);

    const loadFiles = () => {
        storage.listAllDocumentIds().then((ids) => {
            setFileIds(ids);
            setVersion(version + 1);
        });
    };

    const loadState = useRef({
        scheduledBatch: false,
        nextBatch: new Set<string>(),
    });

    const requestLoad = (id: string) => {
        const state = loadState.current;
        state.nextBatch.add(id);
        if (state.scheduledBatch) return;
        setTimeout(() => {
            const state = loadState.current;

            const batch = [...state.nextBatch];
            state.nextBatch.clear();

            let maxItem = batch[0];
            for (const item of batch) {
                if (item.localeCompare(maxItem) > 0) maxItem = item;
            }

            storage.listDocumentsByIdInclusive(maxItem, 100).then((items) => {
                const newCache = new Map(cache);
                for (const item of items) {
                    newCache.set(item.id, [version, item]);
                }
                setCache(newCache);
            });

            state.scheduledBatch = false;
        }, 100);
        state.scheduledBatch = true;
    };

    useEffect(() => {
        loadFiles();
    }, []);

    useEffect(() => {
        storage.addEventListener('update-documents', loadFiles);
        return () => storage.removeEventListener('update-documents', loadFiles);
    }, [loadFiles]);

    return (
        <div className="application-files" role="group" aria-label="Local Documents">
            <div className="i-header" role="group" aria-label="Header">
                <div className="i-title-line">
                    <h2 className="i-title">Local Documents</h2>
                    <Button run={() => setEditing(!isEditing)} primary={isEditing}>
                        {isEditing ? 'done' : 'edit'}
                    </Button>
                </div>
                <p className="i-description">recent documents stored in your browser!</p>
            </div>
            <ul className="i-file-list">
                {fileIds.map((id) => {
                    const isCurrent = currentFile === id;
                    return (
                        <FileItem
                            key={id}
                            id={id}
                            onOpen={(id) => {
                                setEditing(false);
                                onOpen(id);
                            }}
                            isCurrent={isCurrent}
                            cache={cache}
                            version={version}
                            requestLoad={requestLoad}
                            isEditing={isEditing}
                        />
                    );
                })}
            </ul>
            {!fileIds.length ? <div className="i-empty">nothing found…</div> : null}
        </div>
    );
}

function FileItem({
    id,
    onOpen,
    isCurrent,
    cache,
    version,
    requestLoad,
    isEditing,
}: {
    id: string;
    onOpen: (id: string) => void;
    isCurrent: boolean;
    cache: Map<string, [number, DocumentInfo]>;
    version: number;
    requestLoad: (id: string) => void;
    isEditing: boolean;
}) {
    const storage = useContext(StorageContext);

    const optHeld = useOptHeld();
    const [isMouseOver, setMouseOver] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);

    const [isDeleting, setDeleting] = useState(false);
    const [deleteProgress, setDeleteProgress] = useState(0);

    const lastTime = useRef(Date.now());
    useEffect(() => {
        if (!isDeleting) return;
        requestAnimationFrame(() => {
            const dt = (Date.now() - lastTime.current) / 1000;
            lastTime.current = Date.now();

            const next = Math.min(deleteProgress + dt / 7, 1);
            if (next >= 1) {
                // delete
                void storage.deleteDocument(id);
            } else {
                setDeleteProgress(next);
            }
        });
    }, [isDeleting, deleteProgress]);

    const onClick = (e: React.MouseEvent) => {
        if (e.altKey) {
            setActionsOpen(true);
        } else {
            onOpen(id);
        }
    };

    const duplicate = () => {
        storage.getDocument(id).then((document) => {
            if (!document) return;

            storage.saveDocument(Storage.nextDocumentId(), document);
        });
        setActionsOpen(false);
    };

    const onMouseOver = () => setMouseOver(true);
    const onMouseOut = () => setMouseOver(false);
    const button = useRef<HTMLButtonElement>(null);

    return (
        <li
            className={
                'i-item' + (isCurrent ? ' is-selected' : '') + (isDeleting ? ' is-deleting' : '')
            }
        >
            <button
                ref={button}
                className={'i-file' + (actionsOpen ? ' actions-open' : '')}
                onClick={onClick}
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}
            >
                <FileDetails id={id} cache={cache} version={version} requestLoad={requestLoad} />
            </button>
            <DirPopover
                anchor={button.current}
                open={actionsOpen}
                onClose={() => setActionsOpen(false)}
            >
                <ul className="i-actions">
                    <li>
                        <button onClick={duplicate}>duplicate</button>
                    </li>
                </ul>
            </DirPopover>

            {isEditing ? (
                <Button
                    danger
                    className="i-delete"
                    run={() => {
                        lastTime.current = Date.now();
                        setDeleting(!isDeleting);
                        setDeleteProgress(0);
                    }}
                    loading={isDeleting}
                >
                    delete
                </Button>
            ) : null}

            {isDeleting ? (
                <div className="i-deleting">
                    <div className="i-progress" style={{ '--progress': deleteProgress } as any} />
                    <div
                        className="i-progress is-over-layer"
                        style={{ '--progress': deleteProgress } as any}
                    />
                    <div className="i-label">
                        <div className="i-back-layer" aria-hidden={true}>
                            deleting
                        </div>
                        <div className="i-front-layer">deleting</div>
                    </div>
                    <button className="i-cancel" onClick={() => setDeleting(false)}>
                        <div className="i-label">cancel</div>
                    </button>
                </div>
            ) : null}
        </li>
    );
}

function FileDetails({
    id,
    cache,
    version,
    requestLoad,
}: {
    id: string;
    cache: Map<string, [number, DocumentInfo]>;
    version: number;
    requestLoad: (id: string) => void;
}) {
    const cached = cache.get(id);
    const detailsNode = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        if (!visible) return;
        if (!cached || cached[0] !== version) requestLoad(id);
    }, [cache, cached, version, visible]);

    useEffect(() => {
        const node = detailsNode.current;
        if (!node) return;

        const iob = new IntersectionObserver((entries) => {
            const entry = entries[0];
            setVisible(entry.isIntersecting);
        });

        iob.observe(node);
        return () => iob.disconnect();
    }, [detailsNode.current]);

    if (!cached || !visible) {
        return (
            <div className="i-details" ref={detailsNode}>
                <div className="i-title">&nbsp;</div>
                <div className="i-date">&nbsp;</div>
            </div>
        );
    }
    const info = cached[1];

    return (
        <div className="i-details" ref={detailsNode}>
            <div className="i-title">{info.title || 'Untitled'}</div>
            <div className="i-date">{formatRelativeDate(new Date(info.dateModified))}</div>
        </div>
    );
}

function formatRelativeDate(date: Date): string {
    const today = new Date();
    const deltaMs = +today - +date;
    const deltaHours = deltaMs / 3600000;

    if (deltaHours < 0) return 'in the future';
    if (deltaHours < 24) {
        if (today.getDate() === date.getDate()) return 'today';
        return 'yesterday';
    }

    const deltaDays = deltaHours / 24;
    if (deltaDays < 7) {
        const v = Math.floor(deltaDays);
        return `${v} day${v === 1 ? '' : 's'} ago`;
    }

    const deltaWeeks = deltaDays / 7;
    if (deltaWeeks < 5) {
        const v = Math.floor(deltaWeeks);
        return `${v} week${v === 1 ? '' : 's'} ago`;
    }

    const todayMonthIndex = today.getFullYear() * 12 + today.getMonth();
    const dateMonthIndex = date.getFullYear() * 12 + date.getMonth();
    const deltaMonths = todayMonthIndex - dateMonthIndex;

    return `${deltaMonths} month${deltaMonths === 1 ? '' : 's'} ago`;
}

function Extras() {
    return (
        <div className="i-section i-extras" role="group" aria-label="Extras">
            <h2 className="i-title">Extras</h2>
            <ul className="i-items">
                <li>
                    <CreateShareUrl />
                </li>
            </ul>
        </div>
    );
}

function CreateShareUrl() {
    const button = useRef<Button>(null);
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState('');

    const shareUrl = new URL(location.href);
    const shareUrlParams = new URLSearchParams();
    shareUrlParams.append('open-url', url);
    shareUrl.search = shareUrlParams.toString();
    shareUrl.hash = '';

    return (
        <div className="i-create-share-url">
            <Button run={() => setOpen(true)} ref={button}>
                create shareable URL
            </Button>
            <DirPopover
                open={open}
                onClose={() => {
                    setOpen(false);
                    setUrl('');
                }}
                anchor={button.current?.node}
                anchorBias="left"
            >
                <div className="i-dialog-contents">
                    <h1>Create Shareable URL</h1>
                    <p>
                        Save your document and upload it somewhere that allows cross-origin access
                        and paste it below!
                    </p>
                    <TextField
                        value={url}
                        onChange={setUrl}
                        placeholder="e.g. https://gist.githubusercontent.com/..."
                    />
                    <p>Result:</p>
                    <TextField
                        value={shareUrl.toString()}
                        onChange={() => {}}
                        readOnly
                        onFocus={(e) => {
                            e.target.select();
                        }}
                        onPointerUp={(e) => {
                            const field = e.currentTarget;
                            requestAnimationFrame(() => {
                                field.select();
                            });
                        }}
                    />
                </div>
            </DirPopover>
            <p>
                Create a URL to a document that you can share. Requires the document to be uploaded
                somewhere.
            </p>
        </div>
    );
}
