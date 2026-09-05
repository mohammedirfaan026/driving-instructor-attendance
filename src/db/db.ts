import Dexie, { type Table } from 'dexie'
import type { Attendance, Setting, Student } from './types'

export class AttendanceDatabase extends Dexie {
  students!: Table<Student, string>
  attendance!: Table<Attendance, string>
  settings!: Table<Setting, string>
  constructor() {
    super('attendance-ledger-dexie')
    this.version(1).stores({ students: 'id, archived, createdAt', attendance: 'id, studentId, completedAt', settings: 'key' })
  }
}
export const db = new AttendanceDatabase()
