import { readFile, writeFile } from "fs/promises";
import path from "path";
import { Pool } from "pg";
import { Job, Employee, ManualEntry, CassoTransactionRecord } from "@/types";

type AepClassificationData = {
  expenses: Record<string, boolean>;
  expenseKeys: Record<string, boolean>;
  salaryAssignments: Record<string, boolean>;
  manualEntries: Record<string, boolean>;
};

export type AepClassificationSnapshot = {
  id: number;
  month: string;
  data: AepClassificationData;
  source: string;
  createdAt: string;
};

function normalizeAepClassificationData(raw: {
  expenses?: Record<string, boolean>;
  expenseKeys?: Record<string, boolean>;
  salaryAssignments?: Record<string, boolean>;
  manualEntries?: Record<string, boolean>;
} | null | undefined): AepClassificationData {
  return {
    expenses: raw?.expenses ?? {},
    expenseKeys: raw?.expenseKeys ?? {},
    salaryAssignments: raw?.salaryAssignments ?? {},
    manualEntries: raw?.manualEntries ?? {},
  };
}

let _pool: Pool | null = null;

type LocalDbShape = {
  employees: Employee[];
  jobs: Job[];
  manualEntries: ManualEntry[];
  settings: Record<string, unknown>;
};

const LOCAL_DB_PATH = path.join(process.cwd(), "data", "db.json");

function hasDatabaseUrl() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getEmptyLocalDb(): LocalDbShape {
  return {
    employees: [],
    jobs: [],
    manualEntries: [],
    settings: {},
  };
}

async function readLocalDb(): Promise<LocalDbShape> {
  try {
    const raw = await readFile(LOCAL_DB_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<LocalDbShape> & { manual_salary?: ManualEntry[] };
    return {
      employees: Array.isArray(parsed.employees) ? parsed.employees : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
      manualEntries: Array.isArray(parsed.manualEntries)
        ? parsed.manualEntries
        : Array.isArray(parsed.manual_salary)
          ? parsed.manual_salary
          : [],
      settings: parsed.settings && typeof parsed.settings === "object" ? parsed.settings as Record<string, unknown> : {},
    };
  } catch {
    return getEmptyLocalDb();
  }
}

async function writeLocalDb(data: LocalDbShape): Promise<void> {
  await writeFile(LOCAL_DB_PATH, JSON.stringify(data, null, 2), "utf8");
}

function getPool(): Pool {
  if (!hasDatabaseUrl()) {
    throw new Error("DATABASE_URL is not configured");
  }
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
  if (!hasDatabaseUrl()) return;
  const pool = getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, balance DECIMAL DEFAULT 0)`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile JSONB DEFAULT '{}'`);
  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);
  await pool.query(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS manual_salary (
      id TEXT PRIMARY KEY,
      emp_id TEXT NOT NULL,
      month TEXT NOT NULL,
      title TEXT NOT NULL,
      amount DECIMAL NOT NULL DEFAULT 0,
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aep_classifications (
      month TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{"expenses":{},"salaryAssignments":{},"manualEntries":{}}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS aep_classification_history (
      id BIGSERIAL PRIMARY KEY,
      month TEXT NOT NULL,
      data JSONB NOT NULL DEFAULT '{"expenses":{},"expenseKeys":{},"salaryAssignments":{},"manualEntries":{}}',
      source TEXT NOT NULL DEFAULT 'save',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_aep_classification_history_month_created_at ON aep_classification_history (month, created_at DESC)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      data JSONB NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS casso_transactions (
      transaction_id TEXT PRIMARY KEY,
      booking_date DATE NOT NULL,
      amount DECIMAL NOT NULL DEFAULT 0,
      is_incoming BOOLEAN NOT NULL DEFAULT FALSE,
      is_aep BOOLEAN NOT NULL DEFAULT FALSE,
      description TEXT NOT NULL DEFAULT '',
      counter_account_name TEXT NOT NULL DEFAULT '',
      raw JSONB NOT NULL DEFAULT '{}',
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_casso_transactions_booking_date ON casso_transactions (booking_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_casso_transactions_is_aep ON casso_transactions (is_aep, is_incoming)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_casso_transactions_received_at ON casso_transactions (received_at)`);
}

// ─── Settings ───────────────────────────────────────────
export async function getSetting(key: string): Promise<unknown | null> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    return db.settings[key] ?? null;
  }
  const { rows } = await getPool().query(`SELECT data FROM settings WHERE key = $1`, [key]);
  return rows.length > 0 ? rows[0].data : null;
}

export async function upsertSetting(key: string, data: unknown): Promise<void> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    db.settings[key] = data;
    await writeLocalDb(db);
    return;
  }
  await getPool().query(
    `INSERT INTO settings (key, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()`,
    [key, JSON.stringify(data)]
  );
}

// ─── AEP Classifications ────────────────────────────────
export async function getAepClassification(month: string): Promise<AepClassificationData | null> {
  const { rows } = await getPool().query(`SELECT data FROM aep_classifications WHERE month = $1`, [month]);
  if (rows.length === 0) return null;

  return normalizeAepClassificationData(rows[0].data as {
    expenses?: Record<string, boolean>;
    expenseKeys?: Record<string, boolean>;
    salaryAssignments?: Record<string, boolean>;
    manualEntries?: Record<string, boolean>;
  });
}

export async function listAepClassificationSnapshots(month: string, limit = 10): Promise<AepClassificationSnapshot[]> {
  const { rows } = await getPool().query(
    `SELECT id, month, data, source, created_at
     FROM aep_classification_history
     WHERE month = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [month, limit]
  );

  return rows.map((row) => ({
    id: Number(row.id),
    month: row.month as string,
    data: normalizeAepClassificationData(row.data as AepClassificationData),
    source: (row.source as string) || "save",
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  }));
}

export async function createAepClassificationSnapshot(month: string, data: AepClassificationData, source = "save"): Promise<void> {
  await getPool().query(
    `INSERT INTO aep_classification_history (month, data, source, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [month, JSON.stringify(normalizeAepClassificationData(data)), source]
  );
}

export async function upsertAepClassification(month: string, data: AepClassificationData, source = "save"): Promise<void> {
  const normalized = normalizeAepClassificationData(data);
  await getPool().query(
    `INSERT INTO aep_classifications (month, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (month) DO UPDATE SET data = $2, updated_at = NOW()`,
    [month, JSON.stringify(normalized)]
  );

  await createAepClassificationSnapshot(month, normalized, source);
}

export async function restoreAepClassificationSnapshot(month: string, snapshotId: number): Promise<AepClassificationData | null> {
  const { rows } = await getPool().query(
    `SELECT data FROM aep_classification_history WHERE id = $1 AND month = $2 LIMIT 1`,
    [snapshotId, month]
  );
  if (rows.length === 0) return null;

  const normalized = normalizeAepClassificationData(rows[0].data as AepClassificationData);
  await upsertAepClassification(month, normalized, `restore:${snapshotId}`);
  return normalized;
}

// ─── Jobs ──────────────────────────────────────────────
export async function getAllJobs(): Promise<Job[]> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    return db.jobs
      .map((job) => ({ ...job, month: job.month ?? job.createdAt.slice(0, 7) }))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  }
  const { rows } = await getPool().query(`SELECT data FROM jobs ORDER BY (data->>'createdAt') DESC`);
  return rows
    .map((r) => r.data as Job)
    .map((j) => ({ ...j, month: j.month ?? j.createdAt.slice(0, 7) }));
}

export async function createJob(job: Job): Promise<Job> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    db.jobs.unshift(job);
    await writeLocalDb(db);
    return job;
  }
  await getPool().query(`INSERT INTO jobs (id, data) VALUES ($1, $2)`, [job.id, JSON.stringify(job)]);
  return job;
}

export async function createJobs(jobs: Job[]): Promise<Job[]> {
  if (jobs.length === 0) return [];
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    db.jobs.unshift(...jobs);
    await writeLocalDb(db);
    return jobs;
  }

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const job of jobs) {
      await client.query(`INSERT INTO jobs (id, data) VALUES ($1, $2)`, [job.id, JSON.stringify(job)]);
    }
    await client.query("COMMIT");
    return jobs;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function updateJob(updatedJob: Job): Promise<Job | null> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    const index = db.jobs.findIndex((job) => job.id === updatedJob.id);
    if (index < 0) return null;
    db.jobs[index] = updatedJob;
    await writeLocalDb(db);
    return updatedJob;
  }
  const { rowCount } = await getPool().query(`UPDATE jobs SET data = $1 WHERE id = $2`, [JSON.stringify(updatedJob), updatedJob.id]);
  return (rowCount ?? 0) > 0 ? updatedJob : null;
}

export async function getJobById(id: string): Promise<Job | null> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    return db.jobs.find((job) => job.id === id) ?? null;
  }
  const { rows } = await getPool().query(`SELECT data FROM jobs WHERE id = $1`, [id]);
  return rows.length > 0 ? (rows[0].data as Job) : null;
}

export async function deleteJob(id: string): Promise<boolean> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    const nextJobs = db.jobs.filter((job) => job.id !== id);
    if (nextJobs.length === db.jobs.length) return false;
    db.jobs = nextJobs;
    await writeLocalDb(db);
    return true;
  }
  const { rowCount } = await getPool().query(`DELETE FROM jobs WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ─── Employees ─────────────────────────────────────────
export async function getAllEmployees(): Promise<Employee[]> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    return db.employees.map(e => ({...e, isActive: e.isActive ?? true})).sort((left, right) => left.name.localeCompare(right.name, "vi"));
  }
  const { rows } = await getPool().query(`SELECT id, name, CAST(balance AS FLOAT) as balance, profile, COALESCE(is_active, true) as "isActive" FROM employees ORDER BY name`);
  return rows as Employee[];
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    const emp = db.employees.find((employee) => employee.id === id);
    if (!emp) return null;
    return { ...emp, isActive: emp.isActive ?? true };
  }
  const { rows } = await getPool().query(`SELECT id, name, CAST(balance AS FLOAT) as balance, profile, COALESCE(is_active, true) as "isActive" FROM employees WHERE id = $1`, [id]);
  return rows.length > 0 ? (rows[0] as Employee) : null;
}

export async function createEmployee(employee: Employee): Promise<Employee> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    db.employees.push({...employee, isActive: true});
    await writeLocalDb(db);
    return employee;
  }
  await getPool().query(`INSERT INTO employees (id, name, balance, is_active) VALUES ($1, $2, $3, true)`, [employee.id, employee.name, employee.balance]);
  return { ...employee, isActive: true };
}

export async function updateEmployee(updated: Employee): Promise<Employee | null> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    const index = db.employees.findIndex((employee) => employee.id === updated.id);
    if (index < 0) return null;
    db.employees[index] = updated;
    await writeLocalDb(db);
    return updated;
  }
  const { rowCount } = await getPool().query(
    `UPDATE employees SET name = $1, balance = $2, profile = $3, is_active = $5 WHERE id = $4`,
    [updated.name, updated.balance, JSON.stringify(updated.profile ?? {}), updated.id, updated.isActive ?? true]
  );
  return (rowCount ?? 0) > 0 ? updated : null;
}

export async function deleteEmployee(id: string): Promise<boolean> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    const nextEmployees = db.employees.filter((employee) => employee.id !== id);
    if (nextEmployees.length === db.employees.length) return false;
    db.employees = nextEmployees;
    await writeLocalDb(db);
    return true;
  }
  const { rowCount } = await getPool().query(`DELETE FROM employees WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ─── Manual Salary ─────────────────────────────────────
export async function getAllManualEntries(): Promise<ManualEntry[]> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    return [...db.manualEntries].sort((left, right) => right.month.localeCompare(left.month, "vi"));
  }
  const { rows } = await getPool().query(
    `SELECT id, emp_id AS "empId", month, title, CAST(amount AS FLOAT) AS amount, note FROM manual_salary ORDER BY created_at DESC`
  );
  return rows as ManualEntry[];
}

export async function createManualEntry(entry: ManualEntry): Promise<ManualEntry> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    db.manualEntries.unshift(entry);
    await writeLocalDb(db);
    return entry;
  }
  await getPool().query(
    `INSERT INTO manual_salary (id, emp_id, month, title, amount, note) VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.id, entry.empId, entry.month, entry.title, entry.amount, entry.note]
  );
  return entry;
}

export async function deleteManualEntry(id: string): Promise<boolean> {
  if (!hasDatabaseUrl()) {
    const db = await readLocalDb();
    const nextEntries = db.manualEntries.filter((entry) => entry.id !== id);
    if (nextEntries.length === db.manualEntries.length) return false;
    db.manualEntries = nextEntries;
    await writeLocalDb(db);
    return true;
  }
  const { rowCount } = await getPool().query(`DELETE FROM manual_salary WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ─── Casso Transactions ───────────────────────────────
export async function upsertCassoTransactions(transactions: CassoTransactionRecord[]): Promise<number> {
  if (transactions.length === 0) return 0;

  const pool = getPool();
  for (const transaction of transactions) {
    await pool.query(
      `INSERT INTO casso_transactions (
        transaction_id,
        booking_date,
        amount,
        is_incoming,
        is_aep,
        description,
        counter_account_name,
        received_at,
        raw,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, NOW()), $9, NOW())
      ON CONFLICT (transaction_id) DO UPDATE SET
        booking_date = EXCLUDED.booking_date,
        amount = EXCLUDED.amount,
        is_incoming = EXCLUDED.is_incoming,
        is_aep = EXCLUDED.is_aep,
        description = EXCLUDED.description,
        counter_account_name = EXCLUDED.counter_account_name,
        received_at = COALESCE($8::timestamptz, casso_transactions.received_at),
        raw = EXCLUDED.raw,
        updated_at = NOW()`,
      [
        transaction.transactionId,
        transaction.bookingDate,
        transaction.amount,
        transaction.isIncoming,
        transaction.isAep,
        transaction.description,
        transaction.counterAccountName,
        transaction.receivedAt ?? null,
        JSON.stringify(transaction.raw),
      ]
    );
  }

  return transactions.length;
}

export async function getDailyAepRevenue(days = 30): Promise<Record<string, number>> {
  const safeDays = Math.max(1, Math.min(365, Math.round(Number(days) || 30)));
  const { rows } = await getPool().query(
    `WITH params AS (
       SELECT (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS current_day
     ),
     day_series AS (
       SELECT generate_series(
         (SELECT current_day FROM params) - ($1::int - 1) * INTERVAL '1 day',
         (SELECT current_day FROM params),
         INTERVAL '1 day'
       )::date AS booking_date
     ),
     revenue_by_day AS (
       SELECT booking_date, COALESCE(SUM(amount), 0) AS amount
       FROM casso_transactions, params
       WHERE is_incoming = TRUE
         AND is_aep = TRUE
         AND booking_date >= params.current_day - ($1::int - 1) * INTERVAL '1 day'
         AND booking_date <= params.current_day
       GROUP BY booking_date
     )
     SELECT day_series.booking_date::text AS date, CAST(COALESCE(revenue_by_day.amount, 0) AS FLOAT) AS amount
     FROM day_series
     LEFT JOIN revenue_by_day ON revenue_by_day.booking_date = day_series.booking_date
     ORDER BY day_series.booking_date ASC`,
    [safeDays]
  );

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.date as string] = Number(row.amount) || 0;
    return acc;
  }, {});
}

export interface HourlyAepRevenuePoint {
  hour: string;        // "2026-08-04 13:00"
  date: string;        // "2026-08-04"
  hourOfDay: number;   // 0-23
  amount: number;      // VND
}

export async function getHourlyAepRevenue(days = 7): Promise<HourlyAepRevenuePoint[]> {
  const safeDays = Math.max(1, Math.min(31, Math.round(Number(days) || 7)));
  const { rows } = await getPool().query(
    `WITH params AS (
       SELECT
         date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') - ($1::int - 1) * INTERVAL '1 day' AS start_day,
         date_trunc('day', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AS current_day
     ),
     hour_series AS (
       SELECT generate_series(
         (SELECT start_day FROM params),
         (SELECT current_day FROM params) + INTERVAL '23 hours',
         INTERVAL '1 hour'
       ) AS hour_value
     ),
     revenue_by_hour AS (
       SELECT
         date_trunc('hour', received_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS hour_value,
         COALESCE(SUM(amount), 0) AS amount
       FROM casso_transactions, params
       WHERE is_incoming = TRUE
         AND is_aep = TRUE
         AND (received_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= params.start_day
         AND (received_at AT TIME ZONE 'Asia/Ho_Chi_Minh') < (params.current_day + INTERVAL '1 day')
       GROUP BY 1
     )
     SELECT
       to_char(hour_series.hour_value, 'YYYY-MM-DD HH24:00') AS hour,
       to_char(hour_series.hour_value, 'YYYY-MM-DD') AS date,
       EXTRACT(HOUR FROM hour_series.hour_value)::int AS hour_of_day,
       CAST(COALESCE(revenue_by_hour.amount, 0) AS FLOAT) AS amount
     FROM hour_series
     LEFT JOIN revenue_by_hour ON revenue_by_hour.hour_value = hour_series.hour_value
     ORDER BY hour_series.hour_value ASC`,
    [safeDays]
  );

  return rows.map((row) => ({
    hour: String(row.hour),
    date: String(row.date),
    hourOfDay: Number(row.hour_of_day) || 0,
    amount: Number(row.amount) || 0,
  }));
}

export interface IntradayAepRevenue {
  todayDate: string;      // "2026-04-19"
  lastWeekDate: string;   // "2026-04-12"
  cutoffTime: string;     // "15:20" giờ VN hiện tại
  weekdayName: string;    // "Chủ nhật"
  today: number;          // VND - tổng hôm nay đến giờ hiện tại
  lastWeek: number;       // VND - tổng cùng thứ tuần trước đến cùng giờ
}

export async function getIntradayAepRevenue(): Promise<IntradayAepRevenue> {
  const { rows } = await getPool().query(`
    WITH params AS (
      SELECT
        (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today_date,
        ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - INTERVAL '7 days')::date AS last_week_date,
        (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time AS cutoff_time,
        EXTRACT(DOW FROM NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::int AS dow
    ),
    today_total AS (
      SELECT COALESCE(SUM(amount), 0) AS amount
      FROM casso_transactions, params
      WHERE is_incoming = TRUE AND is_aep = TRUE
        AND (received_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = params.today_date
    ),
    last_week_total AS (
      SELECT COALESCE(SUM(amount), 0) AS amount
      FROM casso_transactions, params
      WHERE is_incoming = TRUE AND is_aep = TRUE
        AND (received_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = params.last_week_date
        AND (received_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time <= params.cutoff_time
    )
    SELECT
      to_char(p.today_date, 'YYYY-MM-DD')     AS today_date,
      to_char(p.last_week_date, 'YYYY-MM-DD') AS last_week_date,
      to_char(p.cutoff_time, 'HH24:MI')       AS cutoff_time,
      p.dow,
      CAST(t.amount AS FLOAT)                 AS today,
      CAST(lw.amount AS FLOAT)                AS last_week
    FROM params p, today_total t, last_week_total lw
  `);

  const row = rows[0];
  const dow = Number(row.dow); // 0=CN, 1=T2, ..., 6=T7
  const weekdayNames = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

  return {
    todayDate: String(row.today_date),
    lastWeekDate: String(row.last_week_date),
    cutoffTime: String(row.cutoff_time),
    weekdayName: weekdayNames[dow] ?? "Hôm nay",
    today: Number(row.today) || 0,
    lastWeek: Number(row.last_week) || 0,
  };
}
