import {
    ModulePlugin,
    ModulePluginProps,
    HtmlData,
    Data,
    EvalOptions,
    NamedInputData,
} from '../../document';
// @ts-ignore
import { optimize } from 'svgo/dist/svgo.browser';
import Checkbox from '../../uikit/checkbox';
import { Form, FormItem } from '../../uikit/form';
import { ModuleStatus } from '../../ui/components/module-status';

export type SvgToBackgroundData = {
    useSvgo: boolean;
};

function SvgToBackground({ data, onChange, userData }: ModulePluginProps<SvgToBackgroundData>) {
    const useSvgoId = Math.random().toString(36);

    return (
        <Form>
            <FormItem
                label="Use SVG Optimizer"
                description="Optimizes the SVG before inlining it. May cause slight artifacts."
                itemId={useSvgoId}
            >
                <Checkbox
                    id={useSvgoId}
                    checked={data.useSvgo}
                    onChange={(useSvgo) => onChange({ ...data, useSvgo })}
                />
            </FormItem>
            <ModuleStatus>
                {typeof userData.svgCount === 'number' ? (
                    <>
                        converted {userData.svgCount.toString()} &lt;svg&gt; element
                        {userData.svgCount === 1 ? '' : 's'}
                    </>
                ) : null}
            </ModuleStatus>
        </Form>
    );
}

export default {
    id: 'transform.svg-to-background',
    acceptsInputs: true,
    acceptsNamedInputs: false,
    component: SvgToBackground as unknown,
    initialData() {
        return { useSvgo: true };
    },
    description() {
        return 'SVG to backgrounds';
    },
    async eval(
        data: SvgToBackgroundData,
        inputs: Data[],
        _: NamedInputData,
        { userData }: EvalOptions
    ) {
        let htmlInput = '';
        for (const input of inputs) {
            let data;
            if ((data = input.into(HtmlData))) {
                htmlInput += data.contents;
            } else {
                throw new Error('svg to background received input that is not html');
            }
        }

        const htmlSource = [
            '<!doctype html><html><head></head><body>',
            htmlInput,
            '</body></html>',
        ].join('');
        const doc = new DOMParser().parseFromString(htmlSource, 'text/html');
        const body = doc.body;

        let svgCount = 0;
        for (const svg of doc.querySelectorAll('svg[data-background]')) {
            const parent = svg.parentNode!;

            // remove whitespace
            if (svg.nextSibling?.nodeType === 3 && !svg.nextSibling?.textContent?.trim()) {
                svg.nextSibling.remove();
            }

            svg.remove();
            svg.removeAttribute('data-background');
            if (!svg.hasAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

            let svgMarkup = svg.outerHTML;
            if (data.useSvgo) {
                const result = optimize(svgMarkup, {
                    multipass: true,
                    plugins: [{ name: 'preset-default' }],
                });
                if (result.error) {
                    throw new Error(
                        `SVGO error: ${result.error}\n\n(in svg ${svgMarkup.slice(0, 50)}…)`
                    );
                }
                svgMarkup = result.data;
            }

            const url = 'data:image/svg+xml;base64,' + btoa(`<?xml version="1.0"?>${svgMarkup}`);
            (parent as HTMLElement).style.backgroundImage = `url(${url})`;
            svgCount++;
        }

        userData.svgCount = svgCount;

        return new HtmlData(body.innerHTML);
    },
} as ModulePlugin<SvgToBackgroundData>;
