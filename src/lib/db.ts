import { Pool } from "pg";
import { Job, Employee } from "@/types";

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
    });
  }
  return _pool;
}

// ─── Schema init ───────────────────────────────────────
export async function initSchema(): Promise<void> {
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, balance DECIMAL DEFAULT 0)`);
  await pool.query(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
}

// ─── Jobs ──────────────────────────────────────────────
export async function getAllJobs(): Promise<Job[]> {
  const now = new Date();
  const { rows } = await getPool().query(`SELECT data FROM jobs ORDER BY (data->>'createdAt') DESC`);
  return rows
    .map((r) => r.data as Job)
    .map((j) => ({ ...j, month: j.month ?? j.createdAt.slice(0, 7) }))
    .filter((j) => {
      if (j.expiresAt && j.status === "OPEN" && new Date(j.expiresAt) < now) return false;
      return true;
    });
}

export async function createJob(job: Job): Promise<Job> {
  await getPool().query(`INSERT INTO jobs (id, data) VALUES ($1, $2)`, [job.id, JSON.stringify(job)]);
  return job;
}

export async function updateJob(updatedJob: Job): Promise<Job | null> {
  const { rowCount } = await getPool().query(`UPDATE jobs SET data = $1 WHERE id = $2`, [JSON.stringify(updatedJob), updatedJob.id]);
  return (rowCount ?? 0) > 0 ? updatedJob : null;
}

export async function getJobById(id: string): Promise<Job | null> {
  const { rows } = await getPool().query(`SELECT data FROM jobs WHERE id = $1`, [id]);
  return rows.length > 0 ? (rows[0].data as Job) : null;
}

export async function deleteJob(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`DELETE FROM jobs WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ─── Employees ─────────────────────────────────────────
export async function getAllEmployees(): Promise<Employee[]> {
  const { rows } = await getPool().query(`SELECT id, name, CAST(balance AS FLOAT) as balance FROM employees ORDER BY name`);
  return rows as Employee[];
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const { rows } = await getPool().query(`SELECT id, name, CAST(balance AS FLOAT) as balance FROM employees WHERE id = $1`, [id]);
  return rows.length > 0 ? (rows[0] as Employee) : null;
}

export async function createEmployee(employee: Employee): Promise<Employee> {
  await getPool().query(`INSERT INTO employees (id, name, balance) VALUES ($1, $2, $3)`, [employee.id, employee.name, employee.balance]);
  return employee;
}

export async function updateEmployee(updated: Employee): Promise<Employee | null> {
  const { rowCount } = await getPool().query(`UPDATE employees SET name = $1, balance = $2 WHERE id = $3`, [updated.name, updated.balance, updated.id]);
  return (rowCount ?? 0) > 0 ? updated : null;
}

export async function deleteEmployee(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`DELETE FROM employees WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}
