import { useContext, useEffect, useState } from 'react';
import { Document } from '../document';
import { StorageContext } from '../storage-context';
import { Button } from '../uikit/button';
import './examples.css';

interface ExamplesProps {
    onLoad: (doc: Document) => void;
}

interface ExampleDef {
    title: string;
    description: string;
}

export function ExamplesMenu({ onLoad }: ExamplesProps) {
    const [loading, setLoading] = useState(false);
    const [loadingExample, setLoadingExample] = useState(false);
    const [error, setError] = useState<any>(null);
    const [items, setItems] = useState<Record<string, ExampleDef>>({});
    const storage = useContext(StorageContext);

    const load = () => {
        setLoading(true);
        setItems({});
        setError(null);

        (async () => {
            const res = await fetch(new URL('../../assets/examples/index.json', import.meta.url));
            if (!res.ok) throw await res.text();
            return await res.json();
        })()
            .then((items) => {
                setLoading(false);
                setItems(items);
            })
            .catch((error) => {
                setLoading(false);
                setError(error);
            });
    };
    useEffect(() => {
        load();
    }, []);

    const loadExample = (id: string) => {
        setLoadingExample(true);
        return storage
            .getExampleDocument(id)
            .then((doc) => {
                onLoad(doc);
            })
            .catch((err) => {
                throw new Error(`Error loading example: ${err?.message || err}`);
            })
            .finally(() => {
                setLoadingExample(false);
            });
    };

    let contents;
    if (loading) {
        contents = <div className="i-loading">Loading…</div>;
    } else if (error) {
        contents = (
            <div className="i-error">
                <div className="i-error-text">
                    Could not load examples
                    <br />
                    {error.toString()}
                </div>
                <div className="i-retry-container">
                    <button onClick={() => load()}>try again</button>
                </div>
            </div>
        );
    } else {
        contents = (
            <ul className={'i-items' + (loadingExample ? ' is-loading-example' : '')}>
                {Object.entries(items).map(([id, item]) => (
                    <ExampleItem key={id} item={item} onLoad={() => loadExample(id)} />
                ))}
            </ul>
        );
    }

    return (
        <div className="examples-menu" role="group" aria-label="Examples and Templates">
            <div className="i-header">
                <h2 className="i-title">Examples and Templates</h2>
                <p className="i-description">see how you can do things!</p>
            </div>
            {contents}
        </div>
    );
}

function ExampleItem({ item, onLoad }: { item: ExampleDef; onLoad: () => Promise<void> }) {
    return (
        <li className="i-example-item">
            <div className="i-inner" role="group" aria-label={item.title}>
                <div className="i-details">
                    <div className="i-title">{item.title}</div>
                    <div className="i-description">{item.description}</div>
                </div>
                <div className="i-actions">
                    <Button className="i-load-button" run={onLoad}>
                        open
                    </Button>
                </div>
            </div>
        </li>
    );
}
