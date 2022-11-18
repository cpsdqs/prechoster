import { h } from 'preact';
import { useState } from 'preact/compat';
import { Popover } from './popover';
import { ModuleDef, MODULES } from '../../plugins';
import { ModulePlugin, JsonValue } from '../../document';
import './module-picker.less';

export function ModulePicker({ open, anchor, onClose, onPick }: ModulePicker.Props) {
    return (
        <Popover open={open} onClose={onClose} anchor={anchor}>
            <div class="module-picker-items">
                {Object.keys(MODULES).map((moduleId) => (
                    <Module
                        module={MODULES[moduleId]}
                        onPick={async () => {
                            onPick(await MODULES[moduleId].load());
                        }}
                    />
                ))}
            </div>
        </Popover>
    );
}
namespace ModulePicker {
    export interface Props {
        open: boolean;
        anchor?: HTMLElement | null;
        onClose: () => void;
        onPick: (m: ModulePlugin<JsonValue>) => void;
    }
}

function Module({ module, onPick }: { module: ModuleDef; onPick: () => void }) {
    const [titleId] = useState(Math.random().toString(36));

    return (
        <div class="module-picker-item" aria-labelledby={titleId}>
            <div class="i-details">
                <h3 id={titleId}>{module.title}</h3>
                <p>{module.description}</p>
            </div>
            <button class="i-add-button" onClick={onPick} aria-label={`Select ${module.title}`} />
        </div>
    );
}
