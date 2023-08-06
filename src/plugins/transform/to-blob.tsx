import { useState } from 'react';
import {
    ModulePlugin,
    ModulePluginProps,
    ByteSliceData,
    BlobData,
    PlainTextData,
    Data,
} from '../../document';
import { Form, FormFooter, FormItem } from '../../uikit/form';
import Checkbox from '../../uikit/checkbox';
import { TextField } from '../../uikit/text-field';
import { Button } from '../../uikit/button';

export type ToBlobData = {
    mime: string;
    override?: string;
    useOverride: boolean;
};

function ToBlob({ id, data, onChange, document }: ModulePluginProps<ToBlobData>) {
    const [loading, setLoading] = useState(false);

    const mimeId = Math.random().toString(36);
    const useOverrideId = Math.random().toString(36);
    const overrideId = Math.random().toString(36);

    const download = () => {
        setLoading(true);
        document.eval(id).then((result) => {
            setLoading(false);

            if (result.type === 'output') {
                const blobUrl = (result.outputs.get(id) as BlobData).objectUrl;
                const a = window.document.createElement('a');
                a.href = blobUrl;
                a.download = '';
                a.click();

                result.drop();
            } else if (result.type === 'error') {
                alert('Could not generate file\n\n' + result.error);
            }
        });
    };

    return (
        <Form>
            <FormItem label="MIME type" itemId={mimeId}>
                <TextField
                    id={mimeId}
                    type="text"
                    placeholder="text/plain"
                    value={data.mime}
                    onChange={(mime) => {
                        onChange({ ...data, mime });
                    }}
                />
            </FormItem>
            <FormFooter>
                <span></span>
                <Button run={download} disabled={loading}>
                    download file
                </Button>
            </FormFooter>
            <hr />
            <FormItem label="Override with uploaded file" itemId={useOverrideId}>
                <Checkbox
                    id={useOverrideId}
                    checked={data.useOverride}
                    onChange={(useOverride) => {
                        onChange({ ...data, useOverride });
                    }}
                />
            </FormItem>
            {data.useOverride && (
                <FormItem label="Override URL" itemId={overrideId}>
                    <TextField
                        id={overrideId}
                        type="text"
                        placeholder="https://staging.cohostcdn.org/..."
                        value={data.override || ''}
                        onChange={(override) => {
                            const newData = { ...data };
                            if (override) newData.override = override;
                            else delete newData.override;
                            onChange(newData);
                        }}
                    />
                </FormItem>
            )}
        </Form>
    );
}

export default {
    id: 'transform.to-blob',
    acceptsInputs: true,
    acceptsNamedInputs: false,
    component: ToBlob as unknown,
    initialData() {
        return { mime: 'image/svg+xml', useOverride: false };
    },
    description() {
        return 'To blob';
    },
    async eval(data: ToBlobData, inputs: Data[]) {
        if (data.useOverride && data.override) return new PlainTextData(data.override);

        let buffers = [];
        let len = 0;
        for (const input of inputs) {
            let data;
            if ((data = input.into(ByteSliceData))) {
                buffers.push(data.contents);
                len += data.contents.byteLength;
            } else {
                throw new Error(`don’t know how to convert ${input.typeDescription()} to a blob`);
            }
        }

        const buffer = new Uint8Array(len);
        let cursor = 0;
        for (const buf of buffers) {
            buffer.set(buf, cursor);
            cursor += buf.byteLength;
        }

        return new BlobData(buffer, data.mime);
    },
} as ModulePlugin<ToBlobData>;
