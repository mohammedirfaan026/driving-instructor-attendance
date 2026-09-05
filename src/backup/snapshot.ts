import { getAttendance } from '../db/attendance'
import { getStudents } from '../db/students'
import type { Attendance, Student } from '../db/types'

export type Snapshot = { schemaVersion: 1; appVersion: string; createdAt: string; data: { students: Student[]; attendance: Attendance[] }; checksum: string }
const canonical = (students: Student[], attendance: Attendance[]) => JSON.stringify({ students: [...students].sort((a,b) => a.id.localeCompare(b.id)), attendance: [...attendance].sort((a,b) => a.id.localeCompare(b.id)) })
export async function sha256(value: string) { const bytes = new TextEncoder().encode(value); const hash = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(hash)].map(x => x.toString(16).padStart(2, '0')).join('') }
export async function makeSnapshot(): Promise<Snapshot> { const [students, attendance] = await Promise.all([getStudents(), getAttendance()]); const checksum = await sha256(canonical(students, attendance)); return { schemaVersion: 1, appVersion: import.meta.env.VITE_APP_VERSION || '1.0.0', createdAt: new Date().toISOString(), data: { students, attendance }, checksum } }
export async function currentDataHash() { const [students, attendance] = await Promise.all([getStudents(), getAttendance()]); return sha256(canonical(students, attendance)) }
