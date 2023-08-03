import { DBSchema, IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';
import { Document, Module, JsonValue, UnloadedPlugin, ModuleId } from '../../document';
import { parse as parseON, stringify as stringifyON } from './onv1';
import { deserializeV0 } from './v0';

interface SerializedModuleV1 {
    data: JsonValue;
}
interface SerializedDocumentV1 {
    modules: SerializedModuleV1[];
}

export function serializeV1(doc: Document): string {
    const modules = [];
    const moduleIndices = new Map<ModuleId, number>();
    for (let i = 0; i < doc.modules.length; i++) {
        moduleIndices.set(doc.modules[i].id, i);
    }
    for (const module of doc.modules) {
        const sends = [];
        const namedSends: Record<string, string[]> = {};

        for (const target of module.sends) {
            if (target === 'output') {
                sends.push('output');
                continue;
            }
            const targetIndex = moduleIndices.get(target);
            if (targetIndex !== undefined) sends.push(targetIndex);
        }
        for (const [target, name] of module.namedSends) {
            const targetIndex = moduleIndices.get(target);
            if (targetIndex !== undefined) {
                namedSends[targetIndex] = [...name];
            }
        }

        const modData: Record<string, JsonValue> = {
            plugin: module.plugin.id,
            data: module.data,
        };
        if (sends.length) modData.sends = sends;
        if (Object.keys(namedSends).length) modData.namedSends = namedSends;
        if (module.graphPos) modData.graphPos = [module.graphPos.x, module.graphPos.y];

        modules.push(modData);
    }

    const docData: Record<string, JsonValue> = {
        version: 1,
        modules,
    };
    if (doc.title) docData.title = doc.title;
    if (doc.titleInPost) docData.titleInPost = doc.titleInPost;

    return stringifyON(docData);
}

export function deserializeV1(input: string): Document {
    let data;
    try {
        // no real way to distinguish whether it's JSON or not. try JSON first, then V1 object notation
        data = JSON.parse(input);
    } catch {}
    if (!data) data = parseON(input);

    if (!data.version) {
        return deserializeV0(data);
    }

    if (data.version !== 1) throw new Error(`unknown file version ${data.version}`);

    const moduleIdAssignments = new Map<number, ModuleId>();
    for (let i = 0; i < data.modules.length; i++) {
        moduleIdAssignments.set(i, Module.genModuleId());
    }

    const doc = new Document();
    const docModules = [];
    for (let i = 0; i < data.modules.length; i++) {
        const moduleData = data.modules[i];
        const module = new Module(new UnloadedPlugin(moduleData.plugin, doc), moduleData.data);

        module.id = moduleIdAssignments.get(i)!;

        if (moduleData.sends) {
            module.sends = moduleData.sends
                .map((index: number | string) => {
                    if (index === 'output') {
                        return 'output';
                    } else {
                        return moduleIdAssignments.get(index as number);
                    }
                })
                .filter((x: ModuleId | undefined) => x);
        }

        if (moduleData.namedSends) {
            for (const k in moduleData.namedSends) {
                const target = moduleIdAssignments.get(+k);
                if (!target) continue;
                module.namedSends.set(target, new Set(moduleData.namedSends[k]));
            }
        }

        if (moduleData.graphPos) {
            module.graphPos = { x: moduleData.graphPos[0], y: moduleData.graphPos[1] };
        }

        docModules.push(module);
    }

    doc.init({
        title: data.title || '',
        titleInPost: data.titleInPost || false,
        modules: docModules,
    });

    return doc;
}

export interface SchemaV1 extends DBSchema {
    documents: {
        key: string;
        value: {
            id: string;
            title: string;
            data: string;
            dateModified: string;
        };
        indexes: {
            byDateModified: string;
        };
    };
    openDocuments: {
        key: string;
        value: {
            id: string;
        };
    };
}

const legacyLocalStorageName = 'prechosterDocument';

export async function migrateV1(
    db: IDBPDatabase<SchemaV1>,
    trans: IDBPTransaction<SchemaV1, StoreNames<SchemaV1>[], 'versionchange'>
) {
    const documents = db.createObjectStore('documents');
    documents.createIndex('byDateModified', 'dateModified');

    db.createObjectStore('openDocuments', { keyPath: 'id' });

    if (window.localStorage[legacyLocalStorageName]) {
        try {
            const doc = deserializeV0(JSON.parse(window.localStorage[legacyLocalStorageName]));
            const docKey = 'v0Document';

            await trans.objectStore('documents').put(
                {
                    id: docKey,
                    title: doc.title,
                    data: serializeV1(doc),
                    dateModified: new Date().toISOString(),
                },
                docKey
            );
            await trans.objectStore('openDocuments').put({ id: docKey });
        } catch (err) {
            console.error('Error migrating V0 data', err);
        }
    }
}

export function nextDocumentIdV1(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
}
