import { h, createRef, AnyComponent } from 'preact';
import { PureComponent, useState, useRef } from 'preact/compat';
import {
    Document,
    Module,
    ModuleId,
    AnyModule,
    JsonValue,
    ModulePlugin,
    ModulePluginProps,
    NamedSends,
    MOD_OUTPUT,
} from '../../document';
import { ModulePicker } from './module-picker';
import './module-list.less';

type ModuleSelection = {
    selected: ModuleId | null,
    inputs: ModuleId[],
    namedInputs: Map<ModuleId, Set<string>>,
    sends: ModuleId[],
    namedSends: Map<ModuleId, Set<string>>,
};
const NONE_SELECTION: ModuleSelection = {
    selected: null,
    inputs: [],
    namedInputs: new Map(),
    sends: [],
    namedSends: new Map(),
};
interface ModuleListState {
    selection: ModuleSelection;
}

export class ModuleList extends PureComponent<ModuleList.Props, ModuleListState> {
    state = {
        selection: NONE_SELECTION,
    };
    list = createRef();

    select(mod: ModuleId | null) {
        if (!mod) {
            this.setState({ selection: NONE_SELECTION });
            return;
        }
        const module = this.props.document.findModule(mod);
        if (!module) {
            this.setState({ selection: NONE_SELECTION });
            return;
        }
        const sends = module.sends;
        const namedSends = module.namedSends;
        const { inputs, namedInputs: namedInputsRev } = this.props.document.findModuleInputIds(mod);

        const namedInputs = new Map();
        for (const [key, modId] of namedInputsRev) {
            if (!namedInputs.has(modId)) namedInputs.set(modId, new Set());
            namedInputs.get(modId)!.add(key);
        }

        this.setState({
            selection: {
                selected: mod,
                inputs,
                namedInputs,
                sends,
                namedSends,
            },
        });
    }

    componentDidMount() {
        this.props.document.addEventListener('change', this.onDocumentChange);
        this.select(this.props.selected);
    }
    componentDidUpdate(prevProps: ModuleList.Props) {
        if (this.props.document !== prevProps.document) {
            prevProps.document.removeEventListener('change', this.onDocumentChange);
            this.props.document.addEventListener('change', this.onDocumentChange);
        }
        if (this.props.selected !== prevProps.selected) {
            this.select(this.props.selected);

            if (this.props.selected) {
                const node = this.list.current!.querySelector(`.module-item[data-id="${this.props.selected}"]`);
                if (node && node.scrollIntoView) {
                    node.scrollIntoView({
                        behavior: 'smooth',
                        block: 'nearest',
                    });
                }
            }
        }
    }
    componentWillUnmount() {
        this.props.document.removeEventListener('change', this.onDocumentChange);
    }

    onDocumentChange = () => {
        this.forceUpdate();
    };

    render({ document }: ModuleList.Props) {
        return (
            <div class="module-list" ref={this.list}>
                {document.modules.map((module, i) => <ModuleItem
                    index={i}
                    selection={this.state.selection}
                    document={document}
                    module={module}
                    onSelect={() => this.props.onSelect(module.id)}
                    onChange={m => {
                        // TODO: history coalescion
                        document.beginChange();
                        const modules = document.modules.slice();
                        modules[i] = m;
                        document.setModules(modules);
                    }}
                    onMove={delta => {
                        document.beginChange();
                        const modules = document.modules.slice();
                        const tmp = modules[i + delta];
                        modules[i + delta] = module;
                        modules[i] = tmp;
                        document.setModules(modules);
                    }}
                    onRemove={() => document.removeModule(module.id)} />)}
                <AddModule onAdd={module => {
                    document.beginChange();
                    document.setModules(document.modules.concat([module]));
                }} />
            </div>
        );
    }
}
namespace ModuleList {
    export interface Props {
        document: Document;
        selected: ModuleId | null;
        onSelect: (m: ModuleId | null) => void;
    }
}

function AddModule({ onAdd }: { onAdd: (m: AnyModule) => void }) {
    const [open, setOpen] = useState(false);
    const button = useRef<HTMLElement>();

    return (
        <div class="add-module">
            <button ref={button as any} onClick={() => setOpen(true)} aria-label="add module" />
            <ModulePicker
                anchor={button.current}
                open={open}
                onClose={() => setOpen(false)}
                onPick={plugin => {
                    onAdd(new Module(plugin));
                    setOpen(false);
                }} />
        </div>
    );
}

function ModuleItem({ document, index, module, onSelect, onChange, onMove, onRemove, selection }: ModuleItem.Props) {
    const Editor = module.plugin.component as any; // typescript is yelling at me :(

    let className = 'module-item';
    if (selection.selected === module.id) className += ' is-selected';
    if (selection.inputs.includes(module.id)) className += ' is-sending-to-selected';
    if (selection.sends.includes(module.id)) className += ' is-receiving-selected';

    return (
        <div class={className} onPointerDown={onSelect} data-id={module.id}>
            <header class="i-header">
                <div class="i-title">
                    <button class="i-remove" onClick={onRemove} aria-label="close" />
                    <span class="i-index">{index + 1}</span>
                    <span class="i-label">{module.plugin.description(module.data)}</span>
                </div>
                <div class="i-move-controls">
                    <button class="i-move-button" onClick={() => onMove(-1)}>▲</button>
                    <button class="i-move-button" onClick={() => onMove(1)}>▼</button>
                </div>
            </header>
            <div class="i-editor">
                <Editor
                    data={module.data}
                    namedInputKeys={new Set(document.findModuleInputIds(module.id).namedInputs.keys())}
                    onChange={(data: JsonValue) => {
                        const mod = module.shallowClone();
                        mod.data = data;
                        onChange(mod);
                    }} />
            </div>
            <footer class="i-footer">
                <ModuleSends
                    document={document}
                    sends={module.sends}
                    onChange={sends => {
                        const newModule = module.shallowClone();
                        newModule.sends = sends;
                        onChange(newModule);
                    }} />
                <ModuleNamedSends
                    document={document}
                    namedSends={module.namedSends}
                    onChange={namedSends => {
                        const newModule = module.shallowClone();
                        newModule.namedSends = namedSends;
                        onChange(newModule);
                    }} />
            </footer>
        </div>
    );
}
namespace ModuleItem {
    export interface Props {
        document: Document;
        index: number;
        module: AnyModule;
        onSelect: () => void;
        onChange: (m: AnyModule) => void;
        onMove: (delta: number) => void;
        onRemove: () => void;
        selection: ModuleSelection;
    }
}

function ModuleSends({ document, sends, onChange }: ModuleSends.Props) {
    const makeModuleSelect = (key: string, value: ModuleId | null, onChange: (v: ModuleId) => void) => {
        return (
            <select
                class="send-target"
                key={key}
                value={value || ''}
                onChange={e => onChange((e.target as HTMLSelectElement).value)}>
                <option value="">—</option>
                {document.modules.map((mod, i) => {
                    if (!mod.plugin.acceptsInputs) return null;

                    const label = `${i + 1}. ${mod.plugin.description(mod.data)}`;
                    return <option value={mod.id}>{label}</option>;
                }).filter(x => x)}
                <option value={MOD_OUTPUT}>output</option>
            </select>
        );
    };

    return (
        <div class="i-sends">
            <div class="i-label">Send to</div>
            <ul class="i-list">
                {sends.map((target, i) => (
                    <li class="i-send-target">
                        {makeModuleSelect(i.toString(), target, newTarget => {
                            const newSends = sends.slice();
                            if (newTarget) newSends[i] = newTarget;
                            else newSends.splice(i, 1);
                            onChange(newSends);
                        })}
                    </li>
                ))}
                <li class="i-send-target is-new-target">
                    {makeModuleSelect(
                        (sends.length + 1).toString(),
                        null,
                        newTarget => newTarget && onChange(sends.concat([newTarget]),
                    ))}
                </li>
            </ul>
        </div>
    );
}
namespace ModuleSends {
    export interface Props {
        document: Document;
        sends: ModuleId[];
        onChange: (v: ModuleId[]) => void;
    }
}

function ModuleNamedSends({ document, namedSends, onChange }: ModuleNamedSends.Props) {
    const makeModuleSelect = (key: string, value: ModuleId | null, onChange: (v: ModuleId) => void) => {
        return (
            <select
                class="send-target"
                key={key}
                value={value || ''}
                onChange={e => onChange((e.target as HTMLSelectElement).value)}>
                <option value="">—</option>
                {document.modules.map((mod, i) => {
                    if (!mod.plugin.acceptsNamedInputs) return null;

                    const label = `${i + 1}. ${mod.plugin.description(mod.data)}`;
                    return <option value={mod.id}>{label}</option>;
                }).filter(x => x)}
            </select>
        );
    };

    // FIXME: this is super hacky and bad
    return (
        <div class="i-sends">
            <div class="i-label">Provide to</div>
            <ul class="i-list">
                {[...namedSends.keys()].map((target, i) => (
                    <li class="i-send-target">
                        {makeModuleSelect(i.toString(), target, newTarget => {
                            const newSends = new Map(namedSends);
                            if (newTarget) {
                                const value = newSends.get(target)!;
                                newSends.set(newTarget, value);
                            }
                            newSends.delete(target);
                            onChange(newSends);
                        })}
                        {' as '}
                        <input
                            value={[...namedSends.get(target)!][0]}
                            onChange={e => {
                                const input = e.target as HTMLInputElement;
                                const newSends = new Map(namedSends);
                                newSends.set(target, new Set([input.value]));
                                onChange(newSends);
                            }} />
                    </li>
                ))}
                <li class="i-send-target is-new-target">
                    {makeModuleSelect(
                        (namedSends.size + 1).toString(),
                        null,
                        newTarget => {
                            if (newTarget) {
                                const newSends = new Map(namedSends);
                                newSends.set(newTarget, new Set());
                                onChange(newSends);
                            }
                        },
                    )}
                </li>
            </ul>
        </div>
    );
}
namespace ModuleNamedSends {
    export interface Props {
        document: Document;
        namedSends: NamedSends;
        onChange: (v: NamedSends) => void;
    }
}
