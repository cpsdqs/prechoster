import { IDBPCursorWithValue, IDBPDatabase, IDBPObjectStore, openDB } from 'idb';
import { deserialize, migrate, Schema, serialize, nextDocumentId } from './versions';
import { Document } from '../document';

export async function initStorage(): Promise<Storage> {
    let oldVersion = null;
    const newVersion = 1;
    const db = await openDB<Schema>('prechoster_data', newVersion, {
        async upgrade(database: IDBPDatabase<any>, old, _, transaction) {
            console.log(`upgrade database ${old} → ${newVersion}`);
            oldVersion = old;
            await migrate(database, old, newVersion, transaction);
        },
        blocking(currentVersion: number, blockedVersion: number | null) {
            if (blockedVersion! > currentVersion) {
                // whatever, just reload
                window.location.reload();
            }
        },
    });

    return new Storage(db);
}

export { deserialize, serialize };
export const V1_FILE_EXT = 'pchost';

export interface DocumentInfo {
    id: string;
    title: string;
    dateModified: string;
}

export class Storage extends EventTarget {
    db: IDBPDatabase<Schema>;

    constructor(db: IDBPDatabase<Schema>) {
        super();
        this.db = db;
    }

    async getOpenDocuments(): Promise<string[]> {
        return await this.db.getAllKeys('openDocuments');
    }

    async addOpenDocument(doc: string): Promise<void> {
        await this.db.put('openDocuments', { id: doc });
        this.dispatchEvent(new CustomEvent('update-open-documents'));
    }

    async removeOpenDocument(doc: string): Promise<void> {
        await this.db.delete('openDocuments', doc);
        this.dispatchEvent(new CustomEvent('update-open-documents'));
    }

    async hasAnySavedDocuments(): Promise<boolean> {
        const res = await this.listDocumentsByDate(null, 1);
        return !!res.length;
    }

    listAllDocumentIds(): Promise<string[]> {
        return this.db
            .getAllKeysFromIndex('documents', 'byDateModified')
            .then((res) => res.reverse());
    }

    private async listDocumentsImpl(
        openCursor: (
            store: IDBPObjectStore<Schema, any, 'documents'>
        ) => Promise<IDBPCursorWithValue<Schema, any, any> | null>,
        count: number
    ): Promise<DocumentInfo[]> {
        const trans = this.db.transaction('documents');
        const cursor = await openCursor(trans.objectStore('documents'));
        if (!cursor) return [];

        const results = [];

        for (let i = 0; i < count; i++) {
            results.push({
                id: cursor.value.id,
                title: cursor.value.title,
                dateModified: cursor.value.dateModified,
            });

            if (!(await cursor.continue())) break;
        }
        return results;
    }

    listDocumentsByDate(fromDate: string | null, count: number): Promise<DocumentInfo[]> {
        return this.listDocumentsImpl(
            (store) =>
                store
                    .index('byDateModified')
                    .openCursor(fromDate ? IDBKeyRange.upperBound(fromDate, true) : null, 'prev'),
            count
        );
    }

    listDocumentsByIdInclusive(fromId: string, count: number): Promise<DocumentInfo[]> {
        return this.listDocumentsImpl(
            (store) => store.openCursor(IDBKeyRange.upperBound(fromId), 'prev'),
            count
        );
    }

    async getDocument(id: string): Promise<Document | null> {
        const docData = await this.db.get('documents', id);
        if (!docData) return null;
        return deserialize(docData.data);
    }

    async saveDocument(id: string, doc: Document) {
        await this.db.put(
            'documents',
            {
                id,
                title: doc.title,
                data: serialize(doc),
                dateModified: new Date().toISOString(),
            },
            id
        );
        this.dispatchEvent(new CustomEvent('update-documents'));
    }

    async deleteDocument(id: string) {
        await this.db.delete('documents', id);
        await this.db.delete('openDocuments', id);
        this.dispatchEvent(new CustomEvent('update-documents'));
        this.dispatchEvent(new CustomEvent('update-open-documents'));
        this.dispatchEvent(new CustomEvent('delete-document', { detail: id }));
    }

    async getExampleDocument(id: string): Promise<Document> {
        const res = await fetch(new URL(`../../assets/examples/${id}`, import.meta.url));
        if (!res.ok) throw await res.text();
        const docData = await res.text();
        return deserialize(docData);
    }

    static nextDocumentId(): string {
        return nextDocumentId();
    }

    close() {
        this.db.close();
    }
}
