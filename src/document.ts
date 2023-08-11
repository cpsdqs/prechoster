import { Component, FunctionComponent } from 'react';
import { MODULES } from './plugins';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };

type DocEvalState = {
    steps: number;
    asyncCache: Map<ModuleId, Promise<Data>>;
    cache: Map<ModuleId, Data>;
    userData: Map<ModuleId, UserData>;
};

export type UserData = Record<string, unknown>;

export const MAX_EVAL_STEPS = 1024;
export const MAX_HISTORY_LEN = 300;
export const MOD_OUTPUT: ModuleId = 'output';

export enum ChangeType {
    Load = 'load',
    AddModule = 'add module',
    RemoveModule = 'remove module',
    UpdateModule = 'update module',
    RearrangeModules = 'rearrange modules',
    SetTitle = 'set title',
}

type HistoryChangeDesc =
    | {
          type: ChangeType.UpdateModule;
          module: ModuleId;
      }
    | {
          type: ChangeType.Load;
      }
    | {
          type: ChangeType.RemoveModule;
      }
    | {
          type: ChangeType.AddModule;
      }
    | {
          type: ChangeType.RearrangeModules;
      }
    | {
          type: ChangeType.SetTitle;
      };

const HISTORY_COALESION_TIME_MS = 5000;

function shouldCoalesceChanges(a: HistoryChangeDesc, b: HistoryChangeDesc) {
    if (a.type === ChangeType.UpdateModule && b.type === ChangeType.UpdateModule) {
        if (a.module === b.module) return true;
    }
    if (a.type === ChangeType.SetTitle && a.type === b.type) return true;
    return false;
}

interface HistoryEntry {
    state: DocumentState;
    desc: HistoryChangeDesc;
    time: number;
}

export interface DocumentState {
    title: string;
    titleInPost: boolean;
    modules: AnyModule[];
}

export class Document extends EventTarget {
    history: HistoryEntry[] = [
        {
            state: { title: '', titleInPost: false, modules: [] },
            desc: { type: ChangeType.Load },
            time: Date.now(),
        },
    ];
    historyCursor = 0;

    init(state: DocumentState) {
        if (this.history.length > 1) throw new Error('cannot init in this state');
        this.history[0].state = state;
    }

    get state(): Readonly<DocumentState> {
        return this.history[this.historyCursor].state;
    }

    get title(): string {
        return this.state.title;
    }

    get titleInPost(): boolean {
        return this.state.titleInPost;
    }

    get modules(): Readonly<AnyModule[]> {
        return this.state.modules;
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

    pushHistoryState(state: DocumentState, desc: HistoryChangeDesc) {
        this.history.splice(this.historyCursor + 1);
        while (this.history.length > MAX_HISTORY_LEN) {
            this.history.shift();
            this.historyCursor--;
        }

        const lastItem = this.history[this.history.length - 1];
        const newItem: HistoryEntry = {
            state,
            desc,
            time: Date.now(),
        };
        if (
            lastItem &&
            shouldCoalesceChanges(lastItem.desc, newItem.desc) &&
            lastItem.time > Date.now() - HISTORY_COALESION_TIME_MS
        ) {
            newItem.time = lastItem.time;
            this.history[this.history.length - 1] = newItem;
        } else {
            this.history.push(newItem);
            this.historyCursor++;
        }

        this.emitChange();
    }

    pushModulesState(modules: AnyModule[], desc: HistoryChangeDesc) {
        return this.pushHistoryState(
            {
                title: this.title,
                titleInPost: false,
                modules,
            },
            desc
        );
    }

    emitChange() {
        this.dispatchEvent(new CustomEvent('change'));
    }

    beginBatch(): { end: () => void } {
        const pos = this.historyCursor;
        return {
            end: () => {
                if (this.historyCursor <= pos) return;
                this.history[pos] = this.history[this.historyCursor];
                this.history.splice(pos, this.historyCursor - pos);
                this.historyCursor = pos;
            },
        };
    }

    insertModule(module: AnyModule) {
        const index = this.modules.findIndex((m) => m.id === module.id);
        if (index === -1) {
            this.pushModulesState(this.modules.concat([module]), { type: ChangeType.AddModule });
            return;
        } else {
            const newModules = this.modules.slice();
            newModules[index] = module;
            this.pushModulesState(newModules, {
                type: ChangeType.UpdateModule,
                module: module.id,
            });
        }
    }

    removeModule(moduleId: ModuleId) {
        const modules = this.modules.slice();
        const index = modules.findIndex((module) => module.id === moduleId);
        if (index === -1) return;

        modules.splice(index, 1);

        for (let i = 0; i < modules.length; i++) {
            if (modules[i].sends.includes(moduleId) || modules[i].namedSends.has(moduleId)) {
                modules[i] = modules[i].shallowClone();
                if (modules[i].sends.includes(moduleId)) {
                    modules[i].sends = modules[i].sends.slice();
                    modules[i].sends.splice(modules[i].sends.indexOf(moduleId), 1);
                }
                modules[i].namedSends = new Map(modules[i].namedSends);
                modules[i].namedSends.delete(moduleId);
            }
        }

        this.pushModulesState(modules, { type: ChangeType.RemoveModule });
    }

    setTitle(title: string) {
        this.pushHistoryState(
            {
                ...this.state,
                title,
            },
            { type: ChangeType.SetTitle }
        );
    }

    /** Lazily evaluates the output of the given module. */
    cacheEvalModule<T extends JsonValue>(mod: Module<T>, state: DocEvalState) {
        if (!state.asyncCache.has(mod.id)) {
            if (++state.steps > MAX_EVAL_STEPS) throw new Error('exceeded max eval step limit');

            const { inputs, namedInputs } = this.evalModuleInputs(mod.id, state);
            state.asyncCache.set(
                mod.id,
                (async () => {
                    const resInputs = await Promise.all(inputs);
                    const resNamedInputs = new Map();
                    for (const [k, v] of namedInputs) {
                        resNamedInputs.set(k, await v);
                    }

                    try {
                        const options: EvalOptions = {
                            userData: {},
                        };
                        const output = await mod.plugin.eval(
                            mod.data,
                            resInputs,
                            resNamedInputs,
                            options
                        );
                        state.cache.set(mod.id, output);
                        state.userData.set(mod.id, options.userData);
                        return output;
                    } catch (err) {
                        throw new ModuleError(err, mod.id);
                    }
                })()
            );
        }
        return state.asyncCache.get(mod.id)!;
    }

    findModule(id: ModuleId) {
        return this.modules.find((mod) => mod.id === id);
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
    async evalOutput(): Promise<{
        inputs: Data[];
        nodes: Map<ModuleId, Data>;
        userData: Map<ModuleId, UserData>;
    }> {
        const cache = new Map();
        const userData = new Map();
        const { inputs } = this.evalModuleInputs(MOD_OUTPUT, {
            steps: 0,
            asyncCache: new Map(),
            cache,
            userData,
        });
        return {
            inputs: await Promise.all(inputs),
            nodes: cache,
            userData,
        };
    }

    /** Calls eval() and converts it to one markdown string. */
    async evalMdOutput(): Promise<{
        markdown: string;
        nodes: Map<ModuleId, Data>;
        userData: Map<ModuleId, UserData>;
    }> {
        const { inputs, nodes, userData } = await this.evalOutput();
        const markdown = inputs
            .map((item, i) => {
                const output = item.asMdOutput();
                if (output === null) {
                    throw new Error(
                        'output received data type that could not be converted to markdown: ' +
                            item.constructor.name +
                            ` (item ${i + 1})`
                    );
                }
                return output;
            })
            .join('\n');

        return { markdown, nodes, userData };
    }

    async eval(target: ModuleId | null): Promise<RenderOutput | RenderError> {
        try {
            let nodes = new Map();
            let userData = new Map();
            let mdOutput = null;
            if (!target) {
                const output = await this.evalMdOutput();
                mdOutput = output.markdown;
                nodes = output.nodes;
                userData = output.userData;
            } else {
                const module = this.findModule(target);
                if (!module) throw new Error('Invalid render target: module not found');
                await this.cacheEvalModule(module, {
                    steps: 0,
                    asyncCache: new Map(),
                    cache: nodes,
                    userData,
                });
            }

            return {
                type: 'output',
                target,
                outputs: nodes,
                markdownOutput: mdOutput,
                userData,
                drop() {
                    for (const data of this.outputs.values()) data.drop();
                },
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

    loadFrom(doc: Document) {
        this.pushHistoryState(doc.state, { type: ChangeType.Load });
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
    /** Unique render ID */
    id: string;
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
    /** Evaluated module user data */
    userData: Map<ModuleId, UserData>;

    /** Drops all resources allocated by the render output */
    drop(): void;
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
    /** Manually set location in the graph */
    graphPos: { x: number; y: number } | null = null;
    /** Customizable module title */
    title: string = '';

    static genModuleId(): string {
        const bytes = window.crypto.getRandomValues(new Uint8Array(8));
        return [...bytes].map((x) => ('00' + x.toString(16)).substr(-2)).join('');
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
        mod.graphPos = this.graphPos;
        mod.title = this.title;
        return mod as this;
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
    component: Component<ModulePluginProps<T>> | FunctionComponent<ModulePluginProps<T>>;

    /** Returns a default initial value. */
    initialData(): T;

    /** Returns a text description of the module. */
    description(data: T): string;

    eval(data: T, inputs: Data[], namedInputs: NamedInputData, options: EvalOptions): Promise<Data>;
}

export interface EvalOptions {
    userData: UserData;
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
    document: Document;
    id: ModuleId;
    data: T;
    userData: UserData;
    namedInputKeys: Set<string>;
    onChange: (v: T) => void;
}

export type Class<T> = { new (...args: any[]): T };

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

    /** Drops any resources allocated or associated with this data. */
    drop(): void {}
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
        if (type === (ByteSliceData as Class<unknown> as Class<T>)) {
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

export class BlobData extends ByteSliceData {
    typeId = 'application/blob';
    objectUrl: string;
    blob: Blob;

    constructor(contents: Uint8Array, type: string) {
        super(contents);
        this.blob = new Blob([contents], { type });
        this.objectUrl = URL.createObjectURL(this.blob);
    }

    drop() {
        URL.revokeObjectURL(this.objectUrl);
    }

    typeDescription() {
        return 'Blob';
    }

    into<T extends Data>(type: Class<T>): T | null {
        if (this instanceof type) {
            return this as unknown as T;
        }
        if (type === (PlainTextData as Class<unknown> as Class<T>)) {
            return new PlainTextData(this.objectUrl) as unknown as T;
        }
        return null;
    }
}
