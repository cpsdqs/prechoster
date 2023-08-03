import { IDBPDatabase, IDBPTransaction } from 'idb';
import { deserializeV1, serializeV1, migrateV1, SchemaV1, nextDocumentIdV1 } from './v1';

export interface Schema extends SchemaV1 {}

export const deserialize = deserializeV1;
export const serialize = serializeV1;
export const nextDocumentId = nextDocumentIdV1;

type MigrateFn = (
    db: IDBPDatabase<any>,
    transaction: IDBPTransaction<any, any, 'versionchange'>
) => void;
const MIGRATIONS: MigrateFn[] = [() => {}, migrateV1];

export async function migrate(
    db: IDBPDatabase,
    oldVersion: number,
    newVersion: number,
    transaction: IDBPTransaction<any, any, 'versionchange'>
) {
    let version = oldVersion;
    while (version < newVersion) {
        version++;
        console.log('running migrations for version ' + version);
        await MIGRATIONS[version](db, transaction);
    }
}
