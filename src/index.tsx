import { createRoot } from 'react-dom/client';
import { initStorage } from './storage';
import ApplicationFrame from './ui';

let canInit = true;
{
    // check support for <dialog>
    if (!HTMLDialogElement.prototype.showModal) canInit = false;
}

if (canInit) {
    document.querySelector('#script-not-executed')?.remove();

    const container = document.createElement('div');
    container.id = 'prechoster-root';
    document.body.appendChild(container);
    const reactRoot = createRoot(container);

    initStorage()
        .then((storage) => {
            reactRoot.render(<ApplicationFrame storage={storage} />);
        })
        .catch((err) => {
            alert('Error initializing application storage\n\n' + err);
            console.error(err);
        });
}
