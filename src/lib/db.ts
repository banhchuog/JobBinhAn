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
      transaction_at TIMESTAMPTZ,
      received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE casso_transactions ADD COLUMN IF NOT EXISTS transaction_at TIMESTAMPTZ`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_casso_transactions_booking_date ON casso_transactions (booking_date)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_casso_transactions_is_aep ON casso_transactions (is_aep, is_incoming)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_casso_transactions_transaction_at ON casso_transactions (transaction_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_casso_transactions_received_at ON casso_transactions (received_at)`);
  await pool.query(`
    WITH raw_timestamps AS (
      SELECT
        transaction_id,
        COALESCE(
          NULLIF(raw->>'transactionDate', ''),
          NULLIF(raw->>'when', ''),
          NULLIF(raw->>'createdAt', ''),
          NULLIF(raw->>'bookingDate', ''),
          NULLIF(raw->>'date', '')
        ) AS raw_timestamp
      FROM casso_transactions
    ),
    parsed_timestamps AS (
      SELECT
        transaction_id,
        CASE
          WHEN raw_timestamp ~ '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}[T ][0-9]{1,2}:[0-9]{2}(:[0-9]{2}(\\.[0-9]{1,3})?)?$'
            THEN (replace(raw_timestamp, 'T', ' ')::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
          WHEN raw_timestamp ~ '[T ][0-9]{1,2}:[0-9]{2}'
            THEN raw_timestamp::timestamptz
          ELSE NULL
        END AS parsed_received_at
      FROM raw_timestamps
      WHERE raw_timestamp IS NOT NULL
    )
    UPDATE casso_transactions c
    SET transaction_at = p.parsed_received_at
    FROM parsed_timestamps p
    WHERE c.transaction_id = p.transaction_id
      AND p.parsed_received_at IS NOT NULL
      AND c.transaction_at IS DISTINCT FROM p.parsed_received_at
  `);
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
        transaction_at,
        received_at,
        raw,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, COALESCE($9::timestamptz, NOW()), $10, NOW())
      ON CONFLICT (transaction_id) DO UPDATE SET
        booking_date = EXCLUDED.booking_date,
        amount = EXCLUDED.amount,
        is_incoming = EXCLUDED.is_incoming,
        is_aep = EXCLUDED.is_aep,
        description = EXCLUDED.description,
        counter_account_name = EXCLUDED.counter_account_name,
        transaction_at = COALESCE($8::timestamptz, casso_transactions.transaction_at),
        received_at = COALESCE($9::timestamptz, casso_transactions.received_at),
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
        transaction.transactionAt ?? null,
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

const DEFAULT_REVENUE_WEEKDAY_WEIGHTS = [1.45, 0.9, 0.9, 0.95, 1, 1.1, 1.45];

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function parseIsoDateUtc(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatIsoDateUtc(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

function addIsoDays(value: string, days: number) {
  const date = parseIsoDateUtc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return formatIsoDateUtc(date);
}

function getIsoWeekday(value: string) {
  return parseIsoDateUtc(value).getUTCDay();
}

function getIsoMonthEnd(value: string) {
  const [year, month] = value.split("-").map(Number);
  return formatIsoDateUtc(new Date(Date.UTC(year, month, 0)));
}

function listIsoDates(start: string, end: string) {
  const dates: string[] = [];
  for (let cursor = start; cursor <= end; cursor = addIsoDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function countWeekendDates(dates: string[]) {
  return dates.filter((date) => {
    const weekday = getIsoWeekday(date);
    return weekday === 0 || weekday === 6;
  }).length;
}

export interface AepForecastPeriod {
  periodStart: string;
  periodEnd: string;
  actual: number;
  predicted: number;
  elapsedWeight: number;
  totalWeight: number;
  remainingDays: number;
  remainingWeekendDays: number;
}

export interface AepRevenueForecast {
  currentDate: string;
  dayProgress: number;
  lookbackDays: number;
  formula: string;
  weekdayWeights: Array<{
    weekday: number;
    weight: number;
    averageAmount: number;
    samples: number;
  }>;
  week: AepForecastPeriod;
  month: AepForecastPeriod;
}

export async function getAepRevenueForecast(lookbackDays = 180): Promise<AepRevenueForecast> {
  const safeLookbackDays = Math.max(56, Math.min(365, Math.round(Number(lookbackDays) || 180)));
  const { rows } = await getPool().query(
    `WITH params AS (
       SELECT
         (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS current_day,
         GREATEST(0.08, LEAST(1, EXTRACT(EPOCH FROM ((NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::time)) / 86400.0)) AS day_progress
     ),
     day_series AS (
       SELECT generate_series(
         (SELECT current_day FROM params) - $1::int * INTERVAL '1 day',
         (SELECT current_day FROM params),
         INTERVAL '1 day'
       )::date AS booking_date
     ),
     revenue_by_day AS (
       SELECT booking_date, COALESCE(SUM(amount), 0) AS amount
       FROM casso_transactions
       WHERE is_incoming = TRUE
         AND is_aep = TRUE
         AND booking_date >= (SELECT current_day FROM params) - $1::int * INTERVAL '1 day'
         AND booking_date <= (SELECT current_day FROM params)
       GROUP BY booking_date
     )
     SELECT
       day_series.booking_date::text AS date,
       CAST(COALESCE(revenue_by_day.amount, 0) AS FLOAT) AS amount,
       params.current_day::text AS current_day,
       CAST(params.day_progress AS FLOAT) AS day_progress
     FROM day_series
     CROSS JOIN params
     LEFT JOIN revenue_by_day ON revenue_by_day.booking_date = day_series.booking_date
     ORDER BY day_series.booking_date ASC`,
    [safeLookbackDays]
  );

  const currentDate = String(rows[0]?.current_day ?? formatIsoDateUtc(new Date()));
  const dayProgress = clampNumber(Number(rows[0]?.day_progress) || 1, 0.08, 1);
  const amountByDate = new Map<string, number>();
  for (const row of rows) amountByDate.set(String(row.date), Number(row.amount) || 0);

  const completedDays = rows.filter((row) => String(row.date) < currentDate);
  const globalAverage = completedDays.length > 0
    ? completedDays.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) / completedDays.length
    : 0;

  const weekdayStats = Array.from({ length: 7 }, (_, weekday) => ({
    weekday,
    total: 0,
    samples: 0,
  }));

  for (const row of completedDays) {
    const date = String(row.date);
    const weekday = getIsoWeekday(date);
    weekdayStats[weekday].total += Number(row.amount) || 0;
    weekdayStats[weekday].samples += 1;
  }

  const rawWeights = weekdayStats.map((stat) => {
    const averageAmount = stat.samples > 0 ? stat.total / stat.samples : 0;
    const learnedWeight = globalAverage > 0 && stat.samples >= 3 ? averageAmount / globalAverage : DEFAULT_REVENUE_WEEKDAY_WEIGHTS[stat.weekday];
    const smoothedWeight = learnedWeight * 0.75 + DEFAULT_REVENUE_WEEKDAY_WEIGHTS[stat.weekday] * 0.25;
    return {
      weekday: stat.weekday,
      weight: clampNumber(smoothedWeight, 0.35, 2.75),
      averageAmount,
      samples: stat.samples,
    };
  });
  const weightAverage = rawWeights.reduce((sum, item) => sum + item.weight, 0) / rawWeights.length || 1;
  const weekdayWeights = rawWeights.map((item) => ({
    ...item,
    weight: item.weight / weightAverage,
  }));

  const getWeight = (date: string) => weekdayWeights[getIsoWeekday(date)]?.weight ?? 1;
  const sumActual = (dates: string[]) => dates.reduce((sum, date) => sum + (amountByDate.get(date) ?? 0), 0);
  const sumWeight = (dates: string[]) => dates.reduce((sum, date) => sum + getWeight(date), 0);

  const projectPeriod = (periodStart: string, periodEnd: string): AepForecastPeriod => {
    const allDates = listIsoDates(periodStart, periodEnd);
    const elapsedDates = allDates.filter((date) => date <= currentDate);
    const completedElapsedDates = elapsedDates.filter((date) => date < currentDate);
    const futureDates = allDates.filter((date) => date > currentDate);
    const actual = sumActual(elapsedDates);
    const totalWeight = sumWeight(allDates);
    const elapsedWeight = sumWeight(completedElapsedDates) + (allDates.includes(currentDate) ? getWeight(currentDate) * dayProgress : 0);
    const predicted = elapsedWeight > 0 ? actual * (totalWeight / elapsedWeight) : actual;

    return {
      periodStart,
      periodEnd,
      actual,
      predicted: Math.max(actual, predicted),
      elapsedWeight,
      totalWeight,
      remainingDays: futureDates.length,
      remainingWeekendDays: countWeekendDates(futureDates),
    };
  };

  const weekday = getIsoWeekday(currentDate);
  const weekStart = addIsoDays(currentDate, -((weekday + 6) % 7));
  const weekEnd = addIsoDays(weekStart, 6);
  const monthStart = `${currentDate.slice(0, 7)}-01`;
  const monthEnd = getIsoMonthEnd(currentDate);

  return {
    currentDate,
    dayProgress,
    lookbackDays: safeLookbackDays,
    formula: "actual_to_date * total_weighted_days / elapsed_weighted_days; weekday weights learned from completed Casso AEP days and smoothed with a weekend uplift prior",
    weekdayWeights: weekdayWeights.map((item) => ({
      weekday: item.weekday,
      weight: Math.round(item.weight * 100) / 100,
      averageAmount: Math.round(item.averageAmount),
      samples: item.samples,
    })),
    week: projectPeriod(weekStart, weekEnd),
    month: projectPeriod(monthStart, monthEnd),
  };
}

export interface WeeklyAepRevenuePoint {
  weekStart: string;   // "2026-08-03"
  weekEnd: string;     // "2026-08-09"
  amount: number;      // VND
}

export async function getWeeklyAepRevenue(weeks = 12): Promise<WeeklyAepRevenuePoint[]> {
  const safeWeeks = Math.max(4, Math.min(52, Math.round(Number(weeks) || 12)));
  const { rows } = await getPool().query(
    `WITH params AS (
       SELECT date_trunc('week', (NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)::date AS current_week_start
     ),
     week_series AS (
       SELECT generate_series(
         (SELECT current_week_start FROM params) - ($1::int - 1) * INTERVAL '1 week',
         (SELECT current_week_start FROM params),
         INTERVAL '1 week'
       )::date AS week_start
     ),
     revenue_by_week AS (
       SELECT
         date_trunc('week', booking_date)::date AS week_start,
         COALESCE(SUM(amount), 0) AS amount
       FROM casso_transactions, params
       WHERE is_incoming = TRUE
         AND is_aep = TRUE
         AND booking_date >= params.current_week_start - ($1::int - 1) * INTERVAL '1 week'
         AND booking_date < params.current_week_start + INTERVAL '1 week'
       GROUP BY 1
     )
     SELECT
       week_series.week_start::text AS week_start,
       (week_series.week_start + INTERVAL '6 days')::date::text AS week_end,
       CAST(COALESCE(revenue_by_week.amount, 0) AS FLOAT) AS amount
     FROM week_series
     LEFT JOIN revenue_by_week ON revenue_by_week.week_start = week_series.week_start
     ORDER BY week_series.week_start ASC`,
    [safeWeeks]
  );

  return rows.map((row) => ({
    weekStart: String(row.week_start),
    weekEnd: String(row.week_end),
    amount: Number(row.amount) || 0,
  }));
}

export interface HourlyAepRevenuePoint {
  hour: string;        // "2026-08-04 13:00"
  date: string;        // "2026-08-04"
  hourOfDay: number;   // 0-23
  amount: number;      // VND
}

export async function getHourlyAepRevenue(hours = 168): Promise<HourlyAepRevenuePoint[]> {
  const safeHours = Math.max(24, Math.min(24 * 31, Math.round(Number(hours) || 168)));
  const { rows } = await getPool().query(
    `WITH params AS (
       SELECT date_trunc('hour', NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh') AS end_hour
     ),
     hour_series AS (
       SELECT generate_series(
         (SELECT end_hour FROM params) - ($1::int - 1) * INTERVAL '1 hour',
         (SELECT end_hour FROM params),
         INTERVAL '1 hour'
       ) AS hour_value
     ),
     revenue_by_hour AS (
       SELECT
         date_trunc('hour', transaction_at AT TIME ZONE 'Asia/Ho_Chi_Minh') AS hour_value,
         COALESCE(SUM(amount), 0) AS amount
       FROM casso_transactions, params
       WHERE is_incoming = TRUE
         AND is_aep = TRUE
         AND transaction_at IS NOT NULL
         AND (transaction_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= (params.end_hour - ($1::int - 1) * INTERVAL '1 hour')
         AND (transaction_at AT TIME ZONE 'Asia/Ho_Chi_Minh') < (params.end_hour + INTERVAL '1 hour')
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
    [safeHours]
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
        AND transaction_at IS NOT NULL
        AND (transaction_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = params.today_date
        AND (transaction_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time <= params.cutoff_time
    ),
    last_week_total AS (
      SELECT COALESCE(SUM(amount), 0) AS amount
      FROM casso_transactions, params
      WHERE is_incoming = TRUE AND is_aep = TRUE
        AND transaction_at IS NOT NULL
        AND (transaction_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = params.last_week_date
        AND (transaction_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::time <= params.cutoff_time
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
