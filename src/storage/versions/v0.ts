import { Document, SerValue, Module, UnloadedPlugin } from '../../document';

export function deserializeV0(_data: SerValue) {
    const data = _data as any; // just assume it's fine

    const doc = new Document();
    const modules = data.modules.map((module: SerValue) => deserializeModule(doc, module));
    doc.init({
        title: '',
        titleInPost: false,
        modules,
    });
    return doc;
}
function deserializeModule(document: Document, _data: SerValue) {
    // just assume it's fine
    const data = _data as any;

    const module = new Module(new UnloadedPlugin(data.pluginId, document), data.data);
    module.id = data.id;
    module.sends = data.sends;
    for (const k in data.namedSends) {
        module.namedSends.set(k, new Set(data.namedSends[k]));
    }
    if (data.graphPos) {
        module.graphPos = { x: data.graphPos[0], y: data.graphPos[1] };
    }
    return module;
}
