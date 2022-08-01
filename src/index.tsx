import { h, render } from 'preact';
import { Document, Module, AnyModule, JsonValue, MOD_OUTPUT } from './document';
import { MODULES } from './plugins';
import Prechoster from './ui';

let canInit = true;
{
    // check support for <dialog>
    if (!HTMLDialogElement.prototype.showModal) canInit = false;
}

const localStorageName = 'prechosterDocument';

async function init() {
    try {
        if (window.localStorage[localStorageName]) {
            return Document.deserialize(JSON.parse(window.localStorage[localStorageName]));
        }
    } catch {
        console.warn('could not read document from local storage');
    }

    const res = await fetch(new URL('../assets/examples/default.json', import.meta.url));
    if (!res.ok) throw new Error(await res.text());
    const result = await res.json();
    return Document.deserialize(result);
}

if (canInit) {
    document.querySelector('#script-not-executed')?.remove();

    const container = document.createElement('div');
    container.id = 'prechoster-root';
    document.body.appendChild(container);

    init().then(doc => {
        let scheduledSave = false;
        const scheduleSave = () => {
            if (scheduledSave) return;
            scheduledSave = true;
            setTimeout(() => {
                scheduledSave = false;
                try {
                    window.localStorage[localStorageName] = JSON.stringify(doc.serialize());
                } catch {}
            }, 1000);
        };

        doc.addEventListener('change', () => {
            scheduleSave();
        });

        render(<Prechoster document={doc} />, container);
    }).catch(err => {
        alert('Error during initialization\n\n' + err);
        console.error(err);
    });
}
