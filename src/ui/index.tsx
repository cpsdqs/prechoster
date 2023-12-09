import { Prechoster } from './prechoster';
import { Document } from '../document';
import { StorageContext } from '../storage-context';
import React, {
    createRef,
    forwardRef,
    PureComponent,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { deserialize, serialize, Storage } from '../storage';
import { ApplicationSidebar } from './sidebar';
import './index.css';
import {
    GraphPanelActiveIcon,
    GraphPanelIcon,
    RedoIcon,
    SidebarActiveIcon,
    SidebarIcon,
    UndoIcon,
} from './components/icons';
import { useOptHeld } from './opt-held';
import { shouldReduceMotion } from '../uikit/animation';
import { DirPopover } from '../uikit/dir-popover';
import { Button } from '../uikit/button';

let lastPrechosterInit = 0;
try {
    lastPrechosterInit = +window.sessionStorage.lastPrechosterInit || 0;
    window.sessionStorage.lastPrechosterInit = Date.now();
} catch {}

interface TabState {
    canUndo: boolean;
    canRedo: boolean;
    undo: () => void;
    redo: () => void;
    save: () => Document;
    title: string;
}

// we assign IDs to virtual documents ahead of time so that we can turn them into real documents later
const virtualIds = new WeakMap<Document, string>();

export default function ApplicationFrame({ storage }: { storage: Storage }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<any>(null);
    const [openDocs, setOpenDocs] = useState<string[]>([]);
    const [virtualOpenDoc, setVirtualOpenDoc] = useState<Document | null>(null);
    const [currentTab, setCurrentTab] = useState<string | null>(null);

    const [openFromUrl, setOpenFromUrl] = useState<string | null>(null);

    const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 1400);
    const [graphOpen, setGraphOpen] = useState(true);

    // don't render if the page was loaded twice in quick succession; possibly due to a bad render
    const shouldStartWithoutRender = useMemo(() => {
        return Date.now() - lastPrechosterInit < 5000;
    }, [openDocs, virtualOpenDoc, currentTab]);

    // --------------------------
    // MARK - document management

    const openDocument = (id: string) => {
        if (openDocs.includes(id)) return;
        setOpenDocs(openDocs.concat([id]));

        // result doesn't matter that much
        void storage.addOpenDocument(id);
    };

    const closeDocument = (id: string) => {
        if (!openDocs.includes(id)) return;
        const newOpenDocs = openDocs.slice();
        newOpenDocs.splice(newOpenDocs.indexOf(id), 1);
        setOpenDocs(newOpenDocs);
        if (currentTab === id) {
            setCurrentTab(openDocs[openDocs.indexOf(id) - 1] ?? newOpenDocs[0] ?? null);
        }

        // result doesn't matter that much
        void storage.removeOpenDocument(id);

        if (!newOpenDocs.length && !virtualOpenDoc) setSidebarOpen(true);
    };

    const realizeVirtual = (doc: Document) => {
        const id = virtualIds.get(doc);
        if (!id) throw new Error('could not realize virtual document because it has no id');
        storage.saveDocument(id, doc).then(() => {
            if (virtualOpenDoc === doc) setVirtualOpenDoc(null);
            openDocument(id);
            setCurrentTab(id);
        });
    };

    const openInitialExample = (id: string) => {
        storage
            .getExampleDocument(id)
            .then(async (doc) => {
                setVirtualOpenDoc(doc);
            })
            .catch((err) => {
                console.error('error loading example ' + id, err);
                setError(err);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    const loadOpenFromUrl = () => {
        const search = new URLSearchParams(location.search);
        setOpenFromUrl(search.get('open-url'));
    };
    const onCompleteOpenFromUrl = () => {
        // clear URL
        window.history.pushState(null, '', location.pathname);
        setOpenFromUrl(null);
    };
    const onOpenFromUrl = (doc: Document) => {
        setVirtualOpenDoc(doc);
        setCurrentTab(null);
    };

    useEffect(() => {
        // initial setup

        setLoading(true);
        storage
            .getOpenDocuments()
            .then(async (docs) => {
                if (!docs.length) {
                    if (await storage.hasAnySavedDocuments()) {
                        // user has documents already
                        setSidebarOpen(true);
                        setLoading(false);
                    } else {
                        // open default example
                        openInitialExample('default.pchost');
                    }
                } else {
                    setLoading(false);
                    setOpenDocs(docs);
                    setCurrentTab(docs[docs.length - 1]);
                }

                loadOpenFromUrl();
            })
            .catch((err) => {
                setLoading(false);
                setError(err);
            });
    }, [storage]);

    useEffect(() => {
        const onPopState = () => {
            loadOpenFromUrl();
        };
        window.addEventListener('popstate', onPopState);
        return () => window.addEventListener('popstate', onPopState);
    }, []);

    // close a document if it was deleted
    const onDeleteDocument = (event: CustomEvent) => {
        const doc = event.detail;
        if (openDocs.includes(doc)) {
            closeDocument(doc);
        }
    };
    useEffect(() => {
        storage.addEventListener('delete-document', onDeleteDocument as any);
        return () => storage.removeEventListener('delete-document', onDeleteDocument as any);
    }, [storage, onDeleteDocument]);

    // -----------------
    // MARK - tab states

    const tabStates = useMemo(() => new Map<string, TabState>(), []);
    const [, setRenderTrigger] = useState(0);

    const tabRenderOrder = useMemo<string[]>(() => [], []);
    for (const doc of openDocs) {
        if (!tabRenderOrder.includes(doc)) tabRenderOrder.push(doc);
    }
    for (const item of [...tabRenderOrder]) {
        if (!openDocs.includes(item)) {
            tabRenderOrder.splice(tabRenderOrder.indexOf(item), 1);
            tabStates.delete(item);
        }
    }

    const tabState =
        currentTab === null && virtualOpenDoc && virtualIds.has(virtualOpenDoc)
            ? tabStates.get(virtualIds.get(virtualOpenDoc)!)
            : tabStates.get(currentTab!);

    if (virtualOpenDoc && !virtualIds.has(virtualOpenDoc)) {
        virtualIds.set(virtualOpenDoc, Storage.nextDocumentId());
    }

    // ------------------
    // MARK - tab actions

    const undo = () => tabState?.undo();
    const redo = () => tabState?.redo();
    const load = (doc: Document) => {
        setVirtualOpenDoc(doc);
        setCurrentTab(null);
    };
    const save = (format?: string) => {
        if (!tabState) return;
        const doc = tabState.save();

        const title = doc.title || 'Untitled';

        const a = window.document.createElement('a');
        const file = new File([serialize(doc, format)], title, {
            type: 'application/octet-stream',
        });
        const objectURL = (a.href = URL.createObjectURL(file));
        a.download = title + '.' + (format || 'toml');
        a.click();
        URL.revokeObjectURL(objectURL);
    };

    const newFile = () => {
        load(new Document());
    };

    if (loading) {
        return (
            <div role="application" className="application-frame is-loading">
                Loading
            </div>
        );
    }
    if (error) {
        return (
            <div role="application" className="application-frame is-error">
                <div className="i-error">
                    <p>An error occurred while initializing the application.</p>
                    <pre>{error.toString()}</pre>
                    <p>
                        I don’t know what that error above might be, but I can offer you to a reset:
                        <br />
                        <button
                            onClick={() => {
                                if (!confirm('you sure?')) return;
                                storage.close();
                                const req = window.indexedDB.deleteDatabase('prechoster_data');
                                req.addEventListener('blocked', () => {
                                    alert(
                                        'oh… we’re waiting on another tab to stop using the data'
                                    );
                                });
                                req.addEventListener('error', () => {
                                    alert('could not delete data: ' + req.error);
                                });
                                req.addEventListener('success', () => {
                                    window.location.reload();
                                });
                            }}
                        >
                            delete all user data forever
                        </button>
                    </p>
                </div>
            </div>
        );
    }

    return (
        <StorageContext.Provider value={storage}>
            <div role="application" className="application-frame">
                <header className="i-toolbar" role="toolbar">
                    <div className="i-buttons">
                        <ToolbarButton
                            aria-label={sidebarOpen ? 'hide sidebar' : 'show sidebar'}
                            title={sidebarOpen ? 'hide sidebar' : 'show sidebar'}
                            className="is-icon"
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                        >
                            {sidebarOpen ? <SidebarActiveIcon /> : <SidebarIcon />}
                        </ToolbarButton>
                        <ToolbarButton
                            className="is-icon"
                            onClick={() => setGraphOpen(!graphOpen)}
                            aria-label={graphOpen ? 'hide graph' : 'show graph'}
                            title={graphOpen ? 'hide graph' : 'show graph'}
                        >
                            {graphOpen ? <GraphPanelActiveIcon /> : <GraphPanelIcon />}
                        </ToolbarButton>

                        <span className="i-section">File</span>

                        <ToolbarButton onClick={newFile}>new</ToolbarButton>
                        <LoadButton onLoad={load} />
                        <SaveButton disabled={!tabState} onSave={save} />

                        <span className="i-spacer"></span>

                        <ToolbarButton
                            aria-label="undo"
                            title="undo"
                            className="is-icon"
                            disabled={!tabState?.canUndo}
                            onClick={undo}
                        >
                            <UndoIcon />
                        </ToolbarButton>
                        <ToolbarButton
                            aria-label="redo"
                            title="redo"
                            className="is-icon"
                            disabled={!tabState?.canRedo}
                            onClick={redo}
                        >
                            <RedoIcon />
                        </ToolbarButton>
                    </div>
                    <div className="application-tabs" role="tablist">
                        {openDocs.map((doc) => (
                            <ToolbarTab
                                active={currentTab === doc}
                                state={tabStates.get(doc)}
                                key={doc}
                                id={doc}
                                onOpen={() => {
                                    setCurrentTab(doc);
                                }}
                                onClose={() => closeDocument(doc)}
                            />
                        ))}
                        {virtualOpenDoc ? (
                            <ToolbarTab
                                active={currentTab === null}
                                state={tabStates.get(virtualIds.get(virtualOpenDoc)!)}
                                id={null}
                                virtual={virtualOpenDoc}
                                onOpen={() => {
                                    setCurrentTab(null);
                                }}
                                onClose={() => {
                                    setVirtualOpenDoc(null);
                                    if (currentTab === null) {
                                        setCurrentTab(openDocs[openDocs.length - 1] ?? null);
                                    }
                                    if (!openDocs.length) setSidebarOpen(true);
                                }}
                            />
                        ) : null}
                    </div>
                </header>
                <ContentSplit
                    sidebar={
                        <ApplicationSidebar
                            currentFile={currentTab}
                            onOpen={(id) => {
                                openDocument(id);
                                setCurrentTab(id);
                            }}
                            onLoad={(doc) => {
                                setVirtualOpenDoc(doc);
                                setCurrentTab(null);
                            }}
                        />
                    }
                    sidebarOpen={sidebarOpen}
                    contents={
                        <>
                            {(tabRenderOrder as (string | null)[])
                                .concat(virtualOpenDoc ? [null] : [])
                                .map((tab) => (
                                    <ApplicationTab
                                        key={tab || virtualIds.get(virtualOpenDoc!)!}
                                        documentId={tab || undefined}
                                        virtual={tab ? undefined : virtualOpenDoc || undefined}
                                        realizeVirtual={tab ? undefined : realizeVirtual}
                                        initWithoutRender={shouldStartWithoutRender}
                                        isForeground={currentTab === tab}
                                        graphOpen={graphOpen}
                                        onUpdate={(state) => {
                                            tabStates.set(
                                                tab || virtualIds.get(virtualOpenDoc!)!,
                                                state
                                            );
                                            setRenderTrigger(Math.random());
                                        }}
                                    />
                                ))}
                            {!tabRenderOrder.length && !virtualOpenDoc ? <NoOpenDocument /> : null}
                        </>
                    }
                />
                {openFromUrl ? (
                    <OpenFromUrl
                        url={openFromUrl}
                        onOpen={onOpenFromUrl}
                        onComplete={onCompleteOpenFromUrl}
                    />
                ) : null}
            </div>
        </StorageContext.Provider>
    );
}

function OpenFromUrl({
    url,
    onOpen,
    onComplete,
}: {
    url: string;
    onOpen: (doc: Document) => void;
    onComplete: () => void;
}) {
    const parsedUrl = useMemo(() => {
        try {
            return new URL(url);
        } catch {
            return null;
        }
    }, [url]);

    const open = () => {
        return fetch(url)
            .then(async (result) => {
                if (!result.ok) throw new Error(result.status + ' ' + result.statusText);
                return await result.text();
            })
            .then((source) => {
                onOpen(deserialize(source));
                onComplete();
            });
    };

    let contents;
    if (parsedUrl) {
        contents = (
            <div className="i-dialog-contents i-valid-url">
                <h1 className="i-title">
                    Do you want to open this document from {parsedUrl.hostname}?
                </h1>
                <div className="i-url">{parsedUrl.href}</div>
                <div className="i-actions">
                    <Button run={onComplete}>cancel</Button>
                    <Button primary run={open}>
                        open
                    </Button>
                </div>
            </div>
        );
    } else {
        contents = (
            <div className="i-dialog-contents i-invalid-url">
                <h1 className="i-title">Open URL</h1>
                <div className="i-description">The provided URL is invalid.</div>
                <div className="i-url">{url}</div>
                <div className="i-actions">
                    <Button run={onComplete}>ok</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="application-open-from-url">
            <DirPopover
                anchor={[window.innerWidth / 2, 0]}
                anchorBias="above"
                open
                onClose={() => {}}
            >
                {contents}
            </DirPopover>
        </div>
    );
}

class ContentSplit extends PureComponent<ContentSplit.Props> {
    node = createRef<HTMLDivElement>();
    sidebarWasEverOpen = this.props.sidebarOpen;

    getSnapshotBeforeUpdate(prevProps: ContentSplit.Props) {
        if (prevProps.sidebarOpen !== this.props.sidebarOpen) {
            const node = this.node.current;
            if (!node) return;
            const contents = node.children[1];
            return contents.getBoundingClientRect();
        }
        return null;
    }

    componentDidUpdate(prevProps: ContentSplit.Props, prevState: {}, snapshot?: DOMRect) {
        if (snapshot) {
            const node = this.node.current;
            if (!node) return;
            if (shouldReduceMotion()) return;

            const contents = node.children[1];
            const newRect = contents.getBoundingClientRect();

            for (const anim of node.getAnimations()) anim.cancel();
            node.animate(
                [
                    { transform: `translateX(${(snapshot.left - newRect.left) / 3}px)` },
                    { transform: 'translateX(0)' },
                ],
                {
                    duration: 300,
                    easing: 'cubic-bezier(0, 0, 0, 1)',
                }
            );
        }
    }

    render() {
        if (this.props.sidebarOpen) this.sidebarWasEverOpen = true;

        return (
            <div className="i-content-split" ref={this.node}>
                <div className={'i-sidebar' + (this.props.sidebarOpen ? ' is-open' : '')}>
                    {this.sidebarWasEverOpen ? this.props.sidebar : null}
                </div>
                <div className="i-contents">{this.props.contents}</div>
            </div>
        );
    }
}

namespace ContentSplit {
    export interface Props {
        sidebar: React.ReactNode;
        sidebarOpen: boolean;
        contents: React.ReactNode;
    }
}

const ToolbarButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
    ({ children, className, ...extra }: React.ButtonHTMLAttributes<HTMLButtonElement>, ref) => {
        return (
            <button ref={ref} className={'i-toolbar-button ' + (className || '')} {...extra}>
                {children}
            </button>
        );
    }
);

function LoadButton({ onLoad }: { onLoad: (doc: Document) => void }) {
    const [hoveringWithFile, setHoveringWithFile] = useState(false);

    const loadFile = (file: File) => {
        return new Promise<void>((resolve, reject) => {
            const reader = new FileReader();
            reader.addEventListener('load', () => {
                try {
                    onLoad(deserialize(reader.result as string));
                    resolve();
                } catch (err) {
                    reject(new Error(`could not load file\n\n${err}`));
                }
            });
            reader.addEventListener('error', () => {
                reject(new Error(`could not read file\n\n${reader.error}`));
            });
            reader.readAsText(file);
        });
    };

    const onLoadDragEnter = () => {
        setHoveringWithFile(true);
    };
    const onLoadDragLeave = () => {
        setHoveringWithFile(false);
    };
    const onLoadDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };
    const load = () => {
        const input = window.document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.pchost,.toml';
        input.click();
        input.addEventListener('change', () => {
            const file = input.files![0];
            if (!file) {
                return;
            }

            loadFile(file).catch((err) => {
                alert(`Error loading file\n\n${err}`);
            });
        });
    };

    const onLoadDrop = async (e: React.DragEvent) => {
        setHoveringWithFile(false);
        e.preventDefault();

        let didRead = false;
        let errors: unknown[] = [];
        for (let i = 0; i < e.dataTransfer!.items.length; i++) {
            const item = e.dataTransfer!.items[i];

            if (item.kind === 'file') {
                try {
                    await loadFile(item.getAsFile()!);
                    didRead = true;
                    break;
                } catch (err) {
                    errors.push(err);
                }
            } else if (item.kind === 'string') {
                try {
                    const asString = await new Promise<string>((resolve) => {
                        item.getAsString(resolve);
                    });

                    onLoad(deserialize(asString));
                    didRead = true;
                    break;
                } catch (err) {
                    errors.push(new Error(`could not load data\n\n${err}`));
                }
            }
        }

        if (!didRead) {
            alert(errors.join('\n\n'));
        }
    };

    return (
        <ToolbarButton
            className={hoveringWithFile ? 'is-drop-highlighted' : ''}
            onDragEnter={onLoadDragEnter}
            onDragLeave={onLoadDragLeave}
            onDragOver={onLoadDragOver}
            onDrop={onLoadDrop}
            onClick={load}
        >
            load
        </ToolbarButton>
    );
}

function SaveButton({
    disabled,
    onSave,
}: {
    disabled: boolean;
    onSave: (format?: string) => void;
}) {
    const optHeld = useOptHeld();
    const [isMouseOver, setMouseOver] = useState(false);
    const [formatPickerOpen, setFormatPickerOpen] = useState(false);

    const save = (e: React.MouseEvent) => {
        if (e.altKey) {
            setFormatPickerOpen(true);
        } else {
            onSave();
        }
    };
    const saveAs = (format: string) => {
        onSave(format);
        setFormatPickerOpen(false);
    };

    const onMouseOver = () => setMouseOver(true);
    const onMouseOut = () => setMouseOver(false);
    const button = useRef<HTMLButtonElement>(null);

    return (
        <>
            <ToolbarButton
                ref={button}
                disabled={disabled}
                onClick={save}
                onMouseOver={onMouseOver}
                onMouseOut={onMouseOut}
            >
                {isMouseOver && optHeld ? 'save…' : 'save'}
            </ToolbarButton>
            <DirPopover
                anchor={button.current}
                open={formatPickerOpen}
                onClose={() => setFormatPickerOpen(false)}
            >
                <h1 className="i-save-formats-title">Pick Format</h1>
                <ul className="i-save-formats">
                    <li>
                        <button onClick={() => saveAs('json')}>JSON</button>
                    </li>
                    <li>
                        <button onClick={() => saveAs('pchost')}>PChost</button>
                    </li>
                    <li>
                        <button onClick={() => saveAs('toml')}>TOML</button>
                    </li>
                </ul>
            </DirPopover>
        </>
    );
}

function ToolbarTab({
    active,
    state,
    id,
    virtual,
    onOpen,
    onClose,
}: {
    active: boolean;
    state?: TabState;
    id: string | null;
    virtual?: Document;
    onOpen: () => void;
    onClose: () => void;
}) {
    const controlsId = virtual ? 'application-tab-virtual' : `application-tab-doc-${id}`;

    let tabTitle = 'Document';
    if (state) {
        tabTitle = state.title || 'Untitled';
    }

    return (
        <div
            onClick={onOpen}
            onPointerDown={onOpen}
            className={'i-tab' + (active ? ' is-active' : '')}
        >
            <div
                className="i-tab-interactable"
                tabIndex={0}
                role="tab"
                aria-selected={active}
                aria-controls={controlsId}
            >
                <span className="i-title">
                    {virtual ? <span className="i-virtual-title">{tabTitle}</span> : tabTitle}
                </span>
            </div>
            <button
                className="i-close"
                onClick={(e) => {
                    e.stopPropagation();
                    onClose();
                }}
                onPointerDown={(e) => {
                    e.stopPropagation();
                }}
                aria-label={`close tab “${tabTitle}”`}
                title={`close tab “${tabTitle}”`}
            ></button>
        </div>
    );
}

function useDocument(documentId?: string, virtual?: Document): [boolean, any, Document | null] {
    const storage = useContext(StorageContext);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<any>(null);
    const [document, setDocument] = useState<Document | null>(null);
    const [loadedDocId, setLoadedDocId] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        if (virtual) {
            setLoadedDocId(virtualIds.get(virtual) ?? null);
            setDocument(virtual);
            setLoading(false);
        } else if (documentId) {
            if (loadedDocId === documentId) {
                setLoading(false);
                return;
            }

            storage
                .getDocument(documentId)
                .then((doc) => {
                    setLoadedDocId(documentId);
                    setDocument(doc);
                    setLoading(false);
                })
                .catch((err) => {
                    console.error('error loading document ' + documentId, err);
                    setError(err);
                    setLoading(false);
                });
        }
    }, [documentId, virtual]);

    return [loading, error, document];
}

function ApplicationTab({
    documentId,
    realizeVirtual,
    virtual,
    isForeground,
    initWithoutRender,
    graphOpen,
    onUpdate,
}: {
    documentId?: string;
    realizeVirtual?: (doc: Document) => void;
    virtual?: Document;
    isForeground: boolean;
    initWithoutRender: boolean;
    graphOpen: boolean;
    onUpdate: (state: TabState) => void;
}) {
    const storage = useContext(StorageContext);
    const [loading, error, document] = useDocument(documentId, virtual);

    const tabNode = useRef<HTMLDivElement>(null);
    useEffect(() => {
        // inert appears to not be supported by react
        if (tabNode.current) (tabNode.current as any).inert = !isForeground;
    }, [isForeground]);

    const hasScheduledSave = useRef(false);
    const scheduledDocument = useRef(document);
    scheduledDocument.current = document;

    const scheduleSave = () => {
        if (hasScheduledSave.current) return;
        hasScheduledSave.current = true;

        setTimeout(() => {
            hasScheduledSave.current = false;

            if (documentId && scheduledDocument.current) {
                // TODO: show status
                storage.saveDocument(documentId, scheduledDocument.current);
            }
        }, 1000);
    };

    const scheduleSaveRef = useRef(scheduleSave);
    scheduleSaveRef.current = scheduleSave;

    const update = () => {
        if (!document) return;
        onUpdate({
            canUndo: document.canUndo,
            canRedo: document.canRedo,
            undo: () => document.undo(),
            redo: () => document.redo(),
            save: () => document,
            title: document.title,
        });
    };

    useEffect(() => {
        if (document) {
            update();
            const onChange = () => {
                update();

                if (realizeVirtual) {
                    realizeVirtual(document);
                } else {
                    scheduleSaveRef.current();
                }
            };

            document.addEventListener('change', onChange);
            return () => document.removeEventListener('change', onChange);
        }
    }, [document]);

    let contents = null;
    if (!loading && error) {
        contents = (
            <div className="i-contents is-error">
                <p>{error.toString()}</p>
                {error.source ? (
                    <>
                        <p>The source file is shown below</p>
                        <pre>
                            {error.source.split('\n').map((line: string, i: number) => (
                                <div className="i-line" key={i}>
                                    <div className="i-gutter">{i + 1}</div>
                                    <div className="i-contents">{line}</div>
                                </div>
                            ))}
                        </pre>
                    </>
                ) : null}
            </div>
        );
    } else if (loading || document) {
        contents = (
            <div className="i-contents">
                {document ? (
                    <Prechoster
                        document={document}
                        initWithoutRender={initWithoutRender}
                        graphOpen={graphOpen}
                    />
                ) : null}
                {loading ? (
                    <div className="i-loading">
                        <div className="i-loading-contents">
                            <div className="i-loading-icon" />
                            <div className="i-loading-label">Loading</div>
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    return (
        <div
            id={virtual ? 'application-tab-virtual' : `application-tab-doc-${documentId}`}
            aria-expanded={isForeground}
            aria-hidden={!isForeground}
            className={'application-tab' + (isForeground ? ' is-foreground' : ' is-background')}
            ref={tabNode}
        >
            {contents}
        </div>
    );
}

function NoOpenDocument() {
    return (
        <div className="application-no-open-document">
            <div className="i-contents">
                <div className="i-nothing">nothing here</div>
                <img
                    src={new URL('../../assets/no-data.svg', import.meta.url).toString()}
                    alt="confused shark"
                    role="presentation"
                    draggable={false}
                />
                <h3>
                    you can open something from the{' '}
                    <span className="i-inline-icon">
                        <SidebarIcon />
                    </span>{' '}
                    sidebar
                </h3>
            </div>
        </div>
    );
}
