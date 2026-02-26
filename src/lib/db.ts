import fs from "fs";
import path from "path";
import { Job, Employee } from "@/types";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

interface Database {
  employees: Employee[];
  jobs: Job[];
}

export function readDb(): Database {
  const raw = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(raw) as Database;
}

export function writeDb(data: Database): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// ─── Jobs ─────────────────────────────────────────────
export function getAllJobs(): Job[] {
  const now = new Date();
  return readDb().jobs
    .map((j) => ({
      ...j,
      month: j.month ?? j.createdAt.slice(0, 7),
    }))
    .filter((j) => {
      // Auto-ẩn job tại chỗ còn OPEN đã qua ngày hết hạn
      if (j.expiresAt && j.status === "OPEN" && new Date(j.expiresAt) < now) return false;
      return true;
    });
}

export function createJob(job: Job): Job {
  const db = readDb();
  db.jobs = [job, ...db.jobs];
  writeDb(db);
  return job;
}

export function updateJob(updatedJob: Job): Job | null {
  const db = readDb();
  const index = db.jobs.findIndex((j) => j.id === updatedJob.id);
  if (index === -1) return null;
  db.jobs[index] = updatedJob;
  writeDb(db);
  return updatedJob;
}

export function getJobById(id: string): Job | null {
  return readDb().jobs.find((j) => j.id === id) ?? null;
}

export function deleteJob(id: string): boolean {
  const db = readDb();
  const before = db.jobs.length;
  db.jobs = db.jobs.filter((j) => j.id !== id);
  if (db.jobs.length === before) return false;
  writeDb(db);
  return true;
}

// ─── Employees ────────────────────────────────────────
export function getAllEmployees(): Employee[] {
  return readDb().employees;
}

export function createEmployee(employee: Employee): Employee {
  const db = readDb();
  db.employees = [...db.employees, employee];
  writeDb(db);
  return employee;
}

export function updateEmployee(updated: Employee): Employee | null {
  const db = readDb();
  const index = db.employees.findIndex((e) => e.id === updated.id);
  if (index === -1) return null;
  db.employees[index] = updated;
  writeDb(db);
  return updated;
}

export function deleteEmployee(id: string): boolean {
  const db = readDb();
  const before = db.employees.length;
  db.employees = db.employees.filter((e) => e.id !== id);
  if (db.employees.length === before) return false;
  writeDb(db);
  return true;
}

export function getEmployeeById(id: string): Employee | null {
  return readDb().employees.find((e) => e.id === id) ?? null;
}
