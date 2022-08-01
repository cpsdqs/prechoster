import { AnyComponent } from 'preact';
import { MODULES } from './plugins';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type DocEvalState = {
    steps: number,
    asyncCache: Map<ModuleId, Promise<Data>>,
    cache: Map<ModuleId, Data>,
};

export const MAX_EVAL_STEPS = 1024;
export const MAX_HISTORY_LEN = 300;
export const MOD_OUTPUT: ModuleId = 'output';

export class Document extends EventTarget {
    history: AnyModule[][] = [[]];
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
    setModules(modules: AnyModule[]) {
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
    cacheEvalModule<T extends JsonValue>(mod: Module<T>, state: DocEvalState) {
        if (!state.asyncCache.has(mod.id)) {
            if (++state.steps > MAX_EVAL_STEPS) throw new Error('exceeded max eval step limit');

            const { inputs, namedInputs } = this.evalModuleInputs(mod.id, state);
            state.asyncCache.set(mod.id, (async () => {
                const resInputs = await Promise.all(inputs);
                const resNamedInputs = new Map();
                for (const [k, v] of namedInputs) {
                    resNamedInputs.set(k, await v);
                }

                try {
                    const output = await mod.plugin.eval(mod.data, resInputs, resNamedInputs);
                    state.cache.set(mod.id, output);
                    return output;
                } catch (err) {
                    throw new ModuleError(err, mod.id);
                }
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
    async evalOutput(): Promise<{ inputs: Data[], nodes: Map<ModuleId, Data> }> {
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
        const { inputs, nodes } = await this.evalOutput();
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

    async eval(target: ModuleId | null): Promise<RenderOutput | RenderError> {
        try {
            let nodes = new Map();
            let mdOutput = null;
            if (!target) {
                const output = await this.evalMdOutput();
                mdOutput = output.markdown;
                nodes = output.nodes;
            } else {
                const module = this.findModule(target);
                if (!module) throw new Error('Invalid render target: module not found');
                await this.cacheEvalModule(module, {
                    steps: 0,
                    asyncCache: new Map(),
                    cache: nodes,
                });
            }

            return {
                type: 'output',
                target,
                outputs: nodes,
                markdownOutput: mdOutput,
            } as RenderOutput;
        } catch (err) {
            if (err instanceof ModuleError) {
                console.error(err.error);
                return {
                    type: 'error',
                    target,
                    source: err.source,
                    error: err.error,
                } as RenderError;
            } else {
                console.error(err);
                return {
                    type: 'error',
                    target,
                    source: null,
                    error: err,
                } as RenderError;
            }
        }
    }

    async resolveUnloaded() {
        for (const module of this.modules) {
            if (module.plugin instanceof UnloadedPlugin) {
                if (MODULES[module.plugin.id]) {
                    module.plugin = await MODULES[module.plugin.id].load();
                } else {
                    throw new Error(`Unknown plugin ${module.plugin.id}`);
                }
            }
        }
    }

    cloneFrom(doc: Document) {
        this.beginChange();
        this.setModules(doc.modules);
    }

    static deserialize(_data: JsonValue): Document {
        const data = _data as any; // just assume it's fine

        const doc = new Document();
        doc.setModules(data.modules.map((module: JsonValue) => Module.deserialize(doc, module)));
        return doc;
    }

    serialize(): JsonValue {
        return { modules: this.modules.map(module => module.serialize()) };
    }
}

class ModuleError extends Error {
    error: unknown;
    source: ModuleId;

    constructor(error: unknown, source: ModuleId) {
        super((error as any).toString());
        this.error = error;
        this.source = source;
        this.name = 'ModuleError';
    }
}

/** The render output target. null means output. */
export type RenderTarget = ModuleId | null;

export interface RenderState {
    /** Current render target. */
    target: RenderTarget;
    /** If true, we are currently rendering. */
    rendering: boolean;
    /** If true, we should render live. */
    live: boolean;
    /** Last render output */
    output: RenderOutput | null;
    /** Last render error. */
    error: RenderError | null;
}

export interface RenderOutput {
    type: 'output';
    /** The render target this was rendered for */
    target: ModuleId | null;
    /** Every module’s output */
    outputs: Map<ModuleId, Data>;
    /** The final markdown output, if the render target is the output */
    markdownOutput: string | null;
}

export interface RenderError {
    type: 'error';
    source: ModuleId | null;
    error: unknown;
}

export class Module<T extends JsonValue> {
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

    static deserialize(document: Document, _data: JsonValue): Module<JsonValue> {
        // just assume it's fine
        const data = _data as any;

        const module = new Module(new UnloadedPlugin(data.pluginId, document), data.data);
        module.id = data.id;
        module.sends = data.sends;
        for (const k in data.namedSends) {
            module.namedSends.set(k, new Set(data.namedSends[k]));
        }
        // TODO: validate sends
        return module;
    }

    serialize(): JsonValue {
        const namedSends: JsonValue = {};
        for (const [k, v] of this.namedSends) namedSends[k] = [...v];

        return {
            id: this.id,
            data: this.data,
            pluginId: this.plugin.id,
            sends: this.sends,
            namedSends,
        };
    }
}

export type ModuleId = string;
export type AnyModule = Module<JsonValue>;

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

export class UnloadedPlugin implements ModulePlugin<JsonValue> {
    id: string;
    acceptsInputs = false;
    acceptsNamedInputs = false;
    document: Document;
    constructor(id: string, document: Document) {
        this.id = id;
        this.document = document;
    }
    component() {
        return null;
    }
    initialData(): JsonValue {
        throw new Error('plugin not loaded');
    }
    description() {
        return 'Loading';
    }
    eval(): Promise<Data> {
        throw new Error('plugin not loaded');
    }
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

export class ByteSliceData extends Data {
    type = 'application/octet-stream';
    contents: Uint8Array;

    constructor(contents: Uint8Array) {
        super();
        this.contents = contents;
    }

    typeDescription() {
        return '[u8]';
    }
}

export class PlainTextData extends Data {
    typeId = 'text/plain';
    contents: string;

    constructor(contents: string) {
        super();
        this.contents = contents;
    }

    into<T extends Data>(type: Class<T>): T | null {
        if (this instanceof type) {
            return this as unknown as T;
        }
        if (type === ByteSliceData as Class<unknown> as Class<T>) {
            return new ByteSliceData(new TextEncoder().encode(this.contents)) as unknown as T;
        }
        return null;
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

export class JavascriptData extends PlainTextData {
    typeId = 'application/javascript';

    typeDescription() {
        return 'Javascript';
    }
}

