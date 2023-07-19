import { Fragment, PureComponent, useRef, useState } from 'react';
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
            const res = await fetch(new URL('../../assets/examples/index.json', import.meta.url));
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
            const res = await fetch(new URL(`../../assets/examples/${id}`, import.meta.url));
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
            contents = <div className="i-loading">Loading…</div>;
        } else if (this.state.error) {
            contents = (
                <div className="i-error">
                    <div className="i-error-text">
                        Could not load examples
                        <br />
                        {(this.state.error as any).toString()}
                    </div>
                    <div className="i-retry-container">
                        <button onClick={() => this.load()}>try again</button>
                    </div>
                </div>
            );
        } else {
            contents = (
                <ul
                    className={'i-items' + (this.state.loadingExample ? ' is-loading-example' : '')}
                >
                    {Object.entries(this.state.items).map(([id, item]) => (
                        <ExampleItem key={id} item={item} onLoad={() => this.loadExample(id)} />
                    ))}
                </ul>
            );
        }

        return (
            <div className="examples-menu">
                <div className="i-header">
                    <h1 className="i-title">Examples</h1>
                    <div className="i-description">
                        Load an example document (note that this will overwrite your current
                        document!)
                    </div>
                </div>
                {contents}
            </div>
        );
    }
}

function ExampleItem({ item, onLoad }: { item: ExampleDef; onLoad: () => void }) {
    return (
        <li className="i-example-item">
            <div className="i-details">
                <div className="i-title">{item.title}</div>
                <div className="i-description">{item.description}</div>
            </div>
            <div className="i-actions">
                <button className="i-load-button" onClick={onLoad}>
                    load
                </button>
            </div>
        </li>
    );
}
