import { db } from './db'
import type { Attendance } from './types'
export const getAttendance = () => db.attendance.toArray()
export const saveAttendance = (record: Attendance) => db.attendance.put(record)
export const deleteAttendance = (id: string) => db.attendance.delete(id)
