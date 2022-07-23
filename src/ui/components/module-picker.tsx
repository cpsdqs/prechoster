import { h } from 'preact';
import { Popover } from './popover';
import { ModuleDef, MODULES } from '../../plugins';
import { ModulePlugin } from '../../document';
import './module-picker.less';

export function ModulePicker({ open, anchor, onClose, onPick }: ModulePicker.Props) {
    return (
        <Popover
            open={open}
            onClose={onClose}
            anchor={anchor}>
            <div class="module-picker-items">
                {Object.keys(MODULES).map(moduleId =>
                <Module module={MODULES[moduleId]} onPick={async () => {
                    onPick(await MODULES[moduleId].load());
                }} />)}
            </div>
            <div>gonna have to add more of these…</div>
        </Popover>
    );
}
namespace ModulePicker {
    export interface Props {
        open: boolean;
        anchor?: HTMLElement | null;
        onClose: () => void;
        onPick: (m: ModulePlugin<unknown>) => void;
    }
}

function Module({ module, onPick }: { module: ModuleDef, onPick: () => void }) {
    return (
        <div class="module-picker-item">
            <div class="i-details">
                <h3>{module.title}</h3>
                <p>{module.description}</p>
            </div>
            <button class="i-add-button" onClick={onPick}></button>
        </div>
    );
}
