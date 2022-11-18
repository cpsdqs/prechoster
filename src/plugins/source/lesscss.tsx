import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import {
    ModulePlugin,
    ModulePluginProps,
    Data,
    NamedInputData,
    PlainTextData,
    CssData,
} from '../../document';
import { CodeEditor } from '../../ui/components/code-editor';
import { css } from '@codemirror/lang-css';
import './lesscss.less';

// @ts-ignore
import Less from 'less/lib/less';
// @ts-ignore
import apl from 'less/lib/less/environment/abstract-plugin-loader';

// I have no idea what's going on here. sometimes rollup resolves it to default and sometimes it doesn’t
const AbstractPluginLoader = apl.default || apl;

const less = Less();

less.PluginLoader = function PluginLoader(less: any) {
    this.less = less;
};
less.PluginLoader.prototype = Object.assign(new AbstractPluginLoader(), {
    loadPlugin() {
        return Promise.reject('cannot load plugins!!');
    },
});

export type LessPluginData = {
    contents: string;
};

class LessEditor extends PureComponent<ModulePluginProps<LessPluginData>> {
    render({ data, namedInputKeys, onChange }: ModulePluginProps<LessPluginData>) {
        return (
            <div class="plugin-less-editor">
                {namedInputKeys.size ? (
                    <div class="less-variables">
                        <label>variables: </label>
                        {[...namedInputKeys].map((key) => (
                            <span class="less-variable" key={key}>
                                @{key}
                            </span>
                        ))}
                    </div>
                ) : null}
                <CodeEditor
                    value={data.contents}
                    onChange={(contents) => onChange({ ...data, contents })}
                    extensions={[css()]}
                />
            </div>
        );
    }
}

export default {
    id: 'source.lesscss',
    acceptsInputs: false,
    acceptsNamedInputs: true,
    component: LessEditor as unknown, // typescript cant figure it out
    initialData(): LessPluginData {
        return { contents: '' };
    },
    description() {
        return 'LessCSS';
    },
    async eval(data: LessPluginData, inputs: Data[], namedInputs: NamedInputData) {
        const variables: { [k: string]: any } = {};
        for (const [k, v] of namedInputs) {
            const plain = v.into(PlainTextData);
            if (!plain) {
                throw new Error(`could not convert named input “${k}” to plain text`);
            }
            variables[k] = {
                eval: () => ({
                    value: plain.contents.trim(),
                    genCSS: (context: any, output: any) => output.add(plain.contents.trim()),
                    toCSS: () => plain.contents.trim(),
                }),
            };
        }

        const result = await less.render(data.contents, { variables });
        return new CssData(result.css);
    },
} as ModulePlugin<LessPluginData>;
