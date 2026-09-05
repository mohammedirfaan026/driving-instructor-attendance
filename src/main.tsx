import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Cloud,
  Download,
  Edit3,
  History,
  Plus,
  Search,
  Settings,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import "./styles.css";
import "./overrides.css";
import "./branding-overrides.css";
import {
  clearGoogleAccount,
  connectGoogle,
  downloadBackup,
  googleConfigured,
  listBackups,
  savedGoogleEmail,
  uploadBackup,
  type DriveBackup,
} from "./googleDrive";
import type { Attendance, Student } from "./db/types";
import {
  getStudents,
  saveStudent,
  deleteStudentAndAttendance,
} from "./db/students";
import {
  getAttendance,
  saveAttendance,
  deleteAttendance,
} from "./db/attendance";
import { migrateLegacyData } from "./db/migration";
import { getSetting, setSetting } from "./db/settings";
import { makeSnapshot, currentDataHash } from "./backup/snapshot";
import { gzip } from "./backup/compression";
import {
  replaceWithBackup,
  validateBackup,
  type RestorePreview,
} from "./backup/restore";
let driveActions: {
  email: string;
  configured: boolean;
  busy: boolean;
  connect: () => void;
  disconnect: () => void;
  backup: () => void;
  restore: () => void;
  localRestore: () => void;
  csv: () => void;
  students: { id: string; name: string; count: number }[];
  deleteStudent: (id: string) => void;
} = {
  email: "",
  configured: false,
  busy: false,
  connect: () => {},
  disconnect: () => {},
  backup: () => {},
  restore: () => {},
  localRestore: () => {},
  csv: () => {},
  students: [],
  deleteStudent: () => {},
};
const uid = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
const dateLabel = (d: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(d));
const timeLabel = (d: string) =>
  new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));

const seedStudents: Student[] = [
  {
    id: "rahul",
    name: "Rahul Kumar",
    phone: "98765 43210",
    total: 20,
    archived: false,
    createdAt: "2026-08-01",
  },
  {
    id: "ahmed",
    name: "Ahmed Khan",
    phone: "99887 76655",
    total: 20,
    archived: false,
    createdAt: "2026-08-01",
  },
  {
    id: "sameer",
    name: "Sameer Ali",
    phone: "90000 22110",
    total: 20,
    archived: false,
    createdAt: "2026-08-01",
  },
  {
    id: "priya",
    name: "Priya Shah",
    phone: "",
    total: 20,
    archived: true,
    createdAt: "2026-07-01",
  },
];
const seedAttendance: Attendance[] = [
  ...[...Array(13)].map((_, i) => ({
    id: `r${i}`,
    studentId: "rahul",
    number: i + 1,
    completedAt: `2026-08-${String(3 + i * 2).padStart(2, "0")}T10:30:00`,
  })),
  ...[...Array(8)].map((_, i) => ({
    id: `a${i}`,
    studentId: "ahmed",
    number: i + 1,
    completedAt: `2026-08-${String(4 + i * 2).padStart(2, "0")}T11:30:00`,
  })),
  ...[...Array(19)].map((_, i) => ({
    id: `s${i}`,
    studentId: "sameer",
    number: i + 1,
    completedAt: `2026-08-${String(2 + i).padStart(2, "0")}T09:30:00`,
  })),
  ...[...Array(20)].map((_, i) => ({
    id: `p${i}`,
    studentId: "priya",
    number: i + 1,
    completedAt: `2026-07-${String(2 + i).padStart(2, "0")}T09:30:00`,
  })),
];

function App() {
  const [students, setStudents] = useState<Student[]>([]),
    [attendance, setAttendance] = useState<Attendance[]>([]),
    [tab, setTab] = useState<"students" | "completed" | "settings">("students"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string | null>(null),
    [modal, setModal] = useState<"add" | "edit" | null>(null),
    [toast, setToast] = useState<string | null>(null),
    [last, setLast] = useState<Attendance | null>(null),
    [form, setForm] = useState({ name: "", phone: "", total: "20" }),
    [backup, setBackup] = useState("Not backed up yet"),
    [googleEmail, setGoogleEmail] = useState(savedGoogleEmail()),
    [driveBackups, setDriveBackups] = useState<DriveBackup[]>([]),
    [restoreOpen, setRestoreOpen] = useState(false),
    [restoreSelected, setRestoreSelected] = useState<string | null>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    (async () => {
      try {
        await migrateLegacyData();
        const [s, a, lastBackup, lastBackupHash] = await Promise.all([
          getStudents(),
          getAttendance(),
          getSetting<string>("lastBackupAt"),
          getSetting<string>("lastBackupHash"),
        ]);
        setStudents(s);
        setAttendance(a);
        if (lastBackup) {
          const due = (await currentDataHash()) !== lastBackupHash && Date.now() - new Date(lastBackup).getTime() > 7 * 24 * 60 * 60 * 1000;
          setBackup(due ? `Backup due · last backup ${dateLabel(lastBackup)}, ${timeLabel(lastBackup)}` : `${dateLabel(lastBackup)}, ${timeLabel(lastBackup)}`);
        }
        if (navigator.storage?.persist)
          void navigator.storage.persist().catch(() => false);
      } catch {
        setToast(
          "Couldn't open local attendance data. Your existing data has not been changed.",
        );
      }
    })();
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);
  const counts = useMemo(
    () =>
      Object.fromEntries(
        students.map((s) => [
          s.id,
          attendance.filter((a) => a.studentId === s.id).length,
        ]),
      ),
    [students, attendance],
  );
  const visible = students
    .filter((s) =>
      tab === "completed"
        ? counts[s.id] >= s.total
        : tab === "students" && !s.archived && counts[s.id] < s.total,
    )
    .filter((s) =>
      `${s.name} ${s.phone}`.toLowerCase().includes(query.toLowerCase()),
    );
  const current = selected ? students.find((s) => s.id === selected) : null;
  const save = async (s: Student) => {
    await saveStudent(s);
    setStudents((v) =>
      v.some((x) => x.id === s.id)
        ? v.map((x) => (x.id === s.id ? s : x))
        : [...v, s],
    );
  };
  const complete = async (s: Student) => {
    const n = (counts[s.id] || 0) + 1;
    if (n > s.total) return;
    const a = {
      id: uid(),
      studentId: s.id,
      number: n,
      completedAt: new Date().toISOString(),
    };
    try {
      await saveAttendance(a);
      setAttendance((v) => [...v, a]);
      setLast(a);
      setToast(`Class #${n} completed for ${s.name}`);
    } catch {
      setToast("Couldn't save attendance. Your existing data is safe.");
    }
  };
  const undo = async () => {
    if (!last) return;
    await deleteAttendance(last.id);
    setAttendance((v) => v.filter((a) => a.id !== last.id));
    setToast("Last class undone");
    setLast(null);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    const s: Student = {
      id: modal === "edit" && current ? current.id : uid(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      total: Math.max(1, Number(form.total) || 20),
      archived: false,
      createdAt: current?.createdAt || new Date().toISOString(),
    };
    await save(s);
    setModal(null);
    setToast(modal === "add" ? "Student added" : "Student updated");
  };
  const exportData = async () => {
    try {
      const snapshot = await makeSnapshot(),
        blob = await gzip(JSON.stringify(snapshot));
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `attendance-backup-${new Date().toISOString().slice(0, 10)}.json.gz`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setToast("Backup file downloaded");
    } catch {
      setToast("Couldn't create a backup file. Your attendance data is safe.");
    }
  };
  const exportCsv = async () => {
    try {
      const escape = (value: unknown) => {
        const text = String(value ?? "");
        return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const localDate = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const rows = [
        [
          "Student Name",
          "Phone",
          "Completed Classes",
          "Total Classes",
          "Remaining Classes",
          "Progress",
          "Last Class Date",
          "Status",
        ],
        ...students.map((s) => {
          const records = attendance.filter((a) => a.studentId === s.id);
          const count = records.length;
          const last = records
            .slice()
            .sort(
              (a, b) =>
                new Date(b.completedAt).getTime() -
                new Date(a.completedAt).getTime(),
            )[0];
          const pct = Math.min(100, Math.round((count / s.total) * 100));
          return [
            s.name,
            s.phone,
            count,
            s.total,
            Math.max(0, s.total - count),
            `${pct}%`,
            last ? localDate(new Date(last.completedAt)) : "",
            count >= s.total ? "Completed" : "Active",
          ];
        }),
      ];
      const csv =
        "\ufeff" +
        rows.map((row) => row.map(escape).join(",")).join("\r\n") +
        "\r\n";
      const file = new File(
        [csv],
        `driving-attendance-${localDate(new Date())}.csv`,
        { type: "text/csv;charset=utf-8" },
      );
      let shared = false;
      if (
        navigator.share &&
        (!navigator.canShare || navigator.canShare({ files: [file] }))
      ) {
        try {
          await navigator.share({ files: [file], title: "Driving Attendance" });
          shared = true;
        } catch (e) {
          if (e instanceof DOMException && e.name === "AbortError") return;
        }
      }
      if (!shared) {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(file);
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      }
      setToast("Attendance CSV ready to share");
    } catch {
      setToast("Couldn't create the CSV file. Your attendance data is safe.");
    }
  };
  const backupToDrive = async () => {
    if (!navigator.onLine) {
      setToast("No internet connection. Connect to back up to Google Drive.");
      return;
    }
    setBusy(true);
    try {
      if (!googleEmail) {
        const g = await connectGoogle();
        setGoogleEmail(g.email);
      }
      const snapshot = await makeSnapshot();
      await uploadBackup(await gzip(JSON.stringify(snapshot)), {
        students: snapshot.data.students.length,
        attendance: snapshot.data.attendance.length,
      });
      await setSetting("lastBackupAt", snapshot.createdAt);
      await setSetting("lastBackupHash", snapshot.checksum);
      setBackup(
        `${dateLabel(snapshot.createdAt)}, ${timeLabel(snapshot.createdAt)}`,
      );
      setToast("Backup successful");
    } catch (e) {
      setToast(
        e instanceof Error && e.message.includes("Client ID")
          ? "Add VITE_GOOGLE_CLIENT_ID to connect Google."
          : "Google Drive unavailable. Your local attendance data is safe.",
      );
    } finally {
      setBusy(false);
    }
  };
  const applyRestore = async (preview: RestorePreview) => {
    const safety = await makeSnapshot();
    const link = document.createElement("a");
    link.href = URL.createObjectURL(await gzip(JSON.stringify(safety)));
    link.download = `attendance-before-restore-${new Date().toISOString().slice(0, 10)}.json.gz`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    await replaceWithBackup(preview);
    setStudents(preview.snapshot.data.students);
    setAttendance(preview.snapshot.data.attendance);
    setToast("Backup restored");
  };
  const openRestore = async () => {
    if (!navigator.onLine) {
      setToast("No internet connection. Connect to restore from Google Drive.");
      return;
    }
    setBusy(true);
    try {
      if (!googleEmail) {
        const g = await connectGoogle();
        setGoogleEmail(g.email);
      }
      const found = await listBackups();
      if (!found.length) {
        setToast("No attendance backups were found in this Google account.");
        return;
      }
      setDriveBackups(found);
      const choice = window.prompt(
        `Available backups:\n${found.map((b, i) => `${i + 1}. ${dateLabel(b.createdTime)} · ${b.studentCount} students · ${b.classCount} classes`).join("\n")}\n\nEnter a backup number to restore:`,
        "1",
      );
      const selected = found[Number(choice) - 1];
      if (!selected) return;
      const preview = await validateBackup(await downloadBackup(selected.id));
      if (
        !window.confirm(
          `Restore ${preview.studentCount} students and ${preview.attendanceCount} classes from ${dateLabel(preview.snapshot.createdAt)}?\n\nYour current data will first be held in memory as a safety snapshot.`,
        )
      )
        return;
      await applyRestore(preview);
    } catch {
      setToast("Restore failed. Your current local data has not been changed.");
    } finally {
      setBusy(false);
    }
  };
  const disconnect = () => {
    clearGoogleAccount();
    setGoogleEmail("");
    setToast(
      "Disconnected. Local attendance data remains safely on this device.",
    );
  };
  const restoreFromFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gz,.json,application/gzip,application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        const preview = await validateBackup(file);
        if (
          !window.confirm(
            `Restore ${preview.studentCount} students and ${preview.attendanceCount} classes?\n\nBackup created ${dateLabel(preview.snapshot.createdAt)}. Current data remains safe if validation fails.`,
          )
        )
          return;
        await applyRestore(preview);
      } catch {
        setToast("Restore failed. Current data remains untouched.");
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };
  const deleteStudent = async (id: string) => {
    const student = students.find((s) => s.id === id);
    if (
      !student ||
      !window.confirm(
        `Delete ${student.name}?\n\nThis will permanently remove the student and all ${counts[id] || 0} attendance records from this device.`,
      )
    )
      return;
    await deleteStudentAndAttendance(id);
    setStudents((v) => v.filter((s) => s.id !== id));
    setAttendance((v) => v.filter((a) => a.studentId !== id));
    setToast(`${student.name} deleted`);
  };
  driveActions = {
    email: googleEmail,
    configured: googleConfigured,
    busy,
    connect: async () => {
      try {
        const g = await connectGoogle();
        setGoogleEmail(g.email);
        setToast("Google account connected");
      } catch (e) {
        setToast(e instanceof Error ? e.message : "Google connection failed.");
      }
    },
    disconnect,
    backup: backupToDrive,
    restore: openRestore,
    localRestore: restoreFromFile,
    csv: exportCsv,
    students: students.map((s) => ({
      id: s.id,
      name: s.name,
      count: counts[s.id] || 0,
    })),
    deleteStudent,
  };
  return (
    <div className="app">
      <header>
        <div className="eyebrow">
          <span className="mark">A</span>
          <span>DRIVING INSTRUCTOR</span>
          <span className="live">
            <i /> LOCAL ONLY
          </span>
        </div>
        <div className="headrow">
          <div>
            <h1>
              {tab === "settings"
                ? "Settings"
                : current
                  ? current.name
                  : "Attendance"}
            </h1>
            <p>
              {current
                ? "Progress & class history"
                : tab === "completed"
                  ? "Students who finished their package"
                  : "Your digital attendance book"}
            </p>
          </div>
          {current && (
            <button
              className="iconBtn"
              onClick={() => setSelected(null)}
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
          )}
        </div>
      </header>
      {tab !== "settings" && !current && (
        <main>
          <div className="search">
            <Search size={18} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or phone"
            />
            <kbd>⌘ K</kbd>
          </div>
          <button
            className="addBtn"
            onClick={() => {
              setForm({ name: "", phone: "", total: "20" });
              setModal("add");
            }}
          >
            <Plus size={18} /> Add student
          </button>
          <div className="sectionLabel">
            <span>{tab === "completed" ? "COMPLETED" : "ACTIVE STUDENTS"}</span>
            <b>{visible.length}</b>
          </div>
          {!visible.length ? (
            <div className="empty">
              <UserRound size={32} />
              <h2>
                {query
                  ? "No students found"
                  : tab === "completed"
                    ? "No completed students yet"
                    : "No active students"}
              </h2>
              <p>
                {query
                  ? "Try a different name or phone number."
                  : "Add your first student to get started."}
              </p>
            </div>
          ) : (
            <div className="list">
              {visible.map((s) => (
                <StudentRow
                  key={s.id}
                  s={s}
                  count={counts[s.id] || 0}
                  onOpen={() => setSelected(s.id)}
                  onComplete={() => complete(s)}
                />
              ))}
            </div>
          )}
        </main>
      )}
      {current && (
        <Detail
          s={current}
          count={counts[current.id] || 0}
          history={attendance
            .filter((a) => a.studentId === current.id)
            .sort((a, b) => b.number - a.number)}
          onComplete={() => complete(current)}
          onEdit={() => {
            setForm({
              name: current.name,
              phone: current.phone,
              total: String(current.total),
            });
            setModal("edit");
          }}
          onDelete={async (a) => {
            await deleteAttendance(a.id);
            setAttendance((v) => v.filter((x) => x.id !== a.id));
            setToast("Attendance record deleted");
          }}
        />
      )}
      {tab === "settings" && (
        <SettingsView backup={backup} onBackup={exportData} />
      )}
      <nav>
        <button
          className={tab === "students" ? "active" : ""}
          onClick={() => {
            setTab("students");
            setSelected(null);
          }}
        >
          <UserRound size={19} />
          Students
        </button>
        <button
          className={tab === "completed" ? "active" : ""}
          onClick={() => {
            setTab("completed");
            setSelected(null);
          }}
        >
          <Check size={19} />
          Completed
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          onClick={() => {
            setTab("settings");
            setSelected(null);
          }}
        >
          <Settings size={19} />
          Settings
        </button>
      </nav>
      {toast && (
        <div className="toast">
          {toast}
          {last && <button onClick={undo}>UNDO</button>}
        </div>
      )}
      {modal && (
        <div className="scrim">
          <form className="modal" onSubmit={submit}>
            <div className="modalTop">
              <div>
                <span className="eyebrow">STUDENT DETAILS</span>
                <h2>{modal === "add" ? "Add student" : "Edit student"}</h2>
              </div>
              <button
                type="button"
                className="iconBtn"
                onClick={() => setModal(null)}
              >
                <X size={19} />
              </button>
            </div>
            <label>
              Name
              <input
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Rahul Kumar"
              />
            </label>
            <label>
              Phone <small>optional</small>
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="e.g. 98765 43210"
              />
            </label>
            <label>
              Total classes
              <input
                type="number"
                min="1"
                value={form.total}
                onChange={(e) => setForm({ ...form, total: e.target.value })}
              />
            </label>
            <button className="primary" type="submit">
              {modal === "add" ? "Add student" : "Save changes"}{" "}
              <ChevronRight size={17} />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
function StudentRow({
  s,
  count,
  onOpen,
  onComplete,
}: {
  s: Student;
  count: number;
  onOpen: () => void;
  onComplete: () => void;
}) {
  const pct = Math.min(100, Math.round((count / s.total) * 100));
  return (
    <article className="studentRow">
      <button className="studentMain" onClick={onOpen}>
        <div className="avatar">
          {s.name
            .split(" ")
            .map((x) => x[0])
            .join("")
            .slice(0, 2)}
        </div>
        <div>
          <h2>{s.name}</h2>
          <p>
            {count} <span>/ {s.total} classes</span>
          </p>
        </div>
        <ChevronRight className="chev" size={18} />
      </button>
      <div className="progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className="rowBottom">
        <span>
          {s.total - count} remaining <em>{pct}%</em>
        </span>
        <button className="plus" onClick={onComplete}>
          <Plus size={20} />1
        </button>
      </div>
    </article>
  );
}
function Detail({
  s,
  count,
  history,
  onComplete,
  onEdit,
  onDelete,
}: {
  s: Student;
  count: number;
  history: Attendance[];
  onComplete: () => void;
  onEdit: () => void;
  onDelete: (a: Attendance) => void;
}) {
  const pct = Math.min(100, Math.round((count / s.total) * 100));
  return (
    <main className="detail">
      <div className="detailCard">
        <div className="detailMeta">
          <div className="avatar big">
            {s.name
              .split(" ")
              .map((x) => x[0])
              .join("")
              .slice(0, 2)}
          </div>
          <button className="edit" onClick={onEdit}>
            <Edit3 size={15} /> Edit
          </button>
        </div>
        <h2>{s.name}</h2>
        <p className="phone">{s.phone || "No phone number added"}</p>
        <div className="bigStat">
          <strong>{count}</strong>
          <span>/ {s.total} classes</span>
          <b>{pct}%</b>
        </div>
        <div className="progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        {count >= s.total ? (
          <div className="complete">
            <Check size={18} /> Course completed
          </div>
        ) : (
          <button className="primary completeBtn" onClick={onComplete}>
            <Plus size={20} /> Complete class
          </button>
        )}
      </div>
      <div className="historyHead">
        <span>CLASS HISTORY</span>
        <b>{history.length} records</b>
      </div>
      {history.length ? (
        <div className="history">
          {history.map((a) => (
            <div className="historyRow" key={a.id}>
              <div className="historyIcon">
                <History size={17} />
              </div>
              <div>
                <strong>Class #{a.number}</strong>
                <p>
                  {dateLabel(a.completedAt)}{" "}
                  <span>· {timeLabel(a.completedAt)}</span>
                </p>
              </div>
              <button onClick={() => onDelete(a)} aria-label="Delete record">
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty mini">
          <History size={25} />
          <p>No classes recorded yet.</p>
        </div>
      )}
    </main>
  );
}
function SettingsView({
  backup,
  onBackup,
}: {
  backup: string;
  onBackup: () => void;
}) {
  const [manageOpen, setManageOpen] = useState(false);
  return (
    <main className="settingsPage">
      <div className="settingIntro">
        <div className="settingIcon">
          <Cloud size={24} />
        </div>
        <div>
          <h2>Your data stays yours.</h2>
          <p>
            Attendance is stored on this device. Google Drive is only used when
            you explicitly back up or restore.
          </p>
        </div>
      </div>
      <section className="settingSection">
        <div className="sectionLabel">
          <span>GOOGLE ACCOUNT</span>
        </div>
        <div className="settingCard">
          <div>
            <strong>
              {driveActions.email ? "✓ Connected" : "Not connected"}
            </strong>
            <p>{driveActions.email || "Connect Google to use Drive backup."}</p>
          </div>
          {driveActions.email ? (
            <button className="outline" onClick={driveActions.disconnect}>
              Disconnect
            </button>
          ) : (
            <button
              className="outline"
              onClick={driveActions.connect}
            >
              Connect Google
            </button>
          )}
        </div>
        {!driveActions.configured && (
          <p className="configNote">
            Google Drive needs a configured OAuth client ID before it can
            connect.
          </p>
        )}
      </section>
      <section className="settingSection">
        <div className="sectionLabel">
          <span>DATA</span>
        </div>
        <div className="settingCard">
          <div>
            <strong>Last backup</strong>
            <p>{backup}</p>
          </div>
          <button
            className="outline"
            disabled={driveActions.busy}
            onClick={driveActions.backup}
          >
            <Cloud size={17} />{" "}
            {driveActions.busy ? "Working…" : "Backup to Drive"}
          </button>
        </div>
        <div className="settingCard">
          <div>
            <strong>Restore from Google Drive</strong>
            <p>Choose a previous attendance book backup.</p>
          </div>
          <button
            className="outline"
            disabled={driveActions.busy}
            onClick={driveActions.restore}
          >
            <Upload size={17} /> Restore
          </button>
        </div>
        <div className="settingCard">
          <div>
            <strong>Restore from file</strong>
            <p>Validate a local backup before replacing this device's data.</p>
          </div>
          <button className="outline" disabled={driveActions.busy} onClick={driveActions.localRestore}>
            <Upload size={17} /> Restore File
          </button>
        </div>
        <div className="settingCard">
          <div>
            <strong>Export Attendance CSV</strong>
            <p>One row per student, ready to share on iPhone.</p>
          </div>
          <button className="outline" onClick={driveActions.csv}>
            <Download size={17} /> Export CSV
          </button>
        </div>
        <div className="settingCard muted">
          <div>
            <strong>Export backup file</strong>
            <p>Complete compressed local data for manual safekeeping.</p>
          </div>
          <button className="outline" onClick={onBackup}>
            <Download size={17} /> Export Backup
          </button>
        </div>
      </section>
      <section className="settingSection">
        <div className="sectionLabel">
          <span>MANAGE STUDENTS</span>
        </div>
        <div className="dangerCard">
          <button
            className={`manageToggle${manageOpen ? " open" : ""}`}
            onClick={() => setManageOpen((v) => !v)}
          >
            <span>Manage students</span>
            <ChevronRight size={18} />
          </button>
          {manageOpen && (
            <>
              <p>Deleting a student also deletes their attendance history.</p>
              {driveActions.students.map((s) => (
                <div className="manageRow" key={s.id}>
                  <div>
                    <strong>{s.name}</strong>
                    <span>{s.count} completed classes</span>
                  </div>
                  <button
                    className="deleteBtn"
                    onClick={() => driveActions.deleteStudent(s.id)}
                  >
                    <Trash2 size={16} /> Delete
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </section>
      <section className="about">
        <span className="mark">A</span>
        <p>
          <strong>EverGreen Driving School</strong>
          <br />A quiet, reliable book for the road.
        </p>
      </section>
    </main>
  );
}
export default App;

createRoot(document.getElementById("root")!).render(<App />);
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch(() => {});
