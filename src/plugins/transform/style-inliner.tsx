import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import { parse as cssParse, walk as cssWalk, generate as cssGenerate } from 'css-tree';
import Specificity from '@bramus/specificity';
import { ModulePlugin, ModulePluginProps, HtmlData, CssData, Data } from '../../document';

type StyleInlinerMode = 'attr' | 'element';
export type StyleInlinerData = {
    mode: StyleInlinerMode,
};

function StyleInliner({ data, onChange }: ModulePluginProps<StyleInlinerData>) {
    return (
        <select value={data.mode} onChange={e => {
            onChange({ ...data, mode: (e.target as HTMLSelectElement).value as StyleInlinerMode });
        }}>
            <option value="attr">as style attributes</option>
            <option value="element">as a &lt;style&gt; element</option>
        </select>
    );
}

function stylesToAttrs(doc: Document) {
    const styles = [];
    for (const style of doc.querySelectorAll('style') as unknown as Iterable<Element>) {
        styles.push(style);
        style.remove();
    }

    // collect all element styles
    type StyleData = {
        // type Specificity (for some reason typescript complains when you use this type)
        specificity: any,
        decls: { [k: string]: string },
        importantDecls: { [k: string]: string },
    };
    const nodes: Map<Element, StyleData[]> = new Map();
    for (const style of styles) {
        let ast;
        try {
            ast = cssParse(style.innerHTML);
        } catch (err) {
            throw new Error('Error parsing CSS: ' + ((err as any)?.message || err));
        }

        cssWalk(ast, {
            enter(node: any) {
                // we dont know what could happen inside @-rules.
                // they definitely don't work inline, though
                if (node.type === 'Atrule') return (this as any).skip;
            },
            leave(node: any) {
                if (node.type === 'Rule') {
                    if (node.prelude.type === 'SelectorList') {
                        // collect style declarations
                        const decls: { [k: string]: string } = {};
                        const importantDecls: { [k: string]: string } = {};
                        for (const decl of node.block.children) {
                            if (decl.type === 'Declaration') {
                                const value = cssGenerate(decl.value);
                                if (decl.important) {
                                    importantDecls[decl.property] = value;
                                } else {
                                    decls[decl.property] = value;
                                }
                            } else {
                                throw new Error(`invalid CSS declaration “${cssGenerate(decl)}”`);
                            }
                        }

                        // apply declarations to selector targets
                        for (const sel of node.prelude.children) {
                            if (sel.type === 'Selector') {
                                const selText = cssGenerate(sel);
                                const specificity = Specificity.calculate(sel)[0];
                                try {
                                    for (const node of doc.querySelectorAll(selText) as unknown as Iterable<Element>) {
                                        if (!nodes.has(node)) {
                                            nodes.set(node, []);
                                        }
                                        nodes.get(node)!.push({
                                            specificity,
                                            decls,
                                            importantDecls,
                                        });
                                    }
                                } catch { /* invalid selector probably */}
                            } else {
                                throw new Error(`invalid CSS selector “${cssGenerate(sel)}”`);
                            }
                        }
                    }
                }
            },
        });
    }

    // apply styles sorted by specificity
    for (const [node, styles] of nodes) {
        const sorted = styles.slice().sort((a, b) => Specificity.compare(a.specificity, b.specificity));

        for (const item of sorted) {
            for (const [k, v] of Object.entries(item.decls)) {
                (node as HTMLElement).style.setProperty(k, v);
            }
        }
        for (const item of sorted) {
            for (const [k, v] of Object.entries(item.importantDecls)) {
                (node as HTMLElement).style.setProperty(k, v);
            }
        }
    }
}

function stylesToBody(doc: Document) {
    const styles = [];
    for (const style of doc.querySelectorAll('style') as unknown as Iterable<Element>) {
        styles.push(style);
        style.remove();
    }

    const styleText = styles.map(style => style.innerHTML).join('\n');
    const styleEl = document.createElement('style');
    styleEl.innerHTML = styleText;

    if (doc.body.children.length === 1 && doc.body.children[0].tagName === 'svg') {
        doc.body.children[0].append(styleEl);
    } else {
        doc.body.append(styleEl);
    }
}

export default {
    id: 'transform.style-inliner',
    acceptsInputs: true,
    acceptsNamedInputs: false,
    component: StyleInliner as unknown,
    initialData() {
        return { mode: 'attr' };
    },
    description() {
        return 'Style Inliner';
    },
    async eval(data: StyleInlinerData, inputs: Data[]) {
        let htmlInput = '';
        let cssInput = '';
        for (const input of inputs) {
            let data;
            if (data = input.into(HtmlData)) {
                htmlInput += data.contents;
            } else if (data = input.into(CssData)) {
                cssInput += data.contents;
            } else {
                throw new Error('style inliner received input that is neither html nor css');
            }
        }

        const htmlSource = [
            '<!doctype html><html><head><style>',
            cssInput,
            '</style></head><body>',
            htmlInput,
            '</body></html>',
        ].join('');
        const doc = new DOMParser().parseFromString(htmlSource, 'text/html');

        if (data.mode === 'attr') {
            stylesToAttrs(doc);

            // cleanup for cohost
            // TODO: this should probably be a separate module
            for (const node of doc.querySelectorAll('[class]') as unknown as Iterable<Element>) {
                node.removeAttribute('class');
            }
        } else if (data.mode === 'element') {
            stylesToBody(doc);
        }
        return new HtmlData(doc.body.innerHTML);
    },
} as ModulePlugin<StyleInlinerData>;
