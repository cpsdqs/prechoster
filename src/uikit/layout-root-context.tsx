import { createContext } from 'react';

export const LayoutRootContext = createContext<{ current: HTMLElement | null }>({
    current: document.body,
});
