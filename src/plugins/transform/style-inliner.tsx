import { h } from 'preact';
import { PureComponent } from 'preact/compat';
import { parse as cssParse, walk as cssWalk, generate as cssGenerate } from 'css-tree';
import Specificity from '@bramus/specificity';
import { ModulePlugin, ModulePluginProps, HtmlData, CssData, Data } from '../../document';

export type StyleInlinerData = {};

function StyleInliner() {
    return null;
}

export default {
    id: 'transform.style-inliner',
    acceptsInputs: true,
    acceptsNamedInputs: false,
    component: StyleInliner as unknown,
    initialData() {
        return {};
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
        const body = doc.body;

        const styles = [];
        for (const style of doc.querySelectorAll('style') as unknown as Iterable<Element>) {
            styles.push(style);
            style.remove();
        }

        type StyleData = {
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
                    // we dont know what could happen
                    if (node.type === 'Atrule') return (this as any).skip;
                },
                leave(node: any) {
                    if (node.type === 'Rule') {
                        if (node.prelude.type === 'SelectorList') {
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

                            for (const sel of node.prelude.children) {
                                if (sel.type === 'Selector') {
                                    const selText = cssGenerate(sel);
                                    const specificity = Specificity.calculate(sel)[0];
                                    try {
                                        for (const node of body.querySelectorAll(selText) as unknown as Iterable<Element>) {
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

        // cleanup for cohost
        for (const node of body.querySelectorAll('[class]') as unknown as Iterable<Element>) {
            node.removeAttribute('class');
        }

        return new HtmlData(body.innerHTML);
    },
} as ModulePlugin<StyleInlinerData>;
