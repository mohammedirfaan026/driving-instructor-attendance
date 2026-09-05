export type Student = { id: string; name: string; phone: string; total: number; archived: boolean; createdAt: string }
export type Attendance = { id: string; studentId: string; number: number; completedAt: string }
export type Setting = { key: string; value: unknown }
