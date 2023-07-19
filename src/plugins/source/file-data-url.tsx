import { createRef, PureComponent } from 'react';
import { ModulePlugin, ModulePluginProps, PlainTextData } from '../../document';
import './file-data.less';

export type FileDataUrlPluginData = {
    url: string;
};

class FileDataUrlEditor extends PureComponent<ModulePluginProps<FileDataUrlPluginData>> {
    fileInput = createRef<HTMLInputElement>();

    onFile = () => {
        const fileInput = this.fileInput.current! as HTMLInputElement;
        if (fileInput.files!.length) {
            const fileReader = new FileReader();
            fileReader.onload = () => {
                this.props.onChange({ url: fileReader.result as string });
            };
            fileReader.readAsDataURL(fileInput.files![0]);
        }
    };

    render() {
        const { data, onChange } = this.props;
        const typeMatch = data.url.match(/^data:(.+?);/);
        const type = typeMatch ? typeMatch[1] : '';
        let preview = null;

        if (type.startsWith('text/')) {
            const contents = atob(data.url.split(',')[1]);
            if (contents) {
                preview = <textarea readOnly>{contents}</textarea>;
            } else {
                preview = <span />;
            }
        } else if (type.startsWith('image/')) {
            preview = <img src={data.url} />;
        }

        if (!preview) {
            preview = `(no preview for ${type})`;
        }

        return (
            <div className="plugin-file-data-editor">
                <input ref={this.fileInput} type="file" onChange={this.onFile} />
                <div className="file-preview">{preview}</div>
            </div>
        );
    }
}

export default {
    id: 'source.file-data-url',
    acceptsInputs: false,
    acceptsNamedInputs: false,
    component: FileDataUrlEditor as unknown, // typescript cant figure it out
    initialData(): FileDataUrlPluginData {
        return { url: 'data:text/plain;base64,' };
    },
    description() {
        return 'File as data URL';
    },
    async eval(data: FileDataUrlPluginData) {
        return new PlainTextData(data.url);
    },
} as ModulePlugin<FileDataUrlPluginData>;
