import { db } from './db'
import { getSetting, setSetting } from './settings'
import type { Attendance, Student } from './types'

type LegacyRecord = { id?: unknown; kind?: unknown; name?: unknown; phone?: unknown; total?: unknown; archived?: unknown; createdAt?: unknown; studentId?: unknown; number?: unknown; completedAt?: unknown }
function legacyRecords(): Promise<LegacyRecord[]> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('attendance-ledger')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const legacy = request.result
      if (!legacy.objectStoreNames.contains('records')) { legacy.close(); resolve([]); return }
      const read = legacy.transaction('records', 'readonly').objectStore('records').getAll()
      read.onerror = () => { legacy.close(); reject(read.error) }
      read.onsuccess = () => { legacy.close(); resolve(read.result as LegacyRecord[]) }
    }
  })
}
const isStudent = (x: LegacyRecord): x is LegacyRecord & Student => x.kind === 'students' && typeof x.id === 'string' && typeof x.name === 'string' && typeof x.phone === 'string' && typeof x.total === 'number' && typeof x.archived === 'boolean' && typeof x.createdAt === 'string'
const isAttendance = (x: LegacyRecord): x is LegacyRecord & Attendance => x.kind === 'attendance' && typeof x.id === 'string' && typeof x.studentId === 'string' && typeof x.number === 'number' && typeof x.completedAt === 'string'

/** Copies, rather than alters, the original store. A marker is written only after count verification. */
export async function migrateLegacyData() {
  if (await getSetting<boolean>('legacyMigrationComplete')) return
  const records = await legacyRecords()
  const students: Student[] = records.filter(isStudent).map(({ id, name, phone, total, archived, createdAt }) => ({ id, name, phone, total, archived, createdAt }))
  const attendance: Attendance[] = records.filter(isAttendance).map(({ id, studentId, number, completedAt }) => ({ id, studentId, number, completedAt }))
  if (!records.length) { await setSetting('legacyMigrationComplete', true); return }
  await db.transaction('rw', db.students, db.attendance, db.settings, async () => {
    if (await db.students.count() || await db.attendance.count()) return
    await db.students.bulkPut(students)
    await db.attendance.bulkPut(attendance)
    if (await db.students.count() !== students.length || await db.attendance.count() !== attendance.length) throw new Error('Legacy migration verification failed')
    await db.settings.put({ key: 'legacyMigrationComplete', value: true })
    await db.settings.put({ key: 'schemaVersion', value: 1 })
  })
}
