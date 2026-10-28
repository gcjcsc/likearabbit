// The once-a-day job (cron in wrangler.jsonc): a phone notification listing today's litter and health
// reminders, and on Sundays a backup of all the herd records, optionally emailed through Resend.

import { upcoming, addDays } from "../public/reminders.js";
import { sendPush } from "./push.js";

const KEEP_BACKUPS = 12;

const setting = async (env, key) => (await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first())?.value ?? "";

// Today's date where the rabbitry is, not in UTC
export const localToday = (timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "America/New_York" }).format(new Date());

export const allRecords = async (env) => {
  const tables = ["rabbits", "litters", "photos", "weights", "health", "shows"];
  const results = await env.DB.batch(tables.map((t) => env.DB.prepare(`SELECT * FROM ${t} ORDER BY id`)));
  return Object.fromEntries(tables.map((t, i) => [t, results[i].results]));
};

export const makeBackup = async (env) => {
  const data = JSON.stringify({ exported: new Date().toISOString(), ...(await allRecords(env)) });
  const row = await env.PHOTOS.prepare("INSERT INTO backups (data) VALUES (?) RETURNING id, created_at").bind(data).first();
  await env.PHOTOS.prepare("DELETE FROM backups WHERE id NOT IN (SELECT id FROM backups ORDER BY id DESC LIMIT ?)").bind(KEEP_BACKUPS).run();
  return { ...row, data };
};

// Emails the backup when a Resend API key (secret RESEND_API_KEY) and a backup address are set
const emailBackup = async (env, backup) => {
  const to = await setting(env, "backup_email");
  if (!env.RESEND_API_KEY || !to) return false;
  const date = backup.created_at.slice(0, 10);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "MCF Rabbitry <onboarding@resend.dev>",
      to: [to],
      subject: `MCF Rabbitry backup, ${date}`,
      text: "This week's backup of the herd records is attached. Keep it somewhere safe.",
      attachments: [{ filename: `mcf-herd-${date}.json`, content: btoa(unescape(encodeURIComponent(backup.data))) }],
    }),
  });
  if (!res.ok) console.warn("Backup email failed", res.status, await res.text());
  return res.ok;
};

export const runDaily = async (env) => {
  const today = localToday(await setting(env, "timezone"));
  const records = await allRecords(env);
  const names = new Map(records.rabbits.map((r) => [r.id, r.name || r.ear || "Unnamed"]));
  const nameOf = (id) => names.get(id) || "Unknown";

  const due = upcoming(records, today, today, nameOf);
  const tomorrow = upcoming(records, addDays(today, 1), addDays(today, 1), nameOf).filter((i) => i.key === "due" || i.key === "nestbox");
  const lines = [...due.map((i) => i.text), ...tomorrow.map((i) => `Tomorrow: ${i.text}`)];
  if (lines.length) await sendPush(env, { title: "MCF Rabbitry today", body: lines.join("\n"), url: "/#/" });

  // Sunday backups
  if (new Date(today + "T12:00:00Z").getUTCDay() === 0) {
    const backup = await makeBackup(env);
    const emailed = await emailBackup(env, backup).catch(() => false);
    console.log(`Backup ${backup.id} saved${emailed ? " and emailed" : ""}`);
  }
};
