import { ModulePlugin, ModulePluginProps, HtmlData, Data } from '../../document';
// @ts-ignore
import { optimize } from 'svgo/dist/svgo.browser';

export type SvgToBackgroundData = {
    useSvgo: boolean;
};

function SvgToBackground({ data, onChange }: ModulePluginProps<SvgToBackgroundData>) {
    const useSvgoId = Math.random().toString(36);

    return (
        <div>
            <div>
                <input
                    id={useSvgoId}
                    type="checkbox"
                    checked={data.useSvgo}
                    onChange={(e) => {
                        onChange({ ...data, useSvgo: (e.target as HTMLInputElement).checked });
                    }}
                />{' '}
                <label htmlFor={useSvgoId}>Use SVG Optimizer</label>
            </div>
        </div>
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
    async eval(data: SvgToBackgroundData, inputs: Data[]) {
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
        }

        return new HtmlData(body.innerHTML);
    },
} as ModulePlugin<SvgToBackgroundData>;
