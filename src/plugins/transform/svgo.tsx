import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import { ModulePlugin, ModulePluginProps, PlainTextData, Data } from '../../document';
// @ts-ignore
import { optimize } from 'svgo/dist/svgo.browser';

export type SvgoData = {};

function Svgo({ data, onChange }: ModulePluginProps<SvgoData>) {
    return null;
}

export default {
    id: 'transform.svgo',
    acceptsInputs: true,
    acceptsNamedInputs: false,
    component: Svgo as unknown,
    initialData() {
        return {};
    },
    description() {
        return 'SVG Optimizer';
    },
    async eval(data: SvgoData, inputs: Data[]) {
        let svgInput = '';
        if (inputs.length > 1) throw new Error('cannot use SVGO with multiple inputs');
        for (const input of inputs) {
            let data;
            if ((data = input.into(PlainTextData))) {
                svgInput += data.contents;
            } else {
                throw new Error('svg received input that is not text');
            }
        }

        const result = optimize(svgInput, {
            multipass: true,
            plugins: [{ name: 'preset-default' }],
        });
        if (result.error) {
            throw new Error(`SVGO error: ${result.error}\n\n(in svg ${svgInput.slice(0, 50)}…)`);
        }

        return new PlainTextData(result.data);
    },
} as ModulePlugin<SvgoData>;
