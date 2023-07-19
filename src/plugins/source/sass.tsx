import { PureComponent } from 'react';
import {
    ModulePlugin,
    ModulePluginProps,
    Data,
    NamedInputData,
    PlainTextData,
    CssData,
    Class,
} from '../../document';
import { CodeEditor } from '../../ui/components/code-editor';
import { sass as cmSass } from '@codemirror/lang-sass';
import { compileString, Importer, ImporterResult, Syntax } from 'sass';

export class SassModuleData extends PlainTextData {
    typeId = 'sass';
    syntax: Syntax;

    constructor(contents: string, syntax: Syntax) {
        super(contents);
        this.syntax = syntax;
    }

    typeDescription() {
        return 'Sass';
    }

    into<T extends Data>(type: Class<T>): T | null {
        if (this instanceof type) {
            return this as unknown as T;
        }
        if (type === (CssData as Class<unknown> as Class<T>)) {
            const result = compileString(this.contents);
            return new CssData(result.css) as unknown as T;
        }
        return super.into(type);
    }
}

export type SassPluginData = {
    contents: string;
    syntax: Syntax;
};

function extensionForSyntax(syntax: Syntax): string {
    switch (syntax) {
        case 'scss':
            return 'scss';
        case 'indented':
            return 'sass';
        case 'css':
            return 'css';
    }
}

class SassEditor extends PureComponent<ModulePluginProps<SassPluginData>> {
    memoizedExtensions: any = null;

    get extensions() {
        if (!this.memoizedExtensions) {
            this.memoizedExtensions = [
                cmSass({
                    indented: this.props.data.syntax === 'indented',
                }),
            ];
        }
        return this.memoizedExtensions;
    }

    render() {
        const { data, onChange } = this.props;

        const footer = (
            <div className="i-footer">
                <span>
                    <label>Mode:</label>
                    <select
                        value={data.syntax}
                        onChange={(e) => {
                            this.memoizedExtensions = null;
                            onChange({ ...data, syntax: e.target.value as any });
                        }}
                    >
                        <option value="scss">SCSS</option>
                        <option value="indented">Indented</option>
                    </select>
                </span>
            </div>
        );

        return (
            <div className="plugin-less-editor">
                <CodeEditor
                    value={data.contents}
                    onChange={(contents) => onChange({ ...data, contents })}
                    extensions={this.extensions}
                    footer={footer}
                />
            </div>
        );
    }
}

function sassImporter(namedInputs: NamedInputData): Importer {
    const modules: Map<string, ImporterResult> = new Map();
    for (const [name, value] of namedInputs) {
        let data;
        if ((data = value.into(SassModuleData))) {
            const fileName = `${name}.${extensionForSyntax(data.syntax)}`;
            if (modules.has(fileName)) throw new Error(`duplicate input ${fileName}`);
            modules.set(fileName, { contents: data.contents, syntax: data.syntax });
        } else if ((data = value.into(CssData))) {
            const fileName = `${name}.css`;
            if (modules.has(fileName)) throw new Error(`duplicate input ${fileName}`);
            modules.set(fileName, { contents: data.contents, syntax: 'css' });
        } else if ((data = value.into(PlainTextData))) {
            const fileName = `${name}`;
            if (modules.has(fileName)) throw new Error(`duplicate input ${fileName}`);
            modules.set(fileName, {
                contents: `$value: ${JSON.stringify(data.contents)};`,
                syntax: 'scss',
            });
        } else {
            throw new Error(`don’t know how to deal with input ${name} of type ${value.typeId}`);
        }
    }

    return {
        canonicalize(url: string): URL | null {
            return new URL(url);
        },
        load(canonicalUrl: URL): ImporterResult | null {
            const path = canonicalUrl.pathname.substring(1);
            return modules.get(path) || null;
        },
    };
}

export default {
    id: 'source.sass',
    acceptsInputs: false,
    acceptsNamedInputs: true,
    component: SassEditor as unknown, // typescript cant figure it out
    initialData(): SassPluginData {
        return { contents: '', syntax: 'scss' };
    },
    description(data: SassPluginData) {
        if (data.syntax === 'scss') return 'SCSS';
        return 'Sass';
    },
    async eval(data: SassPluginData, inputs: Data[], namedInputs: NamedInputData) {
        // don't collide with user variables for the entry point
        const entryName = `sass-source-${Math.random().toString(36).replace(/[^\w]/g, '')}`;
        const entryUrl = new URL(`file:///${entryName}.${extensionForSyntax(data.syntax)}`);

        const result = compileString(data.contents, {
            importer: sassImporter(namedInputs),
            url: entryUrl,
            syntax: data.syntax,
        });
        return new CssData(result.css);
    },
} as ModulePlugin<SassPluginData>;

export const sassModule = {
    id: 'source.sass-module',
    acceptsInputs: false,
    acceptsNamedInputs: false,
    component: SassEditor as unknown, // typescript cant figure it out
    initialData(): SassPluginData {
        return { contents: '', syntax: 'scss' };
    },
    description(data: SassPluginData) {
        if (data.syntax === 'scss') return 'SCSS Module';
        return 'Sass Module';
    },
    async eval(data: SassPluginData) {
        return new SassModuleData(data.contents, data.syntax);
    },
} as ModulePlugin<SassPluginData>;
