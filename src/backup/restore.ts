import { db } from '../db/db'
import type { Attendance, Student } from '../db/types'
import { currentDataHash, makeSnapshot, sha256, type Snapshot } from './snapshot'
import { gunzip } from './compression'

export type RestorePreview = { snapshot: Snapshot; studentCount: number; attendanceCount: number }
const validStudent = (x: unknown): x is Student => !!x && typeof x === 'object' && typeof (x as Student).id === 'string' && typeof (x as Student).name === 'string' && typeof (x as Student).phone === 'string' && Number.isFinite((x as Student).total) && typeof (x as Student).archived === 'boolean' && typeof (x as Student).createdAt === 'string'
const validAttendance = (x: unknown): x is Attendance => !!x && typeof x === 'object' && typeof (x as Attendance).id === 'string' && typeof (x as Attendance).studentId === 'string' && Number.isFinite((x as Attendance).number) && typeof (x as Attendance).completedAt === 'string'
export async function validateBackup(file: Blob): Promise<RestorePreview> {
  const value: unknown = JSON.parse(await gunzip(file)); const s = value as Snapshot
  if (s?.schemaVersion !== 1 || !s.data || !Array.isArray(s.data.students) || !Array.isArray(s.data.attendance) || typeof s.checksum !== 'string' || !s.data.students.every(validStudent) || !s.data.attendance.every(validAttendance)) throw new Error('Invalid backup format')
  const canonical = JSON.stringify({ students: [...s.data.students].sort((a,b)=>a.id.localeCompare(b.id)), attendance: [...s.data.attendance].sort((a,b)=>a.id.localeCompare(b.id)) })
  if (await sha256(canonical) !== s.checksum) throw new Error('Backup checksum does not match')
  return { snapshot: s, studentCount: s.data.students.length, attendanceCount: s.data.attendance.length }
}
export async function replaceWithBackup(preview: RestorePreview) {
  const safety = await makeSnapshot()
  await db.transaction('rw', db.students, db.attendance, async () => { await db.students.clear(); await db.attendance.clear(); await db.students.bulkPut(preview.snapshot.data.students); await db.attendance.bulkPut(preview.snapshot.data.attendance); if (await db.students.count() !== preview.studentCount || await db.attendance.count() !== preview.attendanceCount) throw new Error('Restore verification failed') })
  return safety
}
