import { h } from 'preact';
import { Fragment, PureComponent, useRef, useState } from 'preact/compat';
import { Document } from '../document';
import { Popover } from './components/popover';
import './examples.less';

interface ExamplesProps {
    document: Document;
}

export function Examples({ document }: ExamplesProps) {
    const button = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);

    return (
        <Fragment>
            <button ref={button} onClick={() => setOpen(true)}>
                examples
            </button>
            <Popover open={open} onClose={() => setOpen(false)} anchor={button.current}>
                <ExamplesMenu document={document} onClose={() => setOpen(false)} />
            </Popover>
        </Fragment>
    );
}

interface MenuState {
    loading: boolean;
    loadingExample: boolean;
    error: any;
    items: { [k: string]: ExampleDef };
}
interface ExampleDef {
    title: string;
    description: string;
}

class ExamplesMenu extends PureComponent<ExamplesProps & { onClose: () => void }, MenuState> {
    state = {
        loading: false,
        loadingExample: false,
        error: null,
        items: {} as { [k: string]: ExampleDef },
    };

    componentDidMount() {
        this.load();
    }

    load() {
        this.setState({ loading: true, items: {}, error: null });
        (async () => {
            const res = await fetch(new URL('../assets/examples/index.json', import.meta.url));
            if (!res.ok) throw await res.text();
            return await res.json();
        })()
            .then((items) => {
                this.setState({ loading: false, items }, () => {
                    this.forceUpdate(); // for some reason setState doesn't update here...?
                });
            })
            .catch((error) => {
                this.setState({ loading: false, error }, () => {
                    this.forceUpdate(); // ditto
                });
            });
    }

    loadExample(id: string) {
        this.setState({ loadingExample: true });
        (async () => {
            const res = await fetch(new URL(`../assets/examples/${id}`, import.meta.url));
            if (!res.ok) throw await res.text();
            return await res.json();
        })()
            .then((data) => {
                this.setState({ loadingExample: false });
                this.props.document.cloneFrom(Document.deserialize(data));
                this.props.onClose();
            })
            .catch((error) => {
                this.setState({ loadingExample: false });
                alert('Could not load example\n' + error.toString());
            });
    }

    render() {
        let contents;
        if (this.state.loading) {
            contents = <div class="i-loading">Loading…</div>;
        } else if (this.state.error) {
            contents = (
                <div class="i-error">
                    <div class="i-error-text">
                        Could not load examples
                        <br />
                        {(this.state.error as any).toString()}
                    </div>
                    <div class="i-retry-container">
                        <button onClick={() => this.load()}>try again</button>
                    </div>
                </div>
            );
        } else {
            contents = (
                <ul class={'i-items' + (this.state.loadingExample ? ' is-loading-example' : '')}>
                    {Object.entries(this.state.items).map(([id, item]) => (
                        <ExampleItem id={id} item={item} onLoad={() => this.loadExample(id)} />
                    ))}
                </ul>
            );
        }

        return (
            <div class="examples-menu">
                <div class="i-header">
                    <h1 class="i-title">Examples</h1>
                    <div class="i-description">
                        Load an example document (note that this will overwrite your current
                        document!)
                    </div>
                </div>
                {contents}
            </div>
        );
    }
}

function ExampleItem({ id, item, onLoad }: { id: string; item: ExampleDef; onLoad: () => void }) {
    return (
        <li class="i-example-item">
            <div class="i-details">
                <div class="i-title">{item.title}</div>
                <div class="i-description">{item.description}</div>
            </div>
            <div class="i-actions">
                <button class="i-load-button" onClick={onLoad}>
                    load
                </button>
            </div>
        </li>
    );
}
