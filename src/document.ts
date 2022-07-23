import { AnyComponent } from 'preact';

export interface ShallowClone {
    shallowClone(): this;
}

type DocEvalState = {
    steps: number,
    asyncCache: Map<ModuleId, Promise<Data>>,
    cache: Map<ModuleId, Data>,
};

export const MAX_EVAL_STEPS = 1024;
export const MAX_HISTORY_LEN = 300;
export const MOD_OUTPUT: ModuleId = 'output';

export class Document extends EventTarget {
    history: Module<unknown>[][] = [[]];
    historyCursor = 0;

    get modules() {
        return this.history[this.historyCursor];
    }

    get canUndo() {
        return this.historyCursor > 0;
    }
    get canRedo() {
        return this.historyCursor < this.history.length - 1;
    }
    undo() {
        if (this.canUndo) {
            this.historyCursor--;
            this.emitChange();
        }
    }
    redo() {
        if (this.canRedo) {
            this.historyCursor++;
            this.emitChange();
        }
    }

    beginChange() {
        this.history.splice(this.historyCursor + 1);
        while (this.history.length > MAX_HISTORY_LEN) {
            this.history.shift();
            this.historyCursor--;
        }
        this.history.push(this.modules.slice());
        this.historyCursor++;
    }
    emitChange() {
        this.dispatchEvent(new CustomEvent('change'));
    }
    setModules(modules: Module<unknown>[]) {
        if (!modules) throw new Error('setModules argument missing');
        this.history[this.historyCursor] = modules;
        this.emitChange();
    }

    removeModule(moduleId: ModuleId) {
        const modules = this.modules.slice();
        const index = modules.findIndex(module => module.id === moduleId);
        if (index === -1) return;

        this.beginChange();
        modules.splice(index, 1);

        for (let i = 0; i < modules.length; i++) {
            if (modules[i].sends.includes(moduleId) || modules[i].namedSends.has(moduleId)) {
                modules[i] = modules[i].shallowClone();
                if (modules[i].sends.includes(moduleId)) {
                    modules[i].sends.splice(modules[i].sends.indexOf(moduleId), 1);
                }
                modules[i].namedSends.delete(moduleId);
            }
        }

        this.setModules(modules);
    }

    /** Lazily evaluates the output of the given module. */
    cacheEvalModule<T>(mod: Module<T>, state: DocEvalState) {
        if (!state.cache.has(mod.id)) {
            if (++state.steps > MAX_EVAL_STEPS) throw new Error('exceeded max eval step limit');

            const { inputs, namedInputs } = this.evalModuleInputs(mod.id, state);
            state.asyncCache.set(mod.id, (async () => {
                const resInputs = await Promise.all(inputs);
                const resNamedInputs = new Map();
                for (const [k, v] of namedInputs) {
                    resNamedInputs.set(k, await v);
                }
                const output = await mod.plugin.eval(mod.data, resInputs, resNamedInputs);
                state.cache.set(mod.id, output);
                return output;
            })());
        }
        return state.asyncCache.get(mod.id)!;
    }

    findModule(id: ModuleId) {
        return this.modules.find(mod => mod.id === id);
    }

    findModuleInputIds(id: ModuleId) {
        const inputs = [];
        const namedInputs = new Map();
        for (const mod of this.modules) {
            if (mod.sends.includes(id)) {
                inputs.push(mod.id);
            }
            const names = mod.namedSends.get(id);
            if (names) {
                for (const name of names) {
                    namedInputs.set(name, mod.id);
                }
            }
        }
        return { inputs, namedInputs };
    }

    /** Evaluates all inputs for a given module ID. */
    evalModuleInputs(id: ModuleId, state: DocEvalState) {
        const inputs = [];
        const namedInputs = new Map();
        for (const mod of this.modules) {
            for (const item of mod.sends) {
                if (item === id) {
                    inputs.push(this.cacheEvalModule(mod, state));
                }
            }
            const names = mod.namedSends.get(id);
            if (names) {
                for (const name of names) {
                    namedInputs.set(name, this.cacheEvalModule(mod, state));
                }
            }
        }
        return { inputs, namedInputs };
    }

    wantsDebounce(): boolean {
        for (const mod of this.modules) if (mod.plugin.wantsDebounce) return true;
        return false;
    }

    /** Evaluates the final output of this document. */
    async eval(): Promise<{ inputs: Data[], nodes: Map<ModuleId, Data> }> {
        const cache = new Map();
        const { inputs } = this.evalModuleInputs(MOD_OUTPUT, {
            steps: 0,
            asyncCache: new Map(),
            cache,
        });
        return {
            inputs: await Promise.all(inputs),
            nodes: cache,
        };
    }

    /** Calls eval() and converts it to one markdown string. */
    async evalMdOutput(): Promise<{ markdown: string, nodes: Map<ModuleId, Data> }> {
        const { inputs, nodes } = await this.eval();
        const markdown = inputs.map((item, i) => {
            const output = item.asMdOutput();
            if (output === null) {
                throw new Error('output received data type that could not be converted to markdown: '
                    + item.constructor.name + ` (item ${i + 1})`);
            }
            return output;
        }).join('\n');

        return { markdown, nodes };
    }
}

export class Module<T> implements ShallowClone {
    /** The module ID; used to refer to this module from elsewhere. */
    id: ModuleId = Module.genModuleId();
    /** The data for this module plugin. */
    data: T;
    /** The plugin that's handling this module. */
    plugin: ModulePlugin<T>;
    /** Specifies where the module data will be sent. */
    sends: ModuleId[] = [];
    /** Specifies where the module data will be sent as a named input. */
    namedSends: NamedSends = new Map();

    static genModuleId(): string {
        const bytes = window.crypto.getRandomValues(new Uint8Array(8));
        return [...bytes].map(x => ('00' + x.toString(16)).substr(-2)).join('');
    }

    constructor(plugin: ModulePlugin<T>, data = plugin.initialData()) {
        this.plugin = plugin;
        this.data = data;
    }

    shallowClone(): this {
        const mod = new Module(this.plugin, this.data);
        mod.id = this.id;
        mod.sends = this.sends;
        mod.namedSends = this.namedSends;
        return mod as this;
    }
}

export type ModuleId = string;

export type NamedSends = Map<ModuleId, Set<string>>;
export type NamedInputData = Map<string, Data>;

export interface ModulePlugin<T> {
    /** Unique plugin ID. */
    id: string;

    acceptsInputs: boolean;
    acceptsNamedInputs: boolean;

    wantsDebounce?: boolean;

    /** The component that renders the GUI for this module. */
    component: AnyComponent<ModulePluginProps<T>, any>;

    /** Returns a default initial value. */
    initialData(): T;

    /** Returns a text description of the module. */
    description(data: T): string;

    eval(data: T, inputs: Data[], namedInputs: NamedInputData): Promise<Data>;
}

export interface ModulePluginProps<T> {
    data: T;
    namedInputKeys: Set<string>;
    onChange: (v: T) => void;
}

type Class<T> = { new(...args: any[]): T };

export abstract class Data {
    typeId = 'NULL';

    into<T extends Data>(type: Class<T>): T | null {
        if (this instanceof type) return this as unknown as T;
        return null;
    }

    /** Converts this data to a markdown output string, if possible. */
    asMdOutput(): string | null {
        return null;
    }

    abstract typeDescription(): string;
}

export class PlainTextData extends Data {
    typeId = 'text/plain';
    contents: string;

    constructor(contents: string) {
        super();
        this.contents = contents;
    }

    typeDescription() {
        return 'text';
    }
}

export class HtmlData extends PlainTextData {
    typeId = 'text/html';
    asMdOutput() {
        return this.contents;
    }

    typeDescription() {
        return 'HTML';
    }
}

export class CssData extends PlainTextData {
    typeId = 'text/css';

    typeDescription() {
        return 'CSS';
    }
}

