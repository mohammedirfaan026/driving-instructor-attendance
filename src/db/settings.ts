import { db } from './db'
export async function getSetting<T>(key: string): Promise<T | undefined> { return (await db.settings.get(key))?.value as T | undefined }
export async function setSetting(key: string, value: unknown) { await db.settings.put({ key, value }) }
