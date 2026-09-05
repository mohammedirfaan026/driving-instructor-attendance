import { db } from './db'
import type { Student } from './types'
export const getStudents = () => db.students.toArray()
export const saveStudent = (student: Student) => db.students.put(student)
export async function deleteStudentAndAttendance(id: string) { await db.transaction('rw', db.students, db.attendance, async () => { await db.attendance.where('studentId').equals(id).delete(); await db.students.delete(id) }) }
