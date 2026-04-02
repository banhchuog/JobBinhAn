import { Pool } from "pg";
import { Job, Employee, ManualEntry, CassoTransactionRecord } from "@/types";

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
  await pool.query(`CREATE TABLE IF NOT EXISTS employees (id TEXT PRIMARY KEY, name TEXT NOT NULL, balance DECIMAL DEFAULT 0)`);  await pool.query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS profile JSONB DEFAULT '{}'`);  await pool.query(`CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, data JSONB NOT NULL)`);
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
}

// ─── Settings ───────────────────────────────────────────
export async function getSetting(key: string): Promise<unknown | null> {
  const { rows } = await getPool().query(`SELECT data FROM settings WHERE key = $1`, [key]);
  return rows.length > 0 ? rows[0].data : null;
}

export async function upsertSetting(key: string, data: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO settings (key, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = NOW()`,
    [key, JSON.stringify(data)]
  );
}

// ─── AEP Classifications ────────────────────────────────
export async function getAepClassification(month: string): Promise<{ expenses: Record<string, boolean>; salaryAssignments: Record<string, boolean>; manualEntries: Record<string, boolean> } | null> {
  const { rows } = await getPool().query(`SELECT data FROM aep_classifications WHERE month = $1`, [month]);
  return rows.length > 0 ? rows[0].data : null;
}

export async function upsertAepClassification(month: string, data: { expenses: Record<string, boolean>; salaryAssignments: Record<string, boolean>; manualEntries: Record<string, boolean> }): Promise<void> {
  await getPool().query(
    `INSERT INTO aep_classifications (month, data, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (month) DO UPDATE SET data = $2, updated_at = NOW()`,
    [month, JSON.stringify(data)]
  );
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
  const { rows } = await getPool().query(`SELECT id, name, CAST(balance AS FLOAT) as balance, profile FROM employees ORDER BY name`);
  return rows as Employee[];
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const { rows } = await getPool().query(`SELECT id, name, CAST(balance AS FLOAT) as balance, profile FROM employees WHERE id = $1`, [id]);
  return rows.length > 0 ? (rows[0] as Employee) : null;
}

export async function createEmployee(employee: Employee): Promise<Employee> {
  await getPool().query(`INSERT INTO employees (id, name, balance) VALUES ($1, $2, $3)`, [employee.id, employee.name, employee.balance]);
  return employee;
}

export async function updateEmployee(updated: Employee): Promise<Employee | null> {
  const { rowCount } = await getPool().query(
    `UPDATE employees SET name = $1, balance = $2, profile = $3 WHERE id = $4`,
    [updated.name, updated.balance, JSON.stringify(updated.profile ?? {}), updated.id]
  );
  return (rowCount ?? 0) > 0 ? updated : null;
}

export async function deleteEmployee(id: string): Promise<boolean> {
  const { rowCount } = await getPool().query(`DELETE FROM employees WHERE id = $1`, [id]);
  return (rowCount ?? 0) > 0;
}

// ─── Manual Salary ─────────────────────────────────────
export async function getAllManualEntries(): Promise<ManualEntry[]> {
  const { rows } = await getPool().query(
    `SELECT id, emp_id AS "empId", month, title, CAST(amount AS FLOAT) AS amount, note FROM manual_salary ORDER BY created_at DESC`
  );
  return rows as ManualEntry[];
}

export async function createManualEntry(entry: ManualEntry): Promise<ManualEntry> {
  await getPool().query(
    `INSERT INTO manual_salary (id, emp_id, month, title, amount, note) VALUES ($1, $2, $3, $4, $5, $6)`,
    [entry.id, entry.empId, entry.month, entry.title, entry.amount, entry.note]
  );
  return entry;
}

export async function deleteManualEntry(id: string): Promise<boolean> {
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
        raw,
        updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (transaction_id) DO UPDATE SET
        booking_date = EXCLUDED.booking_date,
        amount = EXCLUDED.amount,
        is_incoming = EXCLUDED.is_incoming,
        is_aep = EXCLUDED.is_aep,
        description = EXCLUDED.description,
        counter_account_name = EXCLUDED.counter_account_name,
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
        JSON.stringify(transaction.raw),
      ]
    );
  }

  return transactions.length;
}

export async function getDailyAepRevenue(): Promise<Record<string, number>> {
  const { rows } = await getPool().query(
    `SELECT booking_date::text AS date, CAST(SUM(amount) AS FLOAT) AS amount
     FROM casso_transactions
     WHERE is_incoming = TRUE 
       AND is_aep = TRUE
       AND booking_date >= CURRENT_DATE - INTERVAL '30 days'
     GROUP BY booking_date
     ORDER BY booking_date ASC`
  );

  return rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.date as string] = Number(row.amount) || 0;
    return acc;
  }, {});
}
