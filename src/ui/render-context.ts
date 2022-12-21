import { createContext } from 'preact/compat';

export const RenderContext = createContext({
    scheduleRender: () => {},
});
