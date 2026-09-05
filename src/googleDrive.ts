import { getSetting, setSetting } from "./db/settings";

export type DriveBackup = { id: string; name: string; createdTime: string; studentCount: number; classCount: number };
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "Attendance Backups";
const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
let token: string | undefined;
let tokenExpires = 0;

export const googleConfigured = Boolean(clientId);
export const savedGoogleEmail = () => localStorage.getItem("attendance.google.email") || "";
export const clearGoogleAccount = () => { localStorage.removeItem("attendance.google.email"); token = undefined; tokenExpires = 0; };

async function loadGoogleClient() {
  if (window.google?.accounts?.oauth2) return;
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`);
  const script = existing || Object.assign(document.createElement("script"), { src: GOOGLE_SCRIPT, async: true });
  if (!existing) document.head.append(script);
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Google Drive authorization did not load. Check your connection and try again.")), 12_000);
    const complete = () => { window.clearTimeout(timeout); window.google?.accounts?.oauth2 ? resolve() : reject(new Error("Google Drive authorization could not initialize.")); };
    script.addEventListener("load", complete, { once: true });
    script.addEventListener("error", () => { window.clearTimeout(timeout); reject(new Error("Google Drive authorization could not load.")); }, { once: true });
    if (window.google?.accounts?.oauth2) complete();
  });
}

export async function connectGoogle(): Promise<{ email: string }> {
  if (!clientId) throw new Error("Google Drive is not configured. Add VITE_GOOGLE_CLIENT_ID as a GitHub Actions repository variable, then redeploy.");
  await loadGoogleClient();
  return new Promise((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: response => {
        if (!response.access_token) { reject(new Error(response.error_description || response.error || "Google connection failed.")); return; }
        token = response.access_token;
        tokenExpires = Date.now() + (response.expires_in || 3600) * 1000 - 60_000;
        const email = savedGoogleEmail() || "Connected to Google Drive";
        localStorage.setItem("attendance.google.email", email);
        resolve({ email });
      },
      error_callback: error => reject(new Error(error.message || error.type || "Google connection failed. Please try again.")),
    });
    client.requestAccessToken({ prompt: token ? "" : "consent" });
  });
}

async function api<T>(url: string, init: RequestInit = {}, raw = false): Promise<T> {
  if (!token || Date.now() > tokenExpires) throw new Error("AUTH_REQUIRED");
  const response = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  if (response.status === 401) throw new Error("AUTH_REQUIRED");
  if (!response.ok) throw new Error(`DRIVE_${response.status}`);
  return (raw ? response.blob() : response.json()) as Promise<T>;
}
async function ensureToken() { if (!token || Date.now() > tokenExpires) await connectGoogle(); }
async function folderId() {
  const saved = await getSetting<string>("googleFolderId");
  if (saved) return saved;
  await ensureToken();
  const query = encodeURIComponent(`name='${FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await api<{ files: { id: string }[] }>(`${DRIVE}/files?q=${query}&spaces=drive&fields=files(id)&pageSize=1`);
  const id = found.files[0]?.id || (await api<{ id: string }>(`${DRIVE}/files`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: FOLDER, mimeType: "application/vnd.google-apps.folder" }) })).id;
  await setSetting("googleFolderId", id);
  return id;
}
const backupName = () => { const d = new Date(), p = (n: number) => String(n).padStart(2, "0"); return `attendance-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.json.gz`; };
export async function uploadBackup(file: Blob, counts: { students: number; attendance: number }) {
  await ensureToken(); const parent = await folderId(), boundary = "attendance_boundary";
  const header = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: backupName(), parents: [parent], mimeType: "application/gzip", appProperties: { students: String(counts.students), attendance: String(counts.attendance) } })}\r\n--${boundary}\r\nContent-Type: application/gzip\r\n\r\n`;
  const body = new Blob([header, file, `\r\n--${boundary}--`], { type: `multipart/related; boundary=${boundary}` });
  return api<{ id: string }>(`${UPLOAD}?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": body.type }, body });
}
export async function listBackups(): Promise<DriveBackup[]> {
  await ensureToken(); const parent = await folderId(), query = encodeURIComponent(`'${parent}' in parents and trashed=false`);
  const result = await api<{ files: Array<{ id: string; name: string; createdTime: string; appProperties?: Record<string, string> }> }>(`${DRIVE}/files?q=${query}&orderBy=createdTime desc&fields=files(id,name,createdTime,appProperties)&pageSize=100`);
  return result.files.filter(file => file.name.endsWith(".json.gz")).map(file => ({ ...file, studentCount: Number(file.appProperties?.students || 0), classCount: Number(file.appProperties?.attendance || 0) }));
}
export async function downloadBackup(id: string) { await ensureToken(); return api<Blob>(`${DRIVE}/files/${id}?alt=media`, {}, true); }
