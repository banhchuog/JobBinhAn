"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Job, Employee, ManualEntry, JobAssignment, EmployeeProfile } from "@/types";
import {
  Briefcase, Users, PlusCircle, CheckCircle2, Clock,
  DollarSign, RefreshCw, LogOut, UserPlus, ChevronLeft, ChevronRight, Trophy,
  Wallet, BadgeCheck, AlertCircle, CalendarDays, Trash2, Pencil,
  Search, Download, Copy, MessageSquare, X, Sparkles, Timer, Share2, ArrowUpDown, ChevronDown,
  Save, CheckCircle, Loader2, FileSpreadsheet, XCircle, History, RotateCcw,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, ReferenceLine, Cell,
} from "recharts";

type View = "LOGIN" | "DIRECTOR" | "EMPLOYEE";

interface ThuChiTransaction {
  id: number;
  date: string;        // "YYYY-MM-DD"
  type: "Thu" | "Chi";
  subject: string;
  amount: number;
  currency: "VND" | "USD";
  note: string;
  created_by: string;
}

type AepClassificationState = {
  expenses: Record<string, boolean>;
  expenseKeys: Record<string, boolean>;
  salaryAssignments: Record<string, boolean>;
  manualEntries: Record<string, boolean>;
};

type AepHistoryEntry = {
  id: number;
  month: string;
  source: string;
  createdAt: string;
  data: AepClassificationState;
};

const DIRECTOR_PASS = "123";

const EMPTY_AEP_CLASSIFICATION: AepClassificationState = {
  expenses: {},
  expenseKeys: {},
  salaryAssignments: {},
  manualEntries: {},
};

function countCheckedEntries(values: Record<string, boolean>) {
  return Object.values(values).filter(Boolean).length;
}

function formatHistoryTimestamp(value: string) {
  if (!value) return "";
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getAepHistorySourceLabel(source: string) {
  if (source.startsWith("restore:")) return "Khôi phục";
  if (source === "bootstrap") return "Ảnh hiện tại";
  if (source === "save") return "Lưu";
  return source;
}

/** Trả về tháng lương (YYYY-MM) của 1 assignment.
 *  Nếu approvedAt <= ngày 5 tháng M+1 → tính vào tháng M (tháng của job).
 *  Fallback: dùng month của job. */
function getSalaryMonth(jobMonth: string, approvedAt?: string): string {
  if (!approvedAt) return jobMonth;
  const approved = new Date(approvedAt);
  // Ngày 5 tháng kế tiếp của jobMonth
  const [y, m] = jobMonth.split("-").map(Number);
  const cutoff = new Date(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 5, 23, 59, 59); // ngày 5 tháng M+1
  return approved <= cutoff ? jobMonth : `${approved.getFullYear()}-${String(approved.getMonth() + 1).padStart(2, "0")}`;
}

/** Tạo label "Tháng 2/2026" từ "2026-02" */
function monthLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `Tháng ${Number(m)}/${y}`;
}

/** YYYY-MM của thời điểm hiện tại */
function currentYM() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentISODate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

const PAYROLL_BASE_SALARY = 5400000;
const PAYROLL_PERSONAL_DEDUCTION = 15500000;
const PAYROLL_DEPENDENT_DEDUCTION = 6200000;
const PAYROLL_BHXH_RATE = 0.08;
const PAYROLL_BHYT_RATE = 0.015;
const PAYROLL_BHTN_RATE = 0.01;

function calcPersonalIncomeTax(taxableIncome: number) {
  if (taxableIncome <= 0) return 0;
  if (taxableIncome > 80000000) return (taxableIncome * 0.35) - 9850000;
  if (taxableIncome > 52000000) return (taxableIncome * 0.30) - 5850000;
  if (taxableIncome > 32000000) return (taxableIncome * 0.25) - 3250000;
  if (taxableIncome > 18000000) return (taxableIncome * 0.20) - 1650000;
  if (taxableIncome > 10000000) return (taxableIncome * 0.15) - 750000;
  if (taxableIncome > 5000000) return (taxableIncome * 0.10) - 250000;
  return taxableIncome * 0.05;
}

function calcPayrollFromGross(grossIncome: number, dependentCount = 0) {
  let lcs = 0;
  let thuongKPI = 0;
  let bhxh = 0;
  let bhyt = 0;
  let bhtn = 0;
  let tongBH = 0;

  if (grossIncome >= PAYROLL_BASE_SALARY) {
    lcs = PAYROLL_BASE_SALARY;
    thuongKPI = grossIncome - PAYROLL_BASE_SALARY;
    bhxh = PAYROLL_BASE_SALARY * PAYROLL_BHXH_RATE;
    bhyt = PAYROLL_BASE_SALARY * PAYROLL_BHYT_RATE;
    bhtn = PAYROLL_BASE_SALARY * PAYROLL_BHTN_RATE;
    tongBH = bhxh + bhyt + bhtn;
  } else {
    lcs = grossIncome;
  }

  const tnMienThue = 0;
  const tnChiuThue = grossIncome - tnMienThue;
  const gtBanThan = PAYROLL_PERSONAL_DEDUCTION;
  const gtNguoiPhuThuoc = dependentCount * PAYROLL_DEPENDENT_DEDUCTION;
  const tntt = Math.max(0, tnChiuThue - gtBanThan - gtNguoiPhuThuoc - tongBH);
  const thue = Math.max(0, Math.round(calcPersonalIncomeTax(tntt)));
  const thucLinh = grossIncome - tongBH - thue;

  return {
    lcs,
    thuongKPI,
    tongThuNhap: grossIncome,
    tnMienThue,
    tnChiuThue,
    bhxh,
    bhyt,
    bhtn,
    tongBH,
    gtBanThan,
    gtNguoiPhuThuoc,
    tntt,
    thue,
    thucLinh,
  };
}

function calcPayrollFromNet(actualTakeHome: number, dependentCount = 0) {
  if (actualTakeHome <= 0) {
    return calcPayrollFromGross(0, dependentCount);
  }

  const minNetWithInsurance = PAYROLL_BASE_SALARY * (1 - PAYROLL_BHXH_RATE - PAYROLL_BHYT_RATE - PAYROLL_BHTN_RATE);
  if (actualTakeHome < minNetWithInsurance) {
    return calcPayrollFromGross(actualTakeHome, dependentCount);
  }

  let low = PAYROLL_BASE_SALARY;
  let high = Math.max(actualTakeHome + 2000000, PAYROLL_BASE_SALARY);

  while (calcPayrollFromGross(high, dependentCount).thucLinh < actualTakeHome) {
    high += 5000000;
  }

  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2;
    const simulatedNet = calcPayrollFromGross(mid, dependentCount).thucLinh;
    if (simulatedNet < actualTakeHome) low = mid;
    else high = mid;
  }

  const result = calcPayrollFromGross(Math.round(high), dependentCount);
  return {
    ...result,
    thucLinh: actualTakeHome,
  };
}

/** Tính lương thử việc: không bắt buộc đóng BH (hợp đồng thử việc riêng) */
function calcPayrollProbation(grossIncome: number, dependentCount = 0) {
  const tongBH = 0;
  const tnMienThue = 0;
  const tnChiuThue = grossIncome;
  const gtBanThan = PAYROLL_PERSONAL_DEDUCTION;
  const gtNguoiPhuThuoc = dependentCount * PAYROLL_DEPENDENT_DEDUCTION;
  const tntt = Math.max(0, tnChiuThue - gtBanThan - gtNguoiPhuThuoc - tongBH);
  const thue = Math.max(0, Math.round(calcPersonalIncomeTax(tntt)));
  const thucLinh = grossIncome - thue;
  return {
    lcs: 0,
    thuongKPI: grossIncome,
    tongThuNhap: grossIncome,
    tnMienThue,
    tnChiuThue,
    bhxh: 0, bhyt: 0, bhtn: 0,
    tongBH,
    gtBanThan,
    gtNguoiPhuThuoc,
    tntt,
    thue,
    thucLinh,
  };
}

/** Chọn hàm tính lương phù hợp dựa theo trạng thái hợp đồng tháng đó */
function getPayroll(status: 'official' | 'probation' | undefined, grossIncome: number, dependentCount = 0) {
  if (status === 'probation') return calcPayrollProbation(grossIncome, dependentCount);
  return calcPayrollFromGross(grossIncome, dependentCount);
}

type AepShootDay = {
  key: string;
  date: string;
  label: string;
  filmNames: string[];
  sourceLabels: string[];
};

type AepShootConfirmCandidate = {
  key: string;
  date: string;
  label: string;
  filmNames: string[];
  sourceLabels: string[];
  expenses: ThuChiTransaction[];
};

const SHOOT_EXPENSE_HINT_KEYWORDS = [
  "thiet ke", "trang phuc", "phuc trang", "dao cu", "boi canh", "chi phi quay", "ngay quay",
  "quay", "hoa trang", "make up", "am thanh", "anh sang", "ship", "van chuyen", "xang xe",
  "di lai", "an uong", "nuoc uong", "do an", "hien truong", "kyo",
  "dien vien", "quan chung", "khach choi", "dan choi", "bao ve", "khach vip", "khach hang",
  "vai phu", "casting", "bich phuong", "tony tam", "huynh cong khanh", "co gai tre", "nhan vien nu",
  "ban trai", "ve si", "dai gia tau",
];

const SHOOT_EXPENSE_EXCLUDED_KEYWORDS = [
  "bao hiem", "bhxh", "bhyt", "tncn", "paypal", "google cloud", "bandwidth", "stream",
  "bunny", "cdn", "van phong", "luong", "marketing", "ads", "quang cao", "tvc",
  "sitcom", "shortclip", "short clip",
];

function normalizeLooseText(value: string = "") {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9/\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getExpenseStableKey(transaction: ThuChiTransaction) {
  const normalizedSubject = normalizeLooseText(transaction.subject);
  const normalizedNote = normalizeLooseText(transaction.note ?? "");
  return [
    transaction.type,
    transaction.date,
    transaction.currency,
    Number(transaction.amount) || 0,
    normalizedSubject,
    normalizedNote,
  ].join("|");
}

function isCheckedExpense(state: AepClassificationState | null | undefined, transaction: ThuChiTransaction) {
  if (!state) return false;
  return state.expenses[String(transaction.id)] === true || state.expenseKeys[getExpenseStableKey(transaction)] === true;
}

function extractShootInfo(text: string): { filmName: string; day: number; month: number } | null {
  const directMatch = text.match(/ngày\s+quay\s+(.+?)\s+(\d{1,2})\/(\d{1,2})/i);
  if (directMatch) {
    return {
      filmName: directMatch[1].trim(),
      day: Number(directMatch[2]),
      month: Number(directMatch[3]),
    };
  }

  const normalized = normalizeLooseText(text);
  const normalizedMatch = normalized.match(/ngay\s+quay\s+(.+?)\s+(\d{1,2})\/(\d{1,2})/i);
  if (!normalizedMatch) return null;

  return {
    filmName: normalizedMatch[1].trim(),
    day: Number(normalizedMatch[2]),
    month: Number(normalizedMatch[3]),
  };
}

function formatShortDayMonth(date: string) {
  if (!date) return "";
  const [, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}`;
}

function formatFullDate(date: string) {
  if (!date) return "";
  const [year, month, day] = date.split("-");
  return `${Number(day)}/${Number(month)}/${year}`;
}

const WEEKDAY_LABELS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];

function shiftIsoDate(date: string, days: number) {
  if (!date) return "";
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekdayLabel(date: string) {
  if (!date) return "";
  return WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()] ?? "";
}

function formatTrendSigned(value: number) {
  if (value > 0) return `+${value.toFixed(1)}`;
  if (value < 0) return `${value.toFixed(1)}`;
  return "0.0";
}

function includesKeyword(text: string, keywords: string[]) {
  return keywords.some((keyword) => text.includes(keyword));
}

function transactionMentionsDayMonth(transaction: ThuChiTransaction, date: string) {
  const normalized = normalizeLooseText(`${transaction.subject} ${transaction.note ?? ""}`);
  const [, month, day] = date.split("-");
  const variants = [
    `${Number(day)}/${Number(month)}`,
    `${String(Number(day)).padStart(2, "0")}/${String(Number(month)).padStart(2, "0")}`,
    `${Number(day)}-${Number(month)}`,
    `${String(Number(day)).padStart(2, "0")}-${String(Number(month)).padStart(2, "0")}`,
  ];
  return variants.some((variant) => normalized.includes(variant));
}

function isLikelyShootExpense(transaction: ThuChiTransaction, shootDate: string) {
  const normalized = normalizeLooseText(`${transaction.subject} ${transaction.note ?? ""}`);
  if (!normalized) return false;
  if (includesKeyword(normalized, SHOOT_EXPENSE_EXCLUDED_KEYWORDS)) return false;
  if (transaction.type !== "Chi") return false;

  const sameShootDate = transaction.date === shootDate;

  if (includesKeyword(normalized, SHOOT_EXPENSE_HINT_KEYWORDS)) return true;
  if (transactionMentionsDayMonth(transaction, shootDate) && (normalized.includes("chi phi") || normalized.includes("ship") || normalized.includes("quay"))) {
    return true;
  }

  if (sameShootDate) {
    if (normalized.includes("paypal") || normalized.includes("google cloud") || normalized.includes("bao hiem")) return false;
    return true;
  }

  return false;
}

function normalizeRevenueText(value: string) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

/** Phân loại nguồn gửi doanh thu từ thu chi app */
function classifyRevenueSender(subject: string, note?: string): "metub" | "yeah1" | "mcv" | "other" {
  const normalized = normalizeRevenueText(`${subject || ""} ${note || ""}`);

  const hasAny = (keywords: string[]) => keywords.some((keyword) => normalized.includes(keyword));

  if (hasAny(["METUB", "ME TUB", "METUB NETWORK", "CONG TY METUB"])) return "metub";
  if (hasAny(["MCV", "MCVG", "MCV NETWORK", "CONG TY MCV", "MCV GROUP"])) return "mcv";
  if (hasAny(["YEAH1", "YEAH 1", "CONG TY YEAH1", "Y1 NETWORK"])) return "yeah1";
  return "other";
}

type StandardWorkUnit = "episode" | "day";
type ShootingProjectType = "aep" | "ads";

type ShootingCalendarDay = {
  dateKey: string;
  fullLabel: string;
  shortLabel: string;
  ym: string;
  day: number;
  projects: Set<string>;
  groups: Set<string>;
  jobs: Job[];
  jobCount: number;
  totalSalary: number;
  projectList?: string[];
  groupList?: string[];
};

interface ShootingScheduleItem {
  id: string;
  enabled: boolean;
  name: string;
  jobCategory: string;
  workUnit: StandardWorkUnit;
  quantity?: number;
  ratePerUnit: number;
}

const SHOOTING_PROJECT_TYPE_OPTIONS: Array<{ value: ShootingProjectType; label: string; note: string }> = [
  { value: "aep", label: "Anh Em Phim", note: "Kịch bản, dựng phim, đạo diễn" },
  { value: "ads", label: "Quảng cáo", note: "Thêm storyboard và hậu kỳ quảng cáo" },
];

const SHOOTING_SCHEDULE_PRESETS: Record<ShootingProjectType, Array<Omit<ShootingScheduleItem, "id" | "enabled">>> = {
  aep: [
    { name: "Kịch bản", jobCategory: "Kịch bản", workUnit: "episode", ratePerUnit: 2_000_000 },
    { name: "Dựng phim", jobCategory: "Hậu kỳ", workUnit: "episode", ratePerUnit: 3_000_000 },
    { name: "Đạo diễn", jobCategory: "Đạo diễn", workUnit: "day", ratePerUnit: 3_000_000 },
  ],
  ads: [
    { name: "Kịch bản", jobCategory: "Kịch bản", workUnit: "episode", ratePerUnit: 2_000_000 },
    { name: "Storyboard vẽ tay", jobCategory: "Storyboard", workUnit: "episode", ratePerUnit: 2_000_000 },
    { name: "Storyboard AI", jobCategory: "Storyboard", workUnit: "episode", ratePerUnit: 1_000_000 },
    { name: "Dựng phim", jobCategory: "Hậu kỳ", workUnit: "episode", ratePerUnit: 2_000_000 },
    { name: "Đạo diễn", jobCategory: "Đạo diễn", workUnit: "day", ratePerUnit: 3_000_000 },
  ],
};

function createShootingScheduleItems(projectType: ShootingProjectType): ShootingScheduleItem[] {
  return SHOOTING_SCHEDULE_PRESETS[projectType].map((item, index) => ({
    ...item,
    id: `${projectType}-${index}-${item.name}`,
    enabled: true,
  }));
}

function getShootingScheduleItemQuantity(item: ShootingScheduleItem, fallbackCount: number) {
  const quantity = Math.floor(Number(item.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) return fallbackCount;
  return Math.min(quantity, fallbackCount);
}

function getShootingDayStaffQuantity(item: ShootingScheduleItem) {
  const quantity = Math.floor(Number(item.quantity));
  if (!Number.isFinite(quantity) || quantity <= 0) return 1;
  return quantity;
}

function getShootingEpisodeUnitLabel(projectType: ShootingProjectType) {
  return projectType === "ads" ? "clip" : "tập";
}

const JOB_CATEGORY_OPTIONS = [
  "Hậu kỳ",
  "Kịch bản",
  "Storyboard",
  "Đạo diễn",
  "Quay phim",
  "Ánh sáng",
  "Thu âm",
  "Thiết kế",
  "VFX",
  "Khác",
] as const;

function getWorkUnitLabel(unit: StandardWorkUnit | undefined, count?: number) {
  const normalizedUnit = unit ?? "episode";
  if (normalizedUnit === "day") return count === 1 ? "ngày" : "ngày";
  return count === 1 ? "tập" : "tập";
}

function getWorkUnitRateLabel(unit: StandardWorkUnit | undefined) {
  return unit === "day" ? "ngày" : "tập";
}

function parseEpisodeLabelInput(value: string) {
  const normalized = value
    .replace(/[\n,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return { normalized: "", count: 0, items: [] as string[] };

  const isPlainCount = /^\d+$/.test(normalized);
  if (isPlainCount) {
    const count = Math.max(0, Number(normalized));
    return {
      normalized: Array.from({ length: count }, (_, index) => String(index + 1)).join(" "),
      count,
      items: Array.from({ length: count }, (_, index) => String(index + 1)),
    };
  }

  const compact = normalized.replace(/^(tập|clip)\s*/i, "");
  const parts = compact
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    normalized,
    count: parts.length,
    items: parts,
  };
}

function parseDayLabelInput(value: string) {
  const normalized = value
    .replace(/[\n,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return { normalized: "", count: 0, items: [] as string[] };

  const compact = normalized.replace(/^ngày\s*/i, "");
  const parts = compact
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);

  return {
    normalized,
    count: parts.length,
    items: parts,
  };
}

function buildStandardJobTitle(category: string, projectName: string, episodeLabel?: string) {
  const normalizedCategory = category.trim();
  const normalizedProject = projectName.trim();
  const normalizedEpisodeLabel = episodeLabel?.trim();
  return [
    [normalizedCategory, normalizedProject].filter(Boolean).join(" "),
    normalizedEpisodeLabel ? `Tập ${normalizedEpisodeLabel.replace(/^tập\s*/i, "")}` : "",
  ].filter(Boolean).join(" · ");
}

function getIsoDateParts(dateValue: string) {
  const [yearValue, monthValue, dayValue] = dateValue.split("-").map(Number);
  if (!yearValue || !monthValue || !dayValue) return null;
  const date = new Date(yearValue, monthValue - 1, dayValue);
  if (Number.isNaN(date.getTime())) return null;
  const day = String(dayValue).padStart(2, "0");
  const month = String(monthValue).padStart(2, "0");
  return {
    year: yearValue,
    month: monthValue,
    day: dayValue,
    ym: `${yearValue}-${month}`,
    shortLabel: `${day}/${month}`,
    fullLabel: `${day}/${month}/${yearValue}`,
  };
}

type IsoDateParts = NonNullable<ReturnType<typeof getIsoDateParts>>;

type CalendarDateCell = IsoDateParts & {
  isoDate: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

function formatIsoDateParts(date: IsoDateParts) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function addMonthsToYM(ym: string, delta: number) {
  const [yearValue, monthValue] = ym.split("-").map(Number);
  const date = new Date(yearValue, (monthValue || 1) - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getCalendarMonthCells(ym: string): CalendarDateCell[] {
  const [yearValue, monthValue] = ym.split("-").map(Number);
  const year = yearValue || new Date().getFullYear();
  const month = monthValue || new Date().getMonth() + 1;
  const firstDay = new Date(year, month - 1, 1);
  const leadingDays = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month - 1, 1 - leadingDays);
  const today = currentISODate();

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + index);
    const dateParts = getIsoDateParts(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`);
    const isoDate = dateParts ? formatIsoDateParts(dateParts) : currentISODate();
    return {
      ...(dateParts ?? getIsoDateParts(today)!),
      isoDate,
      inCurrentMonth: date.getMonth() === month - 1,
      isToday: isoDate === today,
    };
  });
}

function normalizeShootingDateToken(token: string, fallbackYear = new Date().getFullYear()) {
  const trimmed = token.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split("-").map(Number);
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!slashMatch) return "";
  const day = Number(slashMatch[1]);
  const month = Number(slashMatch[2]);
  const rawYear = slashMatch[3] ? Number(slashMatch[3]) : fallbackYear;
  const year = rawYear < 100 ? 2000 + rawYear : rawYear;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseShootingDateInput(value: string) {
  const normalized = value
    .replace(/[\n;]+/g, " ")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return { normalized: "", count: 0, items: [] as IsoDateParts[] };

  const seen = new Set<string>();
  const items = normalized
    .split(" ")
    .map((token) => normalizeShootingDateToken(token))
    .filter(Boolean)
    .map((date) => getIsoDateParts(date))
    .filter((date): date is IsoDateParts => !!date)
    .filter((date) => {
      const key = `${date.ym}-${String(date.day).padStart(2, "0")}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => `${left.ym}-${String(left.day).padStart(2, "0")}`.localeCompare(`${right.ym}-${String(right.day).padStart(2, "0")}`));

  return {
    normalized: items.map((item) => `${item.year}-${String(item.month).padStart(2, "0")}-${String(item.day).padStart(2, "0")}`).join(" "),
    count: items.length,
    items,
  };
}

function buildShootingScheduleJobTitle(itemName: string, projectName: string, unitLabel: string, workUnit: StandardWorkUnit, episodeUnitLabel = "Tập") {
  const normalizedItem = itemName.trim();
  const normalizedProject = projectName.trim();
  const normalizedUnitLabel = unitLabel.trim();
  const suffix = workUnit === "episode"
    ? `${episodeUnitLabel} ${normalizedUnitLabel.replace(/^tập\s*/i, "").replace(/^clip\s*/i, "")}`
    : `Ngày quay ${normalizedUnitLabel}`;
  return [normalizedItem, normalizedProject, suffix].filter(Boolean).join(" · ");
}

function getShootingCalendarTheme(day: ShootingCalendarDay) {
  const haystack = [
    ...Array.from(day.groups),
    ...Array.from(day.projects),
    ...(day.groupList ?? []),
    ...(day.projectList ?? []),
    ...day.jobs.flatMap((job) => [job.groupName, job.description, job.projectName]),
  ].filter(Boolean).join(" ").toLowerCase();

  if (haystack.includes("quảng cáo")) {
    return {
      card: "border-teal-200 bg-teal-50/70",
      dateBox: "bg-teal-600 text-white",
      titleText: "text-teal-700",
      badge: "text-teal-700 bg-white border border-teal-200",
      button: "bg-teal-600 hover:bg-teal-700 text-white",
      icon: "text-teal-600",
    };
  }

  return {
    card: "border-orange-200 bg-orange-50/60",
    dateBox: "bg-orange-500 text-white",
    titleText: "text-orange-700",
    badge: "text-orange-700 bg-white border border-orange-200",
    button: "bg-orange-500 hover:bg-orange-600 text-white",
    icon: "text-orange-500",
  };
}

function getJobCategoryLabel(job: Job) {
  if (job.jobType === "mini") return "Mini";
  return job.jobCategory?.trim() || "Chưa phân loại";
}

function getJobCategoryBadgeClass(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === "mini") return "bg-purple-100 text-purple-700 border border-purple-200";
  if (normalized.includes("hậu kỳ")) return "bg-blue-100 text-blue-700 border border-blue-200";
  if (normalized.includes("đạo diễn")) return "bg-amber-100 text-amber-700 border border-amber-200";
  if (normalized.includes("kịch bản")) return "bg-emerald-100 text-emerald-700 border border-emerald-200";
  if (normalized.includes("storyboard")) return "bg-teal-100 text-teal-700 border border-teal-200";
  if (normalized.includes("quay phim")) return "bg-cyan-100 text-cyan-700 border border-cyan-200";
  if (normalized.includes("ánh sáng")) return "bg-yellow-100 text-yellow-700 border border-yellow-200";
  if (normalized.includes("thu âm")) return "bg-pink-100 text-pink-700 border border-pink-200";
  if (normalized.includes("thiết kế")) return "bg-rose-100 text-rose-700 border border-rose-200";
  if (normalized.includes("vfx")) return "bg-indigo-100 text-indigo-700 border border-indigo-200";
  return "bg-slate-100 text-slate-700 border border-slate-200";
}

function getJobCategorySurfaceClass(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === "mini") {
    return {
      cardBg: "bg-violet-50 border border-violet-200",
      accentText: "text-violet-700",
      barBg: "bg-violet-200",
      barFill: "bg-violet-400",
      btnClass: "bg-violet-500 hover:bg-violet-600 text-white",
    };
  }
  if (normalized.includes("hậu kỳ")) {
    return {
      cardBg: "bg-blue-50 border border-blue-200",
      accentText: "text-blue-700",
      barBg: "bg-blue-200",
      barFill: "bg-blue-500",
      btnClass: "bg-blue-600 hover:bg-blue-700 text-white",
    };
  }
  if (normalized.includes("đạo diễn")) {
    return {
      cardBg: "bg-amber-50 border border-amber-200",
      accentText: "text-amber-700",
      barBg: "bg-amber-200",
      barFill: "bg-amber-400",
      btnClass: "bg-amber-500 hover:bg-amber-600 text-white",
    };
  }
  if (normalized.includes("kịch bản") || normalized.includes("storyboard")) {
    return {
      cardBg: "bg-emerald-50 border border-emerald-200",
      accentText: "text-emerald-700",
      barBg: "bg-emerald-200",
      barFill: "bg-emerald-500",
      btnClass: "bg-emerald-600 hover:bg-emerald-700 text-white",
    };
  }
  if (normalized.includes("quay phim")) {
    return {
      cardBg: "bg-cyan-50 border border-cyan-200",
      accentText: "text-cyan-700",
      barBg: "bg-cyan-200",
      barFill: "bg-cyan-500",
      btnClass: "bg-cyan-600 hover:bg-cyan-700 text-white",
    };
  }
  if (normalized.includes("ánh sáng")) {
    return {
      cardBg: "bg-yellow-50 border border-yellow-200",
      accentText: "text-yellow-700",
      barBg: "bg-yellow-200",
      barFill: "bg-yellow-400",
      btnClass: "bg-yellow-500 hover:bg-yellow-600 text-white",
    };
  }
  if (normalized.includes("thu âm")) {
    return {
      cardBg: "bg-pink-50 border border-pink-200",
      accentText: "text-pink-700",
      barBg: "bg-pink-200",
      barFill: "bg-pink-400",
      btnClass: "bg-pink-500 hover:bg-pink-600 text-white",
    };
  }
  if (normalized.includes("thiết kế")) {
    return {
      cardBg: "bg-rose-50 border border-rose-200",
      accentText: "text-rose-700",
      barBg: "bg-rose-200",
      barFill: "bg-rose-400",
      btnClass: "bg-rose-500 hover:bg-rose-600 text-white",
    };
  }
  if (normalized.includes("vfx")) {
    return {
      cardBg: "bg-indigo-50 border border-indigo-200",
      accentText: "text-indigo-700",
      barBg: "bg-indigo-200",
      barFill: "bg-indigo-500",
      btnClass: "bg-indigo-600 hover:bg-indigo-700 text-white",
    };
  }
  return {
    cardBg: "bg-slate-50 border border-slate-200",
    accentText: "text-slate-700",
    barBg: "bg-slate-200",
    barFill: "bg-slate-500",
    btnClass: "bg-slate-600 hover:bg-slate-700 text-white",
  };
}

function toEndOfDayIso(dateValue: string) {
  if (!dateValue) return undefined;
  const date = new Date(`${dateValue}T23:59:59`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

// ── AI Job Group Parser ─────────────────────────────────
interface PreviewJob {
  title: string;
  description: string;
  totalSalary: number;
  month: string;
  expiresAt?: string;
  isOnSite: boolean;
  jobType?: "standard" | "mini";
  jobCategory?: string;
  projectName?: string;
  workUnit?: StandardWorkUnit;
  workUnits?: number;
  ratePerUnit?: number;
  unitPrice?: number;
  totalUnits?: number;
}

type JobEditModalState = {
  id: string;
  jobType: "standard" | "mini";
  title: string;
  description: string;
  month: string;
  jobCategory: string;
  projectName: string;
  workUnit: StandardWorkUnit;
  episodeLabel: string;
  dayLabel: string;
  workUnits: string;
  ratePerUnit: string;
  unitPrice: string;
  totalUnits: string;
  expiresAt: string;
  hasExpiry: boolean;
};

function parseJobGroup(input: string): { groupName: string; jobs: PreviewJob[] } {
  const now = new Date();
  const currentYear = now.getFullYear();

  // Pattern: "ngày quay <tên phim> <DD>/<MM> [tập <N> <N> ...]"
  const shootRegex = /ngày\s+quay\s+(.+?)\s+(\d{1,2})\/(\d{1,2})(?:\s+tập\s+([\d\s,]+))?/i;
  const match = input.match(shootRegex);

  if (match) {
    const filmName = match[1].trim();
    const day = parseInt(match[2]);
    const month = parseInt(match[3]);
    const year = (month < now.getMonth() + 1 - 3) ? currentYear + 1 : currentYear;
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const expiresAt = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();

    // Parse tập: "1 2" → [1, 2]
    const episodeStr = (match[4] || "").trim();
    const episodes = episodeStr.match(/\d+/g)?.map(Number) ?? [1];

    const jobs: PreviewJob[] = [];

    // ── Tại chỗ (hết hạn cuối ngày quay) ──────────────
    // 2 Đạo diễn × 3tr
    for (let i = 1; i <= 2; i++) {
      jobs.push({ title: `Đạo diễn ${filmName} (${i})`, description: `Ngày quay ${day}/${month} — ${filmName}`, totalSalary: 3_000_000, month: ym, expiresAt, isOnSite: true });
    }
    // 2 Quay phim × 1.2tr
    for (let i = 1; i <= 2; i++) {
      jobs.push({ title: `Quay phim ${filmName} (Máy ${i})`, description: `Ngày quay ${day}/${month} — ${filmName}`, totalSalary: 1_200_000, month: ym, expiresAt, isOnSite: true });
    }
    // 2 Ánh sáng × 800k
    for (let i = 1; i <= 2; i++) {
      jobs.push({ title: `Ánh sáng ${filmName} (${i})`, description: `Ngày quay ${day}/${month} — ${filmName}`, totalSalary: 800_000, month: ym, expiresAt, isOnSite: true });
    }
    // 1 Thu âm hiện trường × 1tr
    jobs.push({ title: `Thu âm hiện trường ${filmName}`, description: `Ngày quay ${day}/${month} — ${filmName}`, totalSalary: 1_000_000, month: ym, expiresAt, isOnSite: true });

    // ── Hậu kỳ — 1 job dựng / tập × 3tr (không hết hạn) ──
    for (const ep of episodes) {
      jobs.push({
        title: `Dựng phim ${filmName} — Tập ${ep}`,
        description: `Hậu kỳ tập ${ep} — ${filmName}`,
        totalSalary: 3_000_000,
        month: ym,
        isOnSite: false,
      });
    }

    return { groupName: `Ngày quay ${filmName} ${day}/${month}`, jobs };
  }

  // Fallback
  return {
    groupName: input.trim() || "Nhóm job mới",
    jobs: [{ title: input.trim(), description: "", totalSalary: 1_000_000, month: currentYM(), isOnSite: false }],
  };
}


/** Nhận dạng nền tảng mạng xã hội từ URL */
// ── Social channel types ────────────────────────────
interface SocialChannel {
  id: string;
  platform: string; // platform key
  label: string;    // custom display name (empty = use platform default)
  url: string;      // empty = channel not created yet
}
interface SocialGroup {
  id: string;
  name: string;
  channels: SocialChannel[];
}

const PLATFORM_LIST: Array<{ id: string; label: string; bgColor: string; textColor: string; icon: React.ReactNode }> = [
  { id: "facebook",  label: "Facebook",    bgColor: "bg-[#1877F2]", textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.885v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/></svg> },
  { id: "youtube",   label: "YouTube",     bgColor: "bg-[#FF0000]", textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> },
  { id: "tiktok",    label: "TikTok",      bgColor: "bg-gray-900",   textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/></svg> },
  { id: "instagram", label: "Instagram",   bgColor: "bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888]", textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg> },
  { id: "x",         label: "X / Twitter", bgColor: "bg-black",      textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 5.867zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> },
  { id: "zalo",      label: "Zalo",        bgColor: "bg-[#0068FF]",  textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.005 0C5.376 0 0 5.373 0 12c0 2.55.806 4.919 2.173 6.865L.756 23.235l4.565-1.462A11.945 11.945 0 0 0 12.005 24C18.629 24 24 18.627 24 12S18.629 0 12.005 0zm5.822 16.418c-.246.687-1.21 1.259-1.994 1.425-.53.113-1.222.203-3.554-.763-2.984-1.229-4.907-4.265-5.056-4.462-.143-.198-1.2-1.598-1.2-3.047s.751-2.155 1.018-2.45a1.071 1.071 0 0 1 .775-.362c.193 0 .386.003.556.012.178.009.417-.067.653.499.246.584.835 2.033.908 2.179.074.145.122.314.024.505-.099.194-.148.314-.293.484-.146.168-.307.375-.438.504-.146.146-.297.304-.128.597.17.294.753 1.243 1.616 2.013 1.11.991 2.047 1.297 2.34 1.443.295.145.466.121.637-.073.17-.194.732-.854.928-1.147.193-.294.386-.244.651-.146.264.097 1.679.791 1.967.936.288.145.48.218.55.338.071.121.071.696-.175 1.383z"/></svg> },
  { id: "threads",   label: "Threads",     bgColor: "bg-gray-900",   textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5"><path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.583-1.313-.883-2.378-.892h-.036c-.874 0-2.018.241-2.76 1.168l-1.608-1.38c1.114-1.31 2.752-2.032 4.387-2.032h.068c3.019.025 4.819 1.805 5.063 5.021.157.019.314.04.467.066 1.353.229 2.506.86 3.33 1.824 1.14 1.342 1.55 3.21.995 5.124-.64 2.214-2.048 3.915-4.042 4.92-1.769.892-3.901 1.329-6.537 1.347z"/></svg> },
  { id: "website",   label: "Website",     bgColor: "bg-emerald-600", textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><circle cx="12" cy="12" r="9"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg> },
  { id: "other",     label: "Khác",        bgColor: "bg-gray-500",   textColor: "text-white",
    icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> },
];

function getPlatformMeta(platformId: string) {
  return PLATFORM_LIST.find(p => p.id === platformId) ?? PLATFORM_LIST[PLATFORM_LIST.length - 1];
}

function getSocialPlatform(url: string): { icon: React.ReactNode; label: string; bgColor: string; textColor: string } {
  const u = url.toLowerCase();
  if (u.includes("facebook.com") || u.includes("fb.com") || u.includes("fb.watch"))
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.235 2.686.235v2.97h-1.513c-1.491 0-1.956.93-1.956 1.885v2.27h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
      ),
      label: "Facebook", bgColor: "bg-[#1877F2]", textColor: "text-white",
    };
  if (u.includes("youtube.com") || u.includes("youtu.be"))
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      label: "YouTube", bgColor: "bg-[#FF0000]", textColor: "text-white",
    };
  if (u.includes("tiktok.com"))
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z"/>
        </svg>
      ),
      label: "TikTok", bgColor: "bg-gray-900", textColor: "text-white",
    };
  if (u.includes("instagram.com"))
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
        </svg>
      ),
      label: "Instagram", bgColor: "bg-gradient-to-br from-[#f09433] via-[#e6683c] to-[#bc1888]", textColor: "text-white",
    };
  if (u.includes("twitter.com") || u.includes("x.com"))
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.713 5.867zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      ),
      label: "X / Twitter", bgColor: "bg-black", textColor: "text-white",
    };
  if (u.includes("zalo.me") || u.includes("chat.zalo.me"))
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M12.005 0C5.376 0 0 5.373 0 12c0 2.55.806 4.919 2.173 6.865L.756 23.235l4.565-1.462A11.945 11.945 0 0 0 12.005 24C18.629 24 24 18.627 24 12S18.629 0 12.005 0zm5.822 16.418c-.246.687-1.21 1.259-1.994 1.425-.53.113-1.222.203-3.554-.763-2.984-1.229-4.907-4.265-5.056-4.462-.143-.198-1.2-1.598-1.2-3.047s.751-2.155 1.018-2.45a1.071 1.071 0 0 1 .775-.362c.193 0 .386.003.556.012.178.009.417-.067.653.499.246.584.835 2.033.908 2.179.074.145.122.314.024.505-.099.194-.148.314-.293.484-.146.168-.307.375-.438.504-.146.146-.297.304-.128.597.17.294.753 1.243 1.616 2.013 1.11.991 2.047 1.297 2.34 1.443.295.145.466.121.637-.073.17-.194.732-.854.928-1.147.193-.294.386-.244.651-.146.264.097 1.679.791 1.967.936.288.145.48.218.55.338.071.121.071.696-.175 1.383z"/>
        </svg>
      ),
      label: "Zalo", bgColor: "bg-[#0068FF]", textColor: "text-white",
    };
  if (u.includes("threads.net"))
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M12.186 24h-.007c-3.581-.024-6.334-1.205-8.184-3.509C2.35 18.44 1.5 15.586 1.472 12.01v-.017c.03-3.579.879-6.43 2.525-8.482C5.845 1.205 8.6.024 12.18 0h.014c2.746.02 5.043.725 6.826 2.098 1.677 1.29 2.858 3.13 3.509 5.467l-2.04.569c-1.104-3.96-3.898-5.984-8.304-6.015-2.91.022-5.11.936-6.54 2.717C4.307 6.504 3.616 8.914 3.589 12c.027 3.086.718 5.496 2.057 7.164 1.43 1.783 3.631 2.698 6.54 2.717 2.623-.02 4.358-.631 5.8-2.045 1.647-1.613 1.618-3.593 1.09-4.798-.31-.71-.873-1.3-1.634-1.75-.192 1.352-.622 2.446-1.284 3.272-.886 1.102-2.14 1.704-3.73 1.79-1.202.065-2.361-.218-3.259-.801-1.063-.689-1.685-1.74-1.752-2.964-.065-1.19.408-2.285 1.33-3.082.88-.76 2.119-1.207 3.583-1.291a13.853 13.853 0 0 1 3.02.142c-.126-.742-.375-1.332-.75-1.757-.513-.583-1.313-.883-2.378-.892h-.036c-.874 0-2.018.241-2.76 1.168l-1.608-1.38c1.114-1.31 2.752-2.032 4.387-2.032h.068c3.019.025 4.819 1.805 5.063 5.021.157.019.314.04.467.066 1.353.229 2.506.86 3.33 1.824 1.14 1.342 1.55 3.21.995 5.124-.64 2.214-2.048 3.915-4.042 4.92-1.769.892-3.901 1.329-6.537 1.347z"/>
        </svg>
      ),
      label: "Threads", bgColor: "bg-gray-900", textColor: "text-white",
    };
  if (u.includes("anhemphim"))
    return {
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M18 3v2h-2V3H8v2H6V3H4v18h2v-2h2v2h8v-2h2v2h2V3h-2zM8 17H6v-2h2v2zm0-4H6v-2h2v2zm0-4H6V7h2v2zm10 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
        </svg>
      ),
      label: "Anh Em Phim", bgColor: "bg-emerald-600", textColor: "text-white",
    };
  return {
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
      </svg>
    ),
    label: "Link", bgColor: "bg-gray-500", textColor: "text-white",
  };
}

export default function Home() {
  const [view, setView] = useState<View>("LOGIN");
  const [directorPassInput, setDirectorPassInput] = useState("");
  const [passError, setPassError] = useState(false);

  // ── Shared Data ──────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Director State ───────────────────────────────────
  const [newJobCategory, setNewJobCategory] = useState<string>(JOB_CATEGORY_OPTIONS[0]);
  const [newJobCategoryCustom, setNewJobCategoryCustom] = useState<string>("");
  const [newJobProject, setNewJobProject] = useState("");
  const [newJobDesc, setNewJobDesc] = useState("");
  const [newJobRate, setNewJobRate] = useState("");
  const [newJobWorkUnit, setNewJobWorkUnit] = useState<StandardWorkUnit>("episode");
  const [newJobEpisodeLabel, setNewJobEpisodeLabel] = useState("");
  const [newJobDayLabel, setNewJobDayLabel] = useState("");
  const [newJobWorkUnits, setNewJobWorkUnits] = useState("1");
  const [newJobExpiresAt, setNewJobExpiresAt] = useState("");
  const [newJobHasExpiry, setNewJobHasExpiry] = useState(false);
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [directorTab, setDirectorTab] = useState<"jobs" | "employees" | "approvals" | "salary" | "finance">("finance");

  // ── Employee State ───────────────────────────────────
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [claimPercentage, setClaimPercentage] = useState<number>(100);
  const [customPercentage, setCustomPercentage] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYM());
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [employeeView, setEmployeeView] = useState<"market" | "leaderboard" | "profile">("market");

  // Load avatar từ localStorage khi đăng nhập
  useEffect(() => {
    if (currentEmployee) {
      const saved = localStorage.getItem(`avatar_${currentEmployee.id}`);
      setAvatarUrl(saved || null);
    } else {
      setAvatarUrl(null);
    }
  }, [currentEmployee]);

  // ── Director extra state ─────────────────────────────
  const [editingEmployee, setEditingEmployee] = useState<{ id: string; name: string } | null>(null);
  const [profileModal, setProfileModal] = useState<Employee | null>(null);
  const [profileForm, setProfileForm] = useState<Record<string, string>>({});
  const [directorMonth, setDirectorMonth] = useState<string>(currentYM());
  const [jobSearch, setJobSearch] = useState("");
  const [jobSort, setJobSort] = useState<"newest" | "oldest">("newest");
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [jobProjectFilter, setJobProjectFilter] = useState("all");
  const [jobCategoryFilter, setJobCategoryFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState<"all" | "onsite" | "postprod" | "mini">("all");

  // ── Create mode: "none" | "postprod" | "mini" | "shooting" ──
  const [createMode, setCreateMode] = useState<"none" | "postprod" | "mini" | "shooting">("none");

  // mini (hậu kỳ mini)
  const [newJobUnitPrice, setNewJobUnitPrice] = useState("");
  const [newJobTotalUnits, setNewJobTotalUnits] = useState("");
  const [miniTitle, setMiniTitle] = useState("");
  const [miniDesc, setMiniDesc] = useState("");

  // shooting schedule
  const [shootProjectType, setShootProjectType] = useState<ShootingProjectType>("aep");
  const [shootFilmName, setShootFilmName] = useState("");
  const [shootDateInput, setShootDateInput] = useState("");
  const [shootCalendarMonth, setShootCalendarMonth] = useState(currentYM());
  const [shootEpisodeLabel, setShootEpisodeLabel] = useState("1");
  const [shootScheduleItems, setShootScheduleItems] = useState<ShootingScheduleItem[]>(() => createShootingScheduleItems("aep"));

  const [approvingItem, setApprovingItem] = useState<{ jobId: string; assignmentId: string; jobTitle: string; empName: string; salary: number } | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);
  const [staffingDayModal, setStaffingDayModal] = useState<ShootingCalendarDay | null>(null);
  const [staffingSelections, setStaffingSelections] = useState<Record<string, string>>({});

  // ── Manual salary entries ────────────────────────────
  const [manualEntries, setManualEntries] = useState<Record<string, ManualEntry[]>>({});
  const [manualModal, setManualModal] = useState<{ emp: Employee } | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualNote, setManualNote] = useState("");

  // ── Thu Chi integration ──────────────────────────────
  const [thuChiData, setThuChiData] = useState<ThuChiTransaction[] | null>(null);
  const [thuChiLoading, setThuChiLoading] = useState(false);
  const [thuChiError, setThuChiError] = useState<string | null>(null);
  const [financeView, setFinanceView] = useState<"overview" | "month" | "report" | "anhemphim">("overview");
  const [chartRefMonth, setChartRefMonth] = useState<"prev" | "curr">("prev");
  const [overviewFilter, setOverviewFilter] = useState<string>(currentYM); // "all" hoặc ym string, mặc định tháng hiện tại

  // ── Revenue (anhemphim.vn) ─────────────────────────────
  const [revenueData, setRevenueData] = useState<Record<string, number> | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState<string | null>(null);
  const [revenueDebug, setRevenueDebug] = useState<Record<string, unknown> | null>(null);
  const [dailyAepRevenueData, setDailyAepRevenueData] = useState<Record<string, number> | null>(null);
  const [dailyAepRevenueLoading, setDailyAepRevenueLoading] = useState(false);
  const [dailyAepRevenueError, setDailyAepRevenueError] = useState<string | null>(null);
  // AEP: intraday (so sánh cùng thứ cùng giờ)
  const [intradayAepData, setIntradayAepData] = useState<{
    todayDate: string; lastWeekDate: string; cutoffTime: string;
    weekdayName: string; today: number; lastWeek: number;
  } | null>(null);
  const [intradayAepLoading, setIntradayAepLoading] = useState(false);
  const [intradayAepError, setIntradayAepError] = useState<string | null>(null);
  // AEP: dữ liệu đã chốt thủ công { expenses: {id: bool}, salaryAssignments: {assignmentId: bool}, manualEntries: {id: bool} }
  const [aepClassification, setAepClassification] = useState<AepClassificationState | null>(null);
  const [aepHistory, setAepHistory] = useState<AepHistoryEntry[]>([]);
  // Draft đang chỉnh trong tab Chốt số liệu
  const [aepDraft, setAepDraft] = useState<AepClassificationState | null>(null);
  const [aepDraftDirty, setAepDraftDirty] = useState(false);
  const [aepRestoringSnapshotId, setAepRestoringSnapshotId] = useState<number | null>(null);
  const [aepRestoreNotice, setAepRestoreNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [aepSubTab, setAepSubTab] = useState<"overview" | "chot">("overview");
  const [aepMonth, setAepMonth] = useState<string>("2026-02");
  const [showAepExportModal, setShowAepExportModal] = useState(false);
  const [aepExportMonths, setAepExportMonths] = useState<string[]>([]);

  // ── AEP Chốt filters ────────────────────────────────
  const [aepFilterExpense, setAepFilterExpense] = useState("");
  const [aepFilterExpenseDateFrom, setAepFilterExpenseDateFrom] = useState("");
  const [aepFilterExpenseDateTo, setAepFilterExpenseDateTo] = useState("");
  const [aepFilterSalary, setAepFilterSalary] = useState("");
  const [aepFilterManual, setAepFilterManual] = useState("");
  const [aepExpandedExpenseDays, setAepExpandedExpenseDays] = useState<Record<string, boolean>>({});
  const [aepExporting, setAepExporting] = useState(false);
  const [aepAiScanning, setAepAiScanning] = useState(false);
  const [aepAiScanNotice, setAepAiScanNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [aepSalaryAiScanning, setAepSalaryAiScanning] = useState(false);
  const [aepSalaryAiNotice, setAepSalaryAiNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [aepManualAiScanning, setAepManualAiScanning] = useState(false);
  const [aepManualAiNotice, setAepManualAiNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const [aepShootConfirmQueue, setAepShootConfirmQueue] = useState<AepShootConfirmCandidate[]>([]);
  const [aepShootDecisions, setAepShootDecisions] = useState<Record<string, boolean>>({});

  // ── Social groups ─────────────────────────────────────
  const [socialGroups, setSocialGroups] = useState<SocialGroup[]>([]);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [addChannelGroupId, setAddChannelGroupId] = useState<string | null>(null);
  const [addChannelStep, setAddChannelStep] = useState<"pick" | "detail">("pick");
  const [newChannelPlatform, setNewChannelPlatform] = useState("");
  const [newChannelLabel, setNewChannelLabel] = useState("");
  const [newChannelUrl, setNewChannelUrl] = useState("");
  const [editChannelId, setEditChannelId] = useState<string | null>(null);
  const [editChannelUrl, setEditChannelUrl] = useState("");
  const [editChannelLabel, setEditChannelLabel] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupName, setEditGroupName] = useState("");
  const [showSalaryPreview, setShowSalaryPreview] = useState(false);
  const [qrPreview, setQrPreview] = useState<{ name: string; amount: number; url: string } | null>(null);
  const [empStatusByMonth, setEmpStatusByMonth] = useState<Record<string, Record<string, 'official' | 'probation'>>>({});
  const [showContractModal, setShowContractModal] = useState(false);
  const [selectedContractEmps, setSelectedContractEmps] = useState<string[]>([]);

  // ── Chia lợi nhuận ───────────────────────────────────
  type ProfitShare = { id: string; name: string; percent: number };
  const [profitShares, setProfitShares] = useState<ProfitShare[]>([]);
  const [showProfitAdd, setShowProfitAdd] = useState(false);
  const [profitAddName, setProfitAddName] = useState("");
  const [profitAddPercent, setProfitAddPercent] = useState("");
  const [editingProfitId, setEditingProfitId] = useState<string | null>(null);
  const [editProfitName, setEditProfitName] = useState("");
  const [editProfitPercent, setEditProfitPercent] = useState("");

  // ── Share job state ──────────────────────────────────
  const [sharingItem, setSharingItem] = useState<{ jobId: string; assignmentId: string; jobTitle: string; currentPct: number; isMini?: boolean; currentUnits?: number } | null>(null);
  const [sharePercInput, setSharePercInput] = useState("");
  const [miniClaimJob, setMiniClaimJob] = useState<Job | null>(null);
  const [miniClaimUnits, setMiniClaimUnits] = useState("1");
  const [miniDoneModal, setMiniDoneModal] = useState<{ job: Job; assignment: JobAssignment } | null>(null);
  // Employee self-service profile state
  const [empProfileFormState, setEmpProfileFormState] = useState<Record<string, string>>({});
  const [empProfileSaving, setEmpProfileSaving] = useState(false);
  const [empProfileSaved, setEmpProfileSaved] = useState(false);
  const [miniDoneUnits, setMiniDoneUnits] = useState("");

  // ── Edit date modal (salary tab) ────────────────────
  const [dateEditModal, setDateEditModal] = useState<{
    job: Job; assignment: JobAssignment;
    createdAt: string; approvedAt: string;
  } | null>(null);
  const [jobEditModal, setJobEditModal] = useState<JobEditModalState | null>(null);

  // ── Bulk select (employee) ───────────────────────────
  const [bulkMode, setBulkMode] = useState<"claim" | "done" | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());

  // ── Group AI modal ───────────────────────────────────
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [previewJobs, setPreviewJobs] = useState<PreviewJob[] | null>(null);
  const [previewGroupName, setPreviewGroupName] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [jobAiReclassifying, setJobAiReclassifying] = useState(false);
  const [jobAiReclassifyNotice, setJobAiReclassifyNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);

  const projectSuggestions = useMemo(
    () => Array.from(new Set(
      jobs
        .map((job) => job.projectName?.trim())
        .filter((value): value is string => !!value)
    )).sort((left, right) => left.localeCompare(right, "vi")),
    [jobs]
  );

  const jobCategoryOptions = useMemo(
    () => Array.from(new Set(jobs.map((job) => getJobCategoryLabel(job)))).sort((left, right) => left.localeCompare(right, "vi")),
    [jobs]
  );

  const uncategorizedStandardJobs = useMemo(
    () => jobs.filter((job) => job.jobType !== "mini" && !job.jobCategory?.trim()),
    [jobs]
  );

  const parsedNewJobEpisodes = useMemo(
    () => parseEpisodeLabelInput(newJobEpisodeLabel),
    [newJobEpisodeLabel]
  );

  const parsedNewJobDays = useMemo(
    () => parseDayLabelInput(newJobDayLabel),
    [newJobDayLabel]
  );

  const standardJobTitlePreview = useMemo(
    () => buildStandardJobTitle(
      newJobCategory === "Khác" ? newJobCategoryCustom.trim() : newJobCategory,
      newJobProject,
      newJobWorkUnit === "episode"
        ? (parsedNewJobEpisodes.count === 1 ? parsedNewJobEpisodes.items[0] : "")
        : ""
    ),
    [newJobCategory, newJobCategoryCustom, newJobProject, newJobWorkUnit, parsedNewJobEpisodes]
  );

  const standardJobTotalPreview = useMemo(
    () => (Number(newJobRate) || 0) * (
      newJobWorkUnit === "episode"
        ? (parsedNewJobEpisodes.count > 0 ? parsedNewJobEpisodes.count : (Number(newJobWorkUnits) || 0))
        : (parsedNewJobDays.count > 0 ? parsedNewJobDays.count : (Number(newJobWorkUnits) || 0))
    ),
    [newJobRate, newJobWorkUnits, newJobWorkUnit, parsedNewJobDays, parsedNewJobEpisodes]
  );

  const parsedShootEpisodes = useMemo(
    () => parseEpisodeLabelInput(shootEpisodeLabel),
    [shootEpisodeLabel]
  );

  const parsedShootDates = useMemo(
    () => parseShootingDateInput(shootDateInput),
    [shootDateInput]
  );

  const shootCalendarCells = useMemo(
    () => getCalendarMonthCells(shootCalendarMonth),
    [shootCalendarMonth]
  );

  const selectedShootDateKeys = useMemo(
    () => new Set(parsedShootDates.items.map(formatIsoDateParts)),
    [parsedShootDates]
  );

  const validShootScheduleItems = useMemo(
    () => shootScheduleItems.filter((item) => item.enabled && item.name.trim() && item.jobCategory.trim() && Number(item.ratePerUnit) > 0),
    [shootScheduleItems]
  );

  const hasShootEpisodeItems = validShootScheduleItems.some((item) => item.workUnit === "episode");
  const shootEpisodeUnitLabel = getShootingEpisodeUnitLabel(shootProjectType);
  const shootEpisodeCount = parsedShootEpisodes.count > 0 ? parsedShootEpisodes.count : 0;
  const shootDateCount = parsedShootDates.count > 0 ? parsedShootDates.count : 0;
  const shootScheduleJobCount = validShootScheduleItems.reduce(
    (total, item) => total + (item.workUnit === "episode" ? getShootingScheduleItemQuantity(item, shootEpisodeCount) : getShootingDayStaffQuantity(item) * shootDateCount),
    0
  );
  const shootScheduleTotalPreview = validShootScheduleItems.reduce(
    (total, item) => total + (Number(item.ratePerUnit) || 0) * (item.workUnit === "episode" ? getShootingScheduleItemQuantity(item, shootEpisodeCount) : getShootingDayStaffQuantity(item) * shootDateCount),
    0
  );

  const shootingCalendarDays = useMemo(() => {
    const byDate = new Map<string, ShootingCalendarDay>();
    const scheduleJobsByGroup = new Map<string, Job[]>();

    for (const job of jobs) {
      const isScheduleJob = job.groupName?.includes("Lịch quay") || job.description?.includes("Lịch quay");
      const groupKey = job.groupId || job.groupName;
      if (!isScheduleJob || !groupKey) continue;
      const groupJobs = scheduleJobsByGroup.get(groupKey) ?? [];
      groupJobs.push(job);
      scheduleJobsByGroup.set(groupKey, groupJobs);
    }

    for (const job of jobs) {
      const isScheduleJob = (job.groupName?.includes("Lịch quay") || job.description?.includes("Lịch quay")) && job.workUnit === "day";
      if (!isScheduleJob || !job.expiresAt) continue;
      const dateParts = getIsoDateParts(job.expiresAt.slice(0, 10));
      if (!dateParts) continue;
      const dateKey = `${dateParts.ym}-${String(dateParts.day).padStart(2, "0")}`;
      const existing = byDate.get(dateKey) ?? {
        dateKey,
        fullLabel: dateParts.fullLabel,
        shortLabel: dateParts.shortLabel,
        ym: dateParts.ym,
        day: dateParts.day,
        projects: new Set<string>(),
        groups: new Set<string>(),
        jobs: [],
        jobCount: 0,
        totalSalary: 0,
      };
      const groupKey = job.groupId || job.groupName;
      const relatedJobs = (groupKey ? scheduleJobsByGroup.get(groupKey) ?? [job] : [job])
        .filter((relatedJob) => {
          if (relatedJob.workUnit !== "day") return true;
          if (!relatedJob.expiresAt) return false;
          const relatedDateParts = getIsoDateParts(relatedJob.expiresAt.slice(0, 10));
          if (!relatedDateParts) return false;
          return `${relatedDateParts.ym}-${String(relatedDateParts.day).padStart(2, "0")}` === dateKey;
        });
      for (const relatedJob of relatedJobs) {
        if (existing.jobs.some((existingJob) => existingJob.id === relatedJob.id)) continue;
        if (relatedJob.projectName?.trim()) existing.projects.add(relatedJob.projectName.trim());
        if (relatedJob.groupName?.trim()) existing.groups.add(relatedJob.groupName.trim());
        existing.jobs.push(relatedJob);
        existing.totalSalary += Number(relatedJob.totalSalary) || 0;
      }
      existing.jobCount = existing.jobs.length;
      byDate.set(dateKey, existing);
    }

    return Array.from(byDate.values())
      .map((day) => ({
        ...day,
        projectList: Array.from(day.projects).sort((left, right) => left.localeCompare(right, "vi")),
        groupList: Array.from(day.groups).sort((left, right) => left.localeCompare(right, "vi")),
      }))
      .sort((left, right) => right.dateKey.localeCompare(left.dateKey));
  }, [jobs]);

  const editJobTotalPreview = useMemo(() => {
    if (!jobEditModal) return 0;
    if (jobEditModal.jobType === "mini") {
      return (Number(jobEditModal.unitPrice) || 0) * (Number(jobEditModal.totalUnits) || 0);
    }
    const parsedEpisodes = parseEpisodeLabelInput(jobEditModal.episodeLabel);
    const parsedDays = parseDayLabelInput(jobEditModal.dayLabel);
    const effectiveWorkUnits = jobEditModal.workUnit === "episode"
      ? (parsedEpisodes.count > 0 ? parsedEpisodes.count : (Number(jobEditModal.workUnits) || 0))
      : (parsedDays.count > 0 ? parsedDays.count : (Number(jobEditModal.workUnits) || 0));
    return (Number(jobEditModal.ratePerUnit) || 0) * effectiveWorkUnits;
  }, [jobEditModal]);

  // ─────────────────────────────────────────────────────
  const fetchAll = useCallback(async (autoLoginCheck = false) => {
    setLoading(true);
    try {
      const [jobsRes, empRes, manualRes] = await Promise.all([
        fetch("/api/jobs"),
        fetch("/api/employees"),
        fetch("/api/manual-salary"),
      ]);
      if (jobsRes.ok) setJobs(await jobsRes.json());
      if (empRes.ok) {
        const empList: Employee[] = await empRes.json();
        setEmployees(empList);
        if (autoLoginCheck) {
          const savedId = localStorage.getItem("savedEmployeeId");
          if (savedId) {
            const found = empList.find((e) => e.id === savedId);
            if (found) {
              setCurrentEmployee(found);
              setView("EMPLOYEE");
            }
          }
        }
      }
      if (manualRes.ok) {
        const flat: ManualEntry[] = await manualRes.json();
        const grouped: Record<string, ManualEntry[]> = {};
        flat.forEach((e) => {
          if (!grouped[e.month]) grouped[e.month] = [];
          grouped[e.month].push(e);
        });
        setManualEntries(grouped);
      }
    } catch {
      // ignore network errors, keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  // Lần đầu load trang: tự kiểm tra đăng nhập đã lưu
  useEffect(() => {
    if (localStorage.getItem("director_session") === "1") {
      setView("DIRECTOR");
    }
    fetchAll(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load social groups từ DB
  useEffect(() => {
    fetch("/api/settings/social_links")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return;
        // Backward compat: nếu data là flat array (format cũ) → migrate thành 1 group
        if (Array.isArray(d) && d.length > 0 && 'url' in d[0]) {
          const migrated: SocialGroup[] = [{
            id: Date.now().toString(),
            name: "Kênh của tôi",
            channels: (d as Array<{ id: string; label: string; url: string }>).map(l => ({
              id: l.id,
              platform: "other",
              label: l.label,
              url: l.url,
            })),
          }];
          setSocialGroups(migrated);
          saveSocialGroups(migrated);
        } else if (Array.isArray(d)) {
          setSocialGroups(d as SocialGroup[]);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSocialGroups = async (groups: SocialGroup[]) => {
    try {
      await fetch("/api/settings/social_links", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(groups),
      });
    } catch { /* ignore */ }
  };

  // Load profit shares từ DB
  useEffect(() => {
    fetch("/api/settings/profit_shares")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setProfitShares(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/settings/employment_status")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d && typeof d === 'object' && !Array.isArray(d)) setEmpStatusByMonth(d); })
      .catch(() => {});
  }, []);

  const saveProfitShares = async (shares: ProfitShare[]) => {
    try {
      await fetch("/api/settings/profit_shares", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(shares),
      });
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (view !== "LOGIN") fetchAll();
  }, [view, fetchAll]);

  // Tự load dữ liệu khi mở trang
  useEffect(() => {
    fetchThuChi();
    fetchRevenue();
    fetchDailyAepRevenue();
    fetchIntradayAepRevenue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tự load lại khi vào tab Finance nếu chưa có data
  useEffect(() => {
    if (directorTab === "finance" && !thuChiData && !thuChiLoading) {
      fetchThuChi();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directorTab]);

  // Fetch AEP classification từ DB khi tháng thay đổi
  useEffect(() => {
    if (financeView !== "anhemphim") return;
    fetch(`/api/aep/${aepMonth}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setAepClassification({
            expenses: d.expenses ?? {},
            expenseKeys: d.expenseKeys ?? {},
            salaryAssignments: d.salaryAssignments ?? {},
            manualEntries: d.manualEntries ?? {},
          });
          setAepHistory(Array.isArray(d.history) ? d.history : []);
        } else {
          setAepClassification(null);
          setAepHistory([]);
        }
        setAepDraftDirty(false);
      })
      .catch(() => {
        setAepClassification(null);
        setAepHistory([]);
        setAepDraftDirty(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aepMonth, financeView]);

  const updateAepDraft = useCallback((updater: (draft: AepClassificationState) => AepClassificationState) => {
    setAepDraft((draft) => (draft ? updater(draft) : draft));
    setAepDraftDirty(true);
  }, []);

  const restoreAepSnapshot = useCallback(async (snapshotId: number) => {
    const confirmed = window.confirm("Khôi phục snapshot này? Toàn bộ tick AEP hiện tại của tháng sẽ quay về đúng thời điểm đã lưu.");
    if (!confirmed) return;

    setAepRestoringSnapshotId(snapshotId);
    setAepRestoreNotice({ tone: "info", text: "Đang khôi phục snapshot AEP..." });

    try {
      const res = await fetch(`/api/aep/${aepMonth}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId }),
      });
      const payload = await res.json().catch(() => null);

      if (!res.ok || !payload?.data) {
        throw new Error(payload?.error || "Không thể khôi phục snapshot AEP.");
      }

      const restored = {
        expenses: payload.data.expenses ?? {},
        expenseKeys: payload.data.expenseKeys ?? {},
        salaryAssignments: payload.data.salaryAssignments ?? {},
        manualEntries: payload.data.manualEntries ?? {},
      };

      setAepClassification(restored);
      setAepDraft(restored);
      setAepDraftDirty(false);
      setAepSubTab("overview");
      if (Array.isArray(payload.history)) setAepHistory(payload.history);
      setAepRestoreNotice({ tone: "success", text: "Đã khôi phục snapshot AEP thành công." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể khôi phục snapshot AEP.";
      setAepRestoreNotice({ tone: "error", text: message });
    } finally {
      setAepRestoringSnapshotId(null);
    }
  }, [aepMonth]);

  useEffect(() => {
    if (financeView !== "anhemphim" || aepSubTab !== "chot" || !aepDraft) return;

    const allChiMonth = thuChiData ? thuChiData.filter((t) => t.type === "Chi" && t.date?.startsWith(aepMonth)) : [];
    const allSalaryAssignmentsMonth = jobs.flatMap((job) =>
      job.assignments.filter((assignment) => {
        if (assignment.status !== "APPROVED") return false;
        const jobMonth = job.month || job.createdAt.slice(0, 7);
        return getSalaryMonth(jobMonth, assignment.approvedAt) === aepMonth;
      }).map((assignment) => ({ job, assignment }))
    );
    const allManualMonth = manualEntries[aepMonth] ?? [];
    const base = aepClassification ?? EMPTY_AEP_CLASSIFICATION;

    setAepDraft((draft) => {
      if (!draft) return draft;

      const nextExpenses = Object.fromEntries(
        allChiMonth.map((transaction) => {
          const id = String(transaction.id);
          const stableKey = getExpenseStableKey(transaction);
          const checked = draft.expenses[id] ?? draft.expenseKeys[stableKey] ?? base.expenses[id] ?? base.expenseKeys[stableKey] ?? false;
          return [id, checked];
        })
      );

      const nextExpenseKeys = Object.fromEntries(
        allChiMonth.map((transaction) => {
          const id = String(transaction.id);
          const stableKey = getExpenseStableKey(transaction);
          const checked = draft.expenseKeys[stableKey] ?? draft.expenses[id] ?? base.expenseKeys[stableKey] ?? base.expenses[id] ?? false;
          return [stableKey, checked];
        })
      );

      const nextSalaryAssignments = Object.fromEntries(
        allSalaryAssignmentsMonth.map(({ assignment }) => [assignment.id, draft.salaryAssignments[assignment.id] ?? base.salaryAssignments[assignment.id] ?? false])
      );

      const nextManualEntries = Object.fromEntries(
        allManualMonth.map((entry) => [entry.id, draft.manualEntries[entry.id] ?? base.manualEntries[entry.id] ?? false])
      );

      return {
        expenses: nextExpenses,
        expenseKeys: nextExpenseKeys,
        salaryAssignments: nextSalaryAssignments,
        manualEntries: nextManualEntries,
      };
    });
  }, [aepClassification, aepMonth, aepSubTab, financeView, jobs, manualEntries, thuChiData]);

  useEffect(() => {
    if (financeView !== "anhemphim" || aepSubTab !== "chot" || !aepDraft || !aepDraftDirty) return;

    const timeout = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/aep/${aepMonth}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(aepDraft),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || "Không thể lưu snapshot AEP.");
        }
        setAepClassification(aepDraft);
        if (Array.isArray(payload?.history)) setAepHistory(payload.history);
        setAepDraftDirty(false);
      } catch {
        // ignore autosave errors, manual save vẫn là fallback
      }
    }, 600);

    return () => window.clearTimeout(timeout);
  }, [aepDraft, aepDraftDirty, aepMonth, aepSubTab, financeView]);

  const aepKnownShootDays = useMemo<AepShootDay[]>(() => {
    const map = new Map<string, { date: string; filmNames: Set<string>; sourceLabels: Set<string> }>();
    const targetMonth = Number(aepMonth.split("-")[1] ?? "0");

    for (const job of jobs) {
      if (job.month !== aepMonth) continue;
      const sourceTexts = [job.groupName, job.description, job.title].filter(Boolean) as string[];
      const info = sourceTexts.map((text) => extractShootInfo(text)).find(Boolean);
      if (!info || info.month !== targetMonth) continue;

      const date = `${aepMonth}-${String(info.day).padStart(2, "0")}`;
      const existing = map.get(date) ?? { date, filmNames: new Set<string>(), sourceLabels: new Set<string>() };
      existing.filmNames.add(info.filmName);
      if (job.groupName) existing.sourceLabels.add(job.groupName);
      else if (job.description) existing.sourceLabels.add(job.description);
      else existing.sourceLabels.add(job.title);
      map.set(date, existing);
    }

    return Array.from(map.values())
      .sort((left, right) => left.date.localeCompare(right.date))
      .map((entry) => ({
        key: entry.date,
        date: entry.date,
        label: formatShortDayMonth(entry.date),
        filmNames: Array.from(entry.filmNames),
        sourceLabels: Array.from(entry.sourceLabels),
      }));
  }, [aepMonth, jobs]);

  const runAepExpenseAiScan = useCallback(async (transactions: ThuChiTransaction[]) => {
    if (transactions.length === 0) {
      setAepAiScanNotice({ tone: "info", text: "Tháng này chưa có khoản chi nào để quét." });
      return;
    }

    const currentState = aepDraft ?? aepClassification;
    const pendingTransactions = transactions.filter((transaction) => !isCheckedExpense(currentState, transaction));

    if (pendingTransactions.length === 0) {
      setAepAiScanNotice({ tone: "info", text: "Các khoản chi tháng này đã được tick hết, AI không cần quét lại." });
      return;
    }

    setAepAiScanning(true);
    setAepAiScanNotice({ tone: "info", text: `AI đang quét ${pendingTransactions.length}/${transactions.length} khoản chi chưa tick...` });

    try {
      const res = await fetch("/api/ai/classify-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: pendingTransactions,
          jobs: [],
          shootDays: aepKnownShootDays.map((shootDay) => ({
            date: shootDay.date,
            label: shootDay.label,
            filmNames: shootDay.filmNames,
            sourceLabels: shootDay.sourceLabels,
          })),
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Không thể quét chi phí AEP.");
      }

      const matchedIds = new Set(
        Object.entries((data?.expenses ?? {}) as Record<string, boolean>)
          .filter(([, isMatched]) => isMatched === true)
          .map(([id]) => String(id))
      );

      const pendingShootGroups = new Map<string, AepShootConfirmCandidate>();
      const shootDayByDate = new Map(aepKnownShootDays.map((shootDay) => [shootDay.date, shootDay]));

      for (const transaction of pendingTransactions) {
        const id = String(transaction.id);
        const textDayMatch = aepKnownShootDays.find((shootDay) => transactionMentionsDayMonth(transaction, shootDay.date));
        const matchedShootDay = textDayMatch ?? shootDayByDate.get(transaction.date);
        if (!matchedShootDay) continue;
        if (!isLikelyShootExpense(transaction, matchedShootDay.date)) continue;

        const decision = aepShootDecisions[matchedShootDay.key];
        if (decision === true) {
          matchedIds.add(id);
          continue;
        }
        if (decision === false || matchedIds.has(id) || aepDraft?.expenses[id]) continue;

        const existingGroup = pendingShootGroups.get(matchedShootDay.key);
        if (existingGroup) {
          existingGroup.expenses.push(transaction);
        } else {
          pendingShootGroups.set(matchedShootDay.key, {
            key: matchedShootDay.key,
            date: matchedShootDay.date,
            label: matchedShootDay.label,
            filmNames: matchedShootDay.filmNames,
            sourceLabels: matchedShootDay.sourceLabels,
            expenses: [transaction],
          });
        }
      }

      let addedCount = 0;
      updateAepDraft((draft) => {
        if (!draft) return draft;
        const nextExpenses = { ...draft.expenses };
        const nextExpenseKeys = { ...draft.expenseKeys };

        for (const transaction of pendingTransactions) {
          const id = String(transaction.id);
          const stableKey = getExpenseStableKey(transaction);
          if (!matchedIds.has(id) || nextExpenses[id]) continue;
          nextExpenses[id] = true;
          nextExpenseKeys[stableKey] = true;
          addedCount += 1;
        }

        return { ...draft, expenses: nextExpenses, expenseKeys: nextExpenseKeys };
      });

      const modalCandidates = Array.from(pendingShootGroups.values()).filter((group) => group.expenses.length > 0);
      setAepShootConfirmQueue(modalCandidates);

      const detectedCount = matchedIds.size;
      const usedHeuristicOnly = data?.source === "heuristic";
      const sourceLabel = usedHeuristicOnly ? "Bộ lọc thông minh" : "AI";

      if (detectedCount === 0 && modalCandidates.length === 0) {
        setAepAiScanNotice({
          tone: "info",
          text: usedHeuristicOnly
            ? `${sourceLabel} chưa thấy khoản chi nào đủ giống chi phí sản xuất phim / streaming video.`
            : `${sourceLabel} chưa thấy khoản chi nào phù hợp với AEP.`,
        });
        return;
      }

      setAepAiScanNotice({
        tone: modalCandidates.length > 0 ? "info" : "success",
        text: modalCandidates.length > 0
          ? `${sourceLabel} đã quét ${pendingTransactions.length} khoản chưa tick, tự chọn ${addedCount} khoản chắc chắn. Còn ${modalCandidates.length} nhóm chi phí ngày quay cần bạn xác nhận thêm.`
          : addedCount > 0
            ? `${sourceLabel} đã quét ${pendingTransactions.length} khoản chưa tick, nhận diện ${detectedCount} khoản phù hợp và tick thêm ${addedCount} khoản.`
            : `${sourceLabel} đã quét ${pendingTransactions.length} khoản chưa tick nhưng chưa thấy khoản nào phù hợp thêm.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể quét chi phí AEP.";
      setAepAiScanNotice({ tone: "error", text: message });
    } finally {
      setAepAiScanning(false);
    }
  }, [aepClassification, aepDraft, aepKnownShootDays, aepShootDecisions, updateAepDraft]);

  const confirmAepShootGroup = useCallback((candidate: AepShootConfirmCandidate) => {
    const ids = candidate.expenses.map((expense) => String(expense.id));
    const newlyChecked = ids.filter((id) => !aepDraft?.expenses[id]).length;

    updateAepDraft((draft) => {
      if (!draft) return draft;
      return {
        ...draft,
        expenses: {
          ...draft.expenses,
          ...Object.fromEntries(ids.map((id) => [id, true])),
        },
        expenseKeys: {
          ...draft.expenseKeys,
          ...Object.fromEntries(candidate.expenses.map((expense) => [getExpenseStableKey(expense), true])),
        },
      };
    });
    setAepShootDecisions((prev) => ({ ...prev, [candidate.key]: true }));
    setAepShootConfirmQueue((prev) => prev.slice(1));
    setAepAiScanNotice({
      tone: "success",
      text: `Đã xác nhận ngày quay ${candidate.label}${candidate.filmNames[0] ? ` — ${candidate.filmNames[0]}` : ""} và chọn ${newlyChecked}/${ids.length} khoản chi.`,
    });
  }, [aepDraft, updateAepDraft]);

  const rejectAepShootGroup = useCallback((candidate: AepShootConfirmCandidate) => {
    setAepShootDecisions((prev) => ({ ...prev, [candidate.key]: false }));
    setAepShootConfirmQueue((prev) => prev.slice(1));
    setAepAiScanNotice({
      tone: "info",
      text: `Bỏ qua nhóm chi phí ngày quay ${candidate.label}${candidate.filmNames[0] ? ` — ${candidate.filmNames[0]}` : ""}.`,
    });
  }, []);

  const runAepSalaryAiScan = useCallback(async (
    salaryRows: Array<{ job: Job; assignment: JobAssignment }>
  ) => {
    if (salaryRows.length === 0) {
      setAepSalaryAiNotice({ tone: "info", text: "Tháng này chưa có khoản lương nào để quét." });
      return;
    }

    setAepSalaryAiScanning(true);
    setAepSalaryAiNotice({ tone: "info", text: "AI đang quét các khoản lương..." });

    try {
      const jobsToScan = Array.from(
        new Map(salaryRows.map(({ job }) => [job.id, { id: job.id, title: job.title, description: job.description }])).values()
      );

      const res = await fetch("/api/ai/classify-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: [], jobs: jobsToScan, manualEntries: [] }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Không thể quét lương AEP.");
      }

      const matchedJobIds = new Set(
        Object.entries((data?.salaryJobs ?? {}) as Record<string, boolean>)
          .filter(([, isMatched]) => isMatched === true)
          .map(([id]) => id)
      );

      let addedCount = 0;
      updateAepDraft((draft) => {
        if (!draft) return draft;
        const nextAssignments = { ...draft.salaryAssignments };
        for (const { job, assignment } of salaryRows) {
          if (!matchedJobIds.has(job.id) || nextAssignments[assignment.id]) continue;
          nextAssignments[assignment.id] = true;
          addedCount += 1;
        }
        return { ...draft, salaryAssignments: nextAssignments };
      });

      if (matchedJobIds.size === 0) {
        setAepSalaryAiNotice({ tone: "info", text: "AI chưa thấy job lương nào phù hợp với AEP." });
        return;
      }

      setAepSalaryAiNotice({
        tone: "success",
        text: addedCount > 0
          ? `AI đã nhận diện ${matchedJobIds.size} job lương AEP và tick thêm ${addedCount} khoản.`
          : `AI nhận diện ${matchedJobIds.size} job lương AEP, nhưng các khoản đó đã được tick sẵn.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể quét lương AEP.";
      setAepSalaryAiNotice({ tone: "error", text: message });
    } finally {
      setAepSalaryAiScanning(false);
    }
  }, [updateAepDraft]);

  const runAepManualAiScan = useCallback(async (
    entries: ManualEntry[],
    employeeMap: Map<string, string>
  ) => {
    if (entries.length === 0) {
      setAepManualAiNotice({ tone: "info", text: "Tháng này chưa có lương thủ công nào để quét." });
      return;
    }

    setAepManualAiScanning(true);
    setAepManualAiNotice({ tone: "info", text: "AI đang quét lương thủ công..." });

    try {
      const manualToScan = entries.map((entry) => ({
        id: entry.id,
        title: entry.title,
        note: entry.note,
        employeeName: employeeMap.get(entry.empId) || entry.empId,
      }));

      const res = await fetch("/api/ai/classify-expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: [], jobs: [], manualEntries: manualToScan }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Không thể quét lương thủ công AEP.");
      }

      const matchedManualIds = new Set(
        Object.entries((data?.manualEntries ?? {}) as Record<string, boolean>)
          .filter(([, isMatched]) => isMatched === true)
          .map(([id]) => id)
      );

      let addedCount = 0;
      updateAepDraft((draft) => {
        if (!draft) return draft;
        const nextManualEntries = { ...draft.manualEntries };
        for (const entry of entries) {
          if (!matchedManualIds.has(entry.id) || nextManualEntries[entry.id]) continue;
          nextManualEntries[entry.id] = true;
          addedCount += 1;
        }
        return { ...draft, manualEntries: nextManualEntries };
      });

      if (matchedManualIds.size === 0) {
        setAepManualAiNotice({ tone: "info", text: "AI chưa thấy khoản lương thủ công nào phù hợp với AEP." });
        return;
      }

      setAepManualAiNotice({
        tone: "success",
        text: addedCount > 0
          ? `AI đã nhận diện ${matchedManualIds.size} khoản lương thủ công AEP và tick thêm ${addedCount} khoản.`
          : `AI nhận diện ${matchedManualIds.size} khoản lương thủ công AEP, nhưng các khoản đó đã được tick sẵn.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Không thể quét lương thủ công AEP.";
      setAepManualAiNotice({ tone: "error", text: message });
    } finally {
      setAepManualAiScanning(false);
    }
  }, [updateAepDraft]);



  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);

  // ─── Auth ────────────────────────────────────────────
  const handleDirectorLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (directorPassInput === DIRECTOR_PASS) {
      setView("DIRECTOR");
      setPassError(false);
      setDirectorPassInput("");
      localStorage.setItem("director_session", "1");
    } else {
      setPassError(true);
    }
  };

  const handleEmployeeLogin = (emp: Employee) => {
    setCurrentEmployee(emp);
    setView("EMPLOYEE");
    localStorage.setItem("savedEmployeeId", emp.id);
  };

  const handleLogout = () => {
    setView("LOGIN");
    setCurrentEmployee(null);
    localStorage.removeItem("savedEmployeeId");
    localStorage.removeItem("director_session");
  };

  // ─── Director: Create Job ───────────────────────────
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    const projectName = newJobProject.trim();
    const effectiveCategory = newJobCategory === "Khác" ? newJobCategoryCustom.trim() : newJobCategory;
    const workUnits = newJobWorkUnit === "episode"
      ? (parsedNewJobEpisodes.count > 0 ? parsedNewJobEpisodes.count : Number(newJobWorkUnits))
      : (parsedNewJobDays.count > 0 ? parsedNewJobDays.count : Number(newJobWorkUnits));
    const ratePerUnit = Number(newJobRate);
    if (!effectiveCategory || !projectName || !Number.isFinite(workUnits) || workUnits <= 0 || !Number.isFinite(ratePerUnit) || ratePerUnit <= 0) return;

    const title = standardJobTitlePreview || buildStandardJobTitle(effectiveCategory, projectName, newJobWorkUnit === "episode" ? parsedNewJobEpisodes.normalized : "");
    const expiresAt = newJobHasExpiry ? toEndOfDayIso(newJobExpiresAt) : undefined;
    setSubmitting(true);
    try {
      if (newJobWorkUnit === "episode" && parsedNewJobEpisodes.count > 1) {
        await fetch("/api/jobs/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobs: parsedNewJobEpisodes.items.map((episode) => ({
              title: buildStandardJobTitle(effectiveCategory, projectName, episode),
              description: newJobDesc.trim(),
              totalSalary: ratePerUnit,
              month: currentYM(),
              jobType: "standard",
              jobCategory: effectiveCategory,
              projectName,
              workUnit: "episode",
              episodeLabel: episode,
              workUnits: 1,
              ratePerUnit,
              ...(expiresAt ? { expiresAt } : {}),
            })),
          }),
        });
      } else {
        await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: newJobDesc.trim(),
            totalSalary: workUnits * ratePerUnit,
            jobType: "standard",
            jobCategory: effectiveCategory,
            projectName,
            workUnit: newJobWorkUnit,
            ...(newJobWorkUnit === "episode" && parsedNewJobEpisodes.normalized ? { episodeLabel: parsedNewJobEpisodes.normalized } : {}),
            ...(newJobWorkUnit === "day" && parsedNewJobDays.normalized ? { dayLabel: parsedNewJobDays.normalized } : {}),
            workUnits,
            ratePerUnit,
            ...(expiresAt ? { expiresAt } : {}),
          }),
        });
      }
      setNewJobCategory(JOB_CATEGORY_OPTIONS[0]);
      setNewJobCategoryCustom("");
      setNewJobProject("");
      setNewJobDesc("");
      setNewJobRate("");
      setNewJobWorkUnit("episode");
      setNewJobEpisodeLabel("");
      setNewJobDayLabel("");
      setNewJobWorkUnits("1");
      setNewJobExpiresAt("");
      setNewJobHasExpiry(false);
      setCreateMode("none");
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Create Mini Clips job ─────────────────
  const handleCreateMiniJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!miniTitle || !newJobUnitPrice || !newJobTotalUnits) return;
    setSubmitting(true);
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: miniTitle,
          description: miniDesc,
          totalSalary: Number(newJobUnitPrice) * Number(newJobTotalUnits),
          jobType: "mini",
          unitPrice: Number(newJobUnitPrice),
          totalUnits: Number(newJobTotalUnits),
        }),
      });
      setMiniTitle(""); setMiniDesc(""); setNewJobUnitPrice(""); setNewJobTotalUnits("");
      setCreateMode("none");
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Create Shooting Day ───────────────────
  const resetShootingScheduleForm = () => {
    setShootFilmName("");
    setShootDateInput("");
    setShootCalendarMonth(currentYM());
    setShootEpisodeLabel("1");
    setShootProjectType("aep");
    setShootScheduleItems(createShootingScheduleItems("aep"));
  };

  const handleToggleShootDate = (isoDate: string) => {
    const nextDates = new Set(parsedShootDates.items.map(formatIsoDateParts));
    if (nextDates.has(isoDate)) {
      nextDates.delete(isoDate);
    } else {
      nextDates.add(isoDate);
    }
    setShootDateInput(Array.from(nextDates).sort((left, right) => left.localeCompare(right)).join(" "));
  };

  const handleCreateShootingDay = async () => {
    const projectName = shootFilmName.trim();
    const shootDates = parsedShootDates.items;
    const activeItems = validShootScheduleItems;
    const hasEpisodeItems = activeItems.some((item) => item.workUnit === "episode");
    if (!projectName || shootDates.length === 0 || activeItems.length === 0 || (hasEpisodeItems && parsedShootEpisodes.count === 0)) return;
    setSubmitting(true);
    try {
      const groupId = Math.random().toString(36).substring(7);
      const projectTypeLabel = SHOOTING_PROJECT_TYPE_OPTIONS.find((option) => option.value === shootProjectType)?.label ?? "Lịch quay";
      const episodeUnitTitle = getShootingEpisodeUnitLabel(shootProjectType).replace(/^./, (letter) => letter.toUpperCase());
      const dateLabel = shootDates.length === 1 ? shootDates[0].shortLabel : `${shootDates[0].shortLabel} +${shootDates.length - 1} ngày`;
      const fullDateLabel = shootDates.map((date) => date.fullLabel).join(", ");
      const primaryMonth = shootDates[0].ym;
      const groupName = `Lịch quay ${projectTypeLabel} - ${projectName} ${dateLabel}`;
      const description = `Lịch quay ${fullDateLabel} - ${projectTypeLabel} - ${projectName}`;
      const jobsToCreate: Array<{
        title: string;
        description: string;
        totalSalary: number;
        month: string;
        expiresAt?: string;
        groupId: string;
        groupName: string;
        jobType: "standard";
        jobCategory: string;
        projectName: string;
        workUnit: StandardWorkUnit;
        episodeLabel?: string;
        dayLabel?: string;
        workUnits: number;
        ratePerUnit: number;
      }> = [];

      for (const item of activeItems) {
        const itemName = item.name.trim();
        const jobCategory = item.jobCategory.trim();
        const ratePerUnit = Number(item.ratePerUnit);
        if (item.workUnit === "episode") {
          const episodesToCreate = parsedShootEpisodes.items.slice(0, getShootingScheduleItemQuantity(item, parsedShootEpisodes.items.length));
          for (const episode of episodesToCreate) {
            jobsToCreate.push({
              title: buildShootingScheduleJobTitle(itemName, projectName, episode, "episode", episodeUnitTitle),
              description,
              totalSalary: ratePerUnit,
              month: primaryMonth,
              groupId,
              groupName,
              jobType: "standard",
              jobCategory,
              projectName,
              workUnit: "episode",
              episodeLabel: episode,
              workUnits: 1,
              ratePerUnit,
            });
          }
        } else {
          const quantityPerDay = getShootingDayStaffQuantity(item);
          for (const dateParts of shootDates) {
            const expiresAt = new Date(dateParts.year, dateParts.month - 1, dateParts.day, 23, 59, 59, 999).toISOString();
            for (let index = 1; index <= quantityPerDay; index += 1) {
              jobsToCreate.push({
                title: `${buildShootingScheduleJobTitle(itemName, projectName, dateParts.shortLabel, "day")}${quantityPerDay > 1 ? ` #${index}` : ""}`,
                description,
                totalSalary: ratePerUnit,
                month: dateParts.ym,
                expiresAt,
                groupId,
                groupName,
                jobType: "standard",
                jobCategory,
                projectName,
                workUnit: "day",
                dayLabel: dateParts.shortLabel,
                workUnits: 1,
                ratePerUnit,
              });
            }
          }
        }
      }

      const res = await fetch("/api/jobs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: jobsToCreate }),
      });
      if (!res.ok) throw new Error("Không thể tạo lịch quay");

      // Reset shooting form
  resetShootingScheduleForm();
      setCreateMode("none");
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Create Employee ───────────────────────

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeName.trim()) return;
    setSubmitting(true);
    try {
      await fetch("/api/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newEmployeeName.trim() }),
      });
      setNewEmployeeName("");
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Approve ───────────────────────────────
  const handleApprove = async (jobId: string, assignmentId: string, note?: string) => {
    setSubmitting(true);
    try {
      await fetch(`/api/jobs/${jobId}/assignments/${assignmentId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      setApprovingItem(null);
      setApproveNote("");
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveAllPending = async () => {
    if (pendingApprovals.length === 0) return;
    if (!confirm(`Duyệt tất cả ${pendingApprovals.length} phần việc đang chờ duyệt?`)) return;

    setSubmitting(true);
    try {
      await Promise.all(
        pendingApprovals.map(({ job, assignment }) =>
          fetch(`/api/jobs/${job.id}/assignments/${assignment.id}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          })
        )
      );
      setApprovingItem(null);
      setApproveNote("");
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Reject (trả lại đang làm) ────────────────────────────────
  const handleReject = async (jobId: string, assignmentId: string) => {
    setSubmitting(true);
    try {
      await fetch(`/api/jobs/${jobId}/assignments/${assignmentId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Delete Job ────────────────────────────
  const handleDeleteJob = async (jobId: string) => {
    if (!confirm("Xoá job này? Hành động không thể hoàn tác.")) return;
    setSubmitting(true);
    try {
      await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  const openJobEditModal = (job: Job) => {
    setJobEditModal({
      id: job.id,
      jobType: job.jobType === "mini" ? "mini" : "standard",
      title: job.title,
      description: job.description || "",
      month: job.month || job.createdAt.slice(0, 7),
      jobCategory: job.jobCategory || (job.jobType === "mini" ? "Mini" : JOB_CATEGORY_OPTIONS[0]),
      projectName: job.projectName || "",
      workUnit: job.workUnit === "day" ? "day" : "episode",
      episodeLabel: job.episodeLabel || "",
      dayLabel: job.dayLabel || "",
      workUnits: String(job.workUnits ?? 1),
      ratePerUnit: String(job.ratePerUnit ?? (job.workUnits ? Math.round(job.totalSalary / job.workUnits) : job.totalSalary ?? 0)),
      unitPrice: String(job.unitPrice ?? 0),
      totalUnits: String(job.totalUnits ?? 1),
      expiresAt: job.expiresAt ? new Date(job.expiresAt).toISOString().slice(0, 10) : "",
      hasExpiry: !!job.expiresAt,
    });
  };

  const handleSaveJobEdit = async () => {
    if (!jobEditModal) return;

    const expiresAt = jobEditModal.hasExpiry ? toEndOfDayIso(jobEditModal.expiresAt) : undefined;
    const parsedEditEpisodes = parseEpisodeLabelInput(jobEditModal.episodeLabel);
    const parsedEditDays = parseDayLabelInput(jobEditModal.dayLabel);
    const body = jobEditModal.jobType === "mini"
      ? {
          title: jobEditModal.title.trim(),
          description: jobEditModal.description,
          month: jobEditModal.month,
          projectName: jobEditModal.projectName.trim() || null,
          jobCategory: jobEditModal.jobCategory.trim() || null,
          totalUnits: Number(jobEditModal.totalUnits),
          unitPrice: Number(jobEditModal.unitPrice),
          totalSalary: (Number(jobEditModal.totalUnits) || 0) * (Number(jobEditModal.unitPrice) || 0),
          expiresAt: expiresAt ?? null,
        }
      : {
          title: jobEditModal.title.trim(),
          description: jobEditModal.description,
          month: jobEditModal.month,
          jobCategory: jobEditModal.jobCategory.trim() || null,
          projectName: jobEditModal.projectName.trim() || null,
          workUnit: jobEditModal.workUnit,
          ...(jobEditModal.workUnit === "episode" && parsedEditEpisodes.normalized
            ? { episodeLabel: parsedEditEpisodes.normalized }
            : { episodeLabel: null }),
          ...(jobEditModal.workUnit === "day" && parsedEditDays.normalized
            ? { dayLabel: parsedEditDays.normalized }
            : { dayLabel: null }),
          workUnits: jobEditModal.workUnit === "episode"
            ? (parsedEditEpisodes.count > 0 ? parsedEditEpisodes.count : Number(jobEditModal.workUnits))
            : (parsedEditDays.count > 0 ? parsedEditDays.count : Number(jobEditModal.workUnits)),
          ratePerUnit: Number(jobEditModal.ratePerUnit),
          totalSalary: (
            jobEditModal.workUnit === "episode"
              ? (parsedEditEpisodes.count > 0 ? parsedEditEpisodes.count : (Number(jobEditModal.workUnits) || 0))
              : (parsedEditDays.count > 0 ? parsedEditDays.count : (Number(jobEditModal.workUnits) || 0))
          ) * (Number(jobEditModal.ratePerUnit) || 0),
          expiresAt: expiresAt ?? null,
        };

    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${jobEditModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Không thể cập nhật job.");
      }
      setJobEditModal(null);
      await fetchAll();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể cập nhật job.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Bulk Delete Jobs ──────────────────────
  const handleBulkDeleteJobs = async () => {
    if (selectedJobIds.size === 0) return;
    if (!confirm(`Xoá ${selectedJobIds.size} job đã chọn? Hành động không thể hoàn tác.`)) return;
    setSubmitting(true);
    try {
      await Promise.all([...selectedJobIds].map((id) => fetch(`/api/jobs/${id}`, { method: "DELETE" })));
      setSelectedJobIds(new Set());
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignStaffingDay = async () => {
    if (!staffingDayModal) return;
    const assignments = staffingDayModal.jobs
      .map((job) => {
        const employeeId = staffingSelections[job.id];
        const employee = employees.find((emp) => emp.id === employeeId);
        return { job, employee };
      })
      .filter((item): item is { job: Job; employee: Employee } => !!item.employee && item.job.assignments.reduce((sum, assignment) => sum + assignment.percentage, 0) < 100);

    if (assignments.length === 0) return;
    setSubmitting(true);
    try {
      await Promise.all(assignments.map(async ({ job, employee }) => {
        const res = await fetch(`/api/jobs/${job.id}/claim`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ employeeId: employee.id, employeeName: employee.name, percentage: 100 }),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error || "Không thể gán nhân sự");
        }
      }));
      setStaffingDayModal(null);
      setStaffingSelections({});
      await fetchAll();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Không thể gán nhân sự");
    } finally {
      setSubmitting(false);
    }
  };

  const handleAiReclassifyLegacyJobs = useCallback(async () => {
    if (uncategorizedStandardJobs.length === 0) {
      setJobAiReclassifyNotice({ tone: "info", text: "Không có job cũ nào chưa phân loại." });
      return;
    }

    setJobAiReclassifying(true);
    setJobAiReclassifyNotice({
      tone: "info",
      text: `AI đang phân loại lại ${uncategorizedStandardJobs.length} job cũ chưa phân loại...`,
    });

    try {
      const res = await fetch("/api/jobs/reclassify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: uncategorizedStandardJobs.map((job) => job.id) }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.error || "Không thể AI phân loại lại job cũ.");
      }

      await fetchAll();

      const updated = Number(data?.updated) || 0;
      const remaining = Number(data?.remaining) || 0;
      const warning = data?.warning ? ` ${data.warning}` : "";

      setJobAiReclassifyNotice({
        tone: updated > 0 ? "success" : "info",
        text: updated > 0
          ? `AI đã phân loại lại ${updated} job cũ.${remaining > 0 ? ` Còn ${remaining} job chưa chắc để bạn xem tay.` : ""}${warning}`
          : `AI chưa đủ chắc để phân loại thêm job nào.${warning}`,
      });
    } catch (error) {
      setJobAiReclassifyNotice({
        tone: "error",
        text: error instanceof Error ? error.message : "Không thể AI phân loại lại job cũ.",
      });
    } finally {
      setJobAiReclassifying(false);
    }
  }, [fetchAll, uncategorizedStandardJobs]);

  // ─── Director: Delete / Rename Employee ─────────────
  const handleDeleteEmployee = async (empId: string) => {
    if (!confirm("Xoá nhân viên này? Lịch sử công việc sẽ mất nếu có.")) return;
    setSubmitting(true);
    try {
      await fetch(`/api/employees/${empId}`, { method: "DELETE" });
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleEmployeeActive = async (emp: Employee) => {
    const action = emp.isActive === false ? "Cho nhân viên này làm lại?" : "Cho nhân viên này thôi việc?";
    if (!confirm(action)) return;
    setSubmitting(true);
    try {
      await fetch(`/api/employees/${emp.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: emp.isActive === false ? true : false }),
      });
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRenameEmployee = async () => {
    if (!editingEmployee || !editingEmployee.name.trim()) return;
    setSubmitting(true);
    try {
      await fetch(`/api/employees/${editingEmployee.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editingEmployee.name.trim() }),
      });
      setEditingEmployee(null);
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Employee: Claim Job ─────────────────────────────
  const handleClaimJob = async () => {
    if (!selectedJob || !currentEmployee) return;
    const isMini = selectedJob.jobType === "mini";
    if (!isMini) {
      const percentage = claimPercentage === -1 ? Number(customPercentage) : claimPercentage;
      if (percentage <= 0 || percentage > 100) { alert("Phần trăm không hợp lệ!"); return; }
    }
    setSubmitting(true);
    try {
      const body = isMini
        ? { employeeId: currentEmployee.id, employeeName: currentEmployee.name, units: 1 }
        : { employeeId: currentEmployee.id, employeeName: currentEmployee.name, percentage: claimPercentage === -1 ? Number(customPercentage) : claimPercentage };
      const res = await fetch(`/api/jobs/${selectedJob.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Lỗi!"); return; }
      setSelectedJob(null); setClaimPercentage(100); setCustomPercentage("");
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Employee: Mark Done ─────────────────────────────
  const handleMarkDone = async (jobId: string, assignmentId: string, units?: number) => {
    setSubmitting(true);
    try {
      await fetch(`/api/jobs/${jobId}/assignments/${assignmentId}/done`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(units !== undefined ? { units } : {}),
      });
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Employee: Bulk Claim ────────────────────────────
  const handleBulkClaim = async () => {
    if (!currentEmployee || bulkSelected.size === 0) return;
    setSubmitting(true);
    try {
      await Promise.all(
        Array.from(bulkSelected).map((jobId) =>
          fetch(`/api/jobs/${jobId}/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employeeId: currentEmployee.id, employeeName: currentEmployee.name, percentage: 100 }),
          })
        )
      );
      setBulkMode(null);
      setBulkSelected(new Set());
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Employee: Bulk Done ─────────────────────────────
  const handleBulkDone = async () => {
    if (!currentEmployee || bulkSelected.size === 0) return;
    setSubmitting(true);
    try {
      await Promise.all(
        Array.from(bulkSelected).map((key) => {
          const [jobId, assignmentId] = key.split(":");
          return fetch(`/api/jobs/${jobId}/assignments/${assignmentId}/done`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        })
      );
      setBulkMode(null);
      setBulkSelected(new Set());
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Fetch Revenue (anhemphim.vn) ──────────────
  const fetchRevenue = async () => {
    setRevenueLoading(true);
    setRevenueError(null);
    setRevenueDebug(null);
    try {
      const res = await fetch("/api/revenue");
      const data = await res.json();
      if (!res.ok) {
        setRevenueError(data.error || "Lỗi API doanh thu");
        if (data.debug) setRevenueDebug(data.debug);
        return;
      }
      setRevenueData(data);
    } catch (err) {
      setRevenueError(err instanceof Error ? err.message : "Không lấy được dữ liệu doanh thu");
    } finally {
      setRevenueLoading(false);
    }
  };

  const fetchDailyAepRevenue = async () => {
    setDailyAepRevenueLoading(true);
    setDailyAepRevenueError(null);
    try {
      const res = await fetch("/api/revenue/daily");
      const data = await res.json();
      if (!res.ok) { setDailyAepRevenueError(data.error || "Lỗi API doanh thu ngày"); return; }
      setDailyAepRevenueData(data);
    } catch {
      setDailyAepRevenueError("Không lấy được dữ liệu doanh thu AEP theo ngày");
    } finally {
      setDailyAepRevenueLoading(false);
    }
  };

  const fetchIntradayAepRevenue = async () => {
    setIntradayAepLoading(true);
    setIntradayAepError(null);
    try {
      const res = await fetch("/api/revenue/intraday");
      const data = await res.json();
      if (!res.ok) { setIntradayAepError(data.error || "Lỗi API intraday"); return; }
      setIntradayAepData(data);
    } catch {
      setIntradayAepError("Không lấy được dữ liệu so sánh cùng giờ");
    } finally {
      setIntradayAepLoading(false);
    }
  };


  // ─── Director: Fetch Thu Chi data ──────────────────────
  const fetchThuChi = async () => {
    setThuChiLoading(true);
    setThuChiError(null);
    try {
      const res = await fetch("/api/finance");
      const data = await res.json();
      if (!res.ok) { setThuChiError(data.error || "Lỗi kết nối"); return; }
      setThuChiData(data);
    } catch {
      setThuChiError("Không kết nối được tới app thu chi");
    } finally {
      setThuChiLoading(false);
    }
  };

  // ─── Employee: Claim Mini Job (multi-clip) ─────────────
  const handleMiniClaim = async () => {
    if (!miniClaimJob || !currentEmployee) return;
    const units = Number(miniClaimUnits);
    const remaining = (miniClaimJob.totalUnits ?? 0) - miniClaimJob.assignments.reduce((s, a) => s + (a.units ?? 1), 0);
    if (!units || units < 1 || units > remaining) {
      alert(`Nhập số clip hợp lệ (1 – ${remaining})`); return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${miniClaimJob.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: currentEmployee.id, employeeName: currentEmployee.name, units }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Lỗi!"); return; }
      setMiniClaimJob(null); setMiniClaimUnits("1");
      await fetchAll();
    } finally { setSubmitting(false); }
  };

  // ─── Employee: Share Job ─────────────────────────────
  const handleShareJob = async () => {
    if (!sharingItem) return;
    // Mini: share by clip count
    if (sharingItem.isMini) {
      const units = Number(sharePercInput);
      if (!units || units <= 0 || units > (sharingItem.currentUnits ?? 1)) {
        alert(`Nhập số clip hợp lệ (1 – ${sharingItem.currentUnits})`); return;
      }
      setSubmitting(true);
      try {
        const res = await fetch(`/api/jobs/${sharingItem.jobId}/assignments/${sharingItem.assignmentId}/share`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ units }),
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || "Lỗi!"); return; }
        setSharingItem(null); setSharePercInput(""); await fetchAll();
      } finally { setSubmitting(false); }
      return;
    }
    const pct = Number(sharePercInput);
    if (!pct || pct <= 0 || pct > sharingItem.currentPct) {
      alert(`Nhập % hợp lệ (1 – ${sharingItem.currentPct})`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${sharingItem.jobId}/assignments/${sharingItem.assignmentId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percentage: pct }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || "Lỗi!"); return; }
      setSharingItem(null);
      setSharePercInput("");
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────
  // Derived
  const pendingApprovals = jobs.flatMap((job) =>
    job.assignments
      .filter((a) => a.status === "PENDING_APPROVAL")
      .map((a) => ({ job, assignment: a }))
  );

  const myAssignments = jobs.flatMap((job) =>
    job.assignments
      .filter((a) => a.employeeId === currentEmployee?.id)
      .map((a) => ({ job, assignment: a }))
  );

  // Danh sách tháng có dữ liệu (từ jobs), luôn bao gồm tháng hiện tại
  const availableMonths = useMemo(() => {
    const monthSet = new Set<string>([currentYM()]);
    jobs.forEach((job) => {
      const jm = job.month || job.createdAt.slice(0, 7);
      monthSet.add(jm);
      job.assignments.forEach((a) => {
        if (a.approvedAt) monthSet.add(getSalaryMonth(jm, a.approvedAt));
      });
    });
    return Array.from(monthSet).sort().reverse(); // mới nhất trước
  }, [jobs]);

  // ══════════════════════════════════════════════════════
  // LOGIN PAGE
  // ══════════════════════════════════════════════════════
  if (view === "LOGIN") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          {/* Logo */}
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl shadow-lg mb-4">
              <Briefcase className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Quản Lý Doanh Nghiệp</h1>
            <p className="text-gray-500 mt-1">Chọn cách đăng nhập</p>
          </div>

          {/* Director Login */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <BadgeCheck className="w-5 h-5 text-blue-500" />
              Đăng nhập Giám đốc
            </h2>
            <form onSubmit={handleDirectorLogin} className="space-y-3">
              <input
                type="password"
                value={directorPassInput}
                onChange={(e) => { setDirectorPassInput(e.target.value); setPassError(false); }}
                className={`w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-blue-500 ${passError ? "border-red-400" : "border-gray-300"}`}
                placeholder="Nhập mật khẩu..."
              />
              {passError && (
                <p className="text-red-500 text-sm flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" /> Mật khẩu không đúng!
                </p>
              )}
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors">
                Đăng nhập
              </button>
            </form>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-green-500" />
              Đăng nhập Nhân viên
            </h2>
            <EmployeeList
              onLogin={handleEmployeeLogin}
              onMounted={fetchAll}
            />
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // DIRECTOR PAGE
  // ══════════════════════════════════════════════════════
  if (view === "DIRECTOR") {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
          <div className="max-w-5xl mx-auto px-4 py-3 flex justify-between items-center">
            <div className="flex items-center gap-2 text-blue-600">
              <Briefcase className="w-5 h-5" />
              <h1 className="text-lg font-bold hidden sm:block">Quản Lý Doanh Nghiệp</h1>
              <span className="text-xs bg-blue-100 text-blue-700 font-medium px-2 py-0.5 rounded-full">Giám đốc</span>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => fetchAll()} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </button>
              <button onClick={handleLogout} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </button>
            </div>
          </div>
          {/* Tabs */}
          <div className="max-w-5xl mx-auto px-4 flex gap-1 pb-2 overflow-x-auto hide-scrollbar">
            {(["finance", "jobs", "employees", "approvals", "salary"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setDirectorTab(tab)}
                className={`shrink-0 flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium transition-colors relative ${directorTab === tab ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {tab === "jobs" && "Jobs"}
                {tab === "employees" && <span><span className="sm:hidden">NV</span><span className="hidden sm:inline">Nhân viên</span></span>}
                {tab === "salary" && <span><span className="sm:hidden">Lương</span><span className="hidden sm:inline">Bảng lương</span></span>}
                {tab === "finance" && <span><span className="sm:hidden">TC</span><span className="hidden sm:inline">Tài Chính</span></span>}
                {tab === "approvals" && (
                  <span className="flex items-center justify-center gap-1">
                    Duyệt
                    {pendingApprovals.length > 0 && (
                      <span className="w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {pendingApprovals.length}
                      </span>
                    )}
                  </span>
                )}
              </button>
            ))}
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-6 sm:space-y-8">
          {/* ── Jobs tab ── */}
          {directorTab === "jobs" && (
            <div className="space-y-6">
              <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <PlusCircle className="w-5 h-5 text-blue-500" /> Tạo Job Mới
                </h2>

                {createMode === "none" && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      onClick={() => setCreateMode("postprod")}
                      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-blue-200 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 transition-all">
                      <span className="text-3xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg></span>
                      <span className="font-bold text-blue-700 text-sm text-center leading-snug">Thêm job</span>
                      <span className="text-xs text-blue-500 text-center">Loại job, dự án, tập/ngày, hạn chót</span>
                    </button>
                    <button
                      onClick={() => setCreateMode("mini")}
                      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-all">
                      <span className="text-3xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/></svg></span>
                      <span className="font-bold text-purple-700 text-sm text-center leading-snug">Hậu kỳ Mini</span>
                      <span className="text-xs text-purple-500 text-center">Loạt clip ngắn, nhận từng clip</span>
                    </button>
                    <button
                      onClick={() => { resetShootingScheduleForm(); setCreateMode("shooting"); }}
                      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-400 transition-all">
                      <span className="text-3xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></span>
                      <span className="font-bold text-orange-700 text-sm text-center leading-snug">Lịch quay</span>
                      <span className="text-xs text-orange-500 text-center">Tự tạo job theo ngày quay</span>
                    </button>
                  </div>
                )}

                {/* ── Form: Thêm job ── */}
                {createMode === "postprod" && (
                  <form onSubmit={handleCreateJob} className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg></span>
                      <span className="font-bold text-blue-700">Thêm job</span>
                      <button type="button" onClick={() => setCreateMode("none")} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Loại job</label>
                        <select value={newJobCategory} onChange={(e) => { setNewJobCategory(e.target.value); setNewJobCategoryCustom(""); }}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                          {JOB_CATEGORY_OPTIONS.map((option) => (
                            <option key={option} value={option}>{option}</option>
                          ))}
                        </select>
                        {newJobCategory === "Khác" && (
                          <input
                            type="text"
                            autoFocus
                            required
                            value={newJobCategoryCustom}
                            onChange={(e) => setNewJobCategoryCustom(e.target.value)}
                            placeholder="Nhập cụ thể loại job..."
                            className="mt-2 w-full px-4 py-2 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                          />
                        )}
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Dự án</label>
                        <input type="text" list="project-name-options" required value={newJobProject} onChange={(e) => setNewJobProject(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="VD: Mẹ Biển, Sitcom tháng 5..." />
                        <datalist id="project-name-options">
                          {projectSuggestions.map((project) => (
                            <option key={project} value={project} />
                          ))}
                        </datalist>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Đơn vị tính</label>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { value: "episode", label: "Theo tập" },
                            { value: "day", label: "Theo ngày" },
                          ] as const).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setNewJobWorkUnit(option.value)}
                              className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${
                                newJobWorkUnit === option.value
                                  ? "border-blue-600 bg-blue-50 text-blue-700"
                                  : "border-gray-300 text-gray-600 hover:border-blue-300"
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      {newJobWorkUnit === "episode" && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Tên / số tập</label>
                          <input type="text" value={newJobEpisodeLabel} onChange={(e) => setNewJobEpisodeLabel(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="VD: 14 15 16 17 18" />
                          <p className="text-[11px] text-gray-400 mt-1">Nhập cách nhau bằng dấu cách hoặc dấu phẩy. Hệ thống sẽ tự đếm số tập.</p>
                        </div>
                      )}
                      {newJobWorkUnit === "day" && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Những ngày trong tháng</label>
                          <input type="text" value={newJobDayLabel} onChange={(e) => setNewJobDayLabel(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="VD: 14 15 16" />
                          <p className="text-[11px] text-gray-400 mt-1">Nhập các ngày quay cách nhau bằng dấu cách hoặc dấu phẩy. Hệ thống sẽ tự đếm số ngày.</p>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Số {getWorkUnitLabel(newJobWorkUnit)}</label>
                        <input type="number" inputMode="numeric" min="1" required value={newJobWorkUnit === "episode" ? (parsedNewJobEpisodes.count > 0 ? String(parsedNewJobEpisodes.count) : newJobWorkUnits) : (parsedNewJobDays.count > 0 ? String(parsedNewJobDays.count) : newJobWorkUnits)} onChange={(e) => setNewJobWorkUnits(e.target.value)}
                          readOnly={(newJobWorkUnit === "episode" && parsedNewJobEpisodes.count > 0) || (newJobWorkUnit === "day" && parsedNewJobDays.count > 0)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder={newJobWorkUnit === "day" ? "VD: 3" : "VD: 8"} />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tiền / {getWorkUnitRateLabel(newJobWorkUnit)} (VNĐ)</label>
                        <input type="number" inputMode="numeric" min="1000" required value={newJobRate} onChange={(e) => setNewJobRate(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder={newJobWorkUnit === "day" ? "VD: 3000000" : "VD: 1500000"} />
                      </div>
                      <div>
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <label className="block text-sm font-medium text-gray-700">Ngày hết hạn</label>
                          <label className="inline-flex items-center gap-2 text-xs text-gray-500">
                            <input
                              type="checkbox"
                              checked={newJobHasExpiry}
                              onChange={(e) => {
                                setNewJobHasExpiry(e.target.checked);
                                if (!e.target.checked) setNewJobExpiresAt("");
                              }}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Có hạn chót
                          </label>
                        </div>
                        <input type="date" value={newJobExpiresAt} onChange={(e) => setNewJobExpiresAt(e.target.value)}
                          disabled={!newJobHasExpiry}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed" />
                        <p className="text-[11px] text-gray-400 mt-1">Mặc định là không hết hạn. Chỉ bật khi job cần tự đóng.</p>
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 space-y-1.5">
                      <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Xem trước</p>
                      <p className="font-semibold text-gray-900">{standardJobTitlePreview || "Chưa nhập đủ thông tin"}</p>
                      {newJobWorkUnit === "episode" && parsedNewJobEpisodes.count > 1 && (
                        <p className="text-sm font-semibold text-blue-700">Sẽ tạo {parsedNewJobEpisodes.count} job riêng, mỗi tập 1 job.</p>
                      )}
                      <p className="text-sm text-blue-700">
                        {(newJobWorkUnit === "episode"
                          ? (parsedNewJobEpisodes.count > 0 ? parsedNewJobEpisodes.count : Number(newJobWorkUnits))
                          : (parsedNewJobDays.count > 0 ? parsedNewJobDays.count : Number(newJobWorkUnits))) > 0 && Number(newJobRate) > 0
                          ? `${newJobWorkUnit === "episode"
                            ? (parsedNewJobEpisodes.count > 0 ? parsedNewJobEpisodes.count : Number(newJobWorkUnits))
                            : (parsedNewJobDays.count > 0 ? parsedNewJobDays.count : Number(newJobWorkUnits))} ${getWorkUnitLabel(newJobWorkUnit, newJobWorkUnit === "episode"
                            ? (parsedNewJobEpisodes.count > 0 ? parsedNewJobEpisodes.count : Number(newJobWorkUnits))
                            : (parsedNewJobDays.count > 0 ? parsedNewJobDays.count : Number(newJobWorkUnits)))} × ${formatCurrency(Number(newJobRate))}/${getWorkUnitRateLabel(newJobWorkUnit)}`
                          : `Nhập số ${getWorkUnitLabel(newJobWorkUnit)} và đơn giá để tính tổng`}
                      </p>
                      {newJobWorkUnit === "episode" && parsedNewJobEpisodes.normalized && (
                        <p className="text-xs text-blue-600">Danh sách tập: {parsedNewJobEpisodes.normalized}</p>
                      )}
                      {newJobWorkUnit === "day" && parsedNewJobDays.normalized && (
                        <p className="text-xs text-blue-600">Danh sách ngày: {parsedNewJobDays.normalized}</p>
                      )}
                      {newJobWorkUnit === "episode" && parsedNewJobEpisodes.count > 1 && (
                        <div className="text-xs text-blue-700 space-y-1">
                          {parsedNewJobEpisodes.items.slice(0, 6).map((episode) => (
                            <p key={episode}>• {buildStandardJobTitle(newJobCategory, newJobProject, episode)} — {formatCurrency(Number(newJobRate) || 0)}</p>
                          ))}
                          {parsedNewJobEpisodes.items.length > 6 && <p>… và {parsedNewJobEpisodes.items.length - 6} job nữa</p>}
                        </div>
                      )}
                      <p className="text-base font-black text-blue-800">{formatCurrency(standardJobTotalPreview)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú / mô tả (tuỳ chọn)</label>
                      <textarea value={newJobDesc} onChange={(e) => setNewJobDesc(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-16 resize-none"
                        placeholder="Ghi chú thêm..." />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setCreateMode("none")} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Huỷ</button>
                      <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                        {submitting ? "Đang tạo..." : "Tạo job"}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── Form: Hậu kỳ Mini ── */}
                {createMode === "mini" && (
                  <form onSubmit={handleCreateMiniJob} className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/></svg></span>
                      <span className="font-bold text-purple-700">Hậu kỳ Mini (theo clip)</span>
                      <button type="button" onClick={() => setCreateMode("none")} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tên loạt clip</label>
                      <input type="text" required value={miniTitle} onChange={(e) => setMiniTitle(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none"
                        placeholder="VD: Clip sức khoẻ ngắn — Tháng 3" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Giá / clip (VNĐ)</label>
                        <input type="number" inputMode="numeric" required min="1000" value={newJobUnitPrice} onChange={(e) => setNewJobUnitPrice(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                          placeholder="VD: 100000" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Số clip</label>
                        <input type="number" inputMode="numeric" required min="1" value={newJobTotalUnits} onChange={(e) => setNewJobTotalUnits(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                          placeholder="VD: 20" />
                      </div>
                    </div>
                    {newJobUnitPrice && newJobTotalUnits && (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 flex justify-between items-center text-sm">
                        <span className="text-purple-600">Tổng ngân sách:</span>
                        <span className="font-black text-purple-700 text-base">{new Intl.NumberFormat("vi-VN").format(Number(newJobUnitPrice) * Number(newJobTotalUnits))}đ</span>
                      </div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả (tuỳ chọn)</label>
                      <textarea value={miniDesc} onChange={(e) => setMiniDesc(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none h-14 resize-none"
                        placeholder="Nội dung, phong cách clip..." />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setCreateMode("none")} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Huỷ</button>
                      <button type="submit" disabled={submitting} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                        {submitting ? "Đang tạo..." : "Tạo Mini Job"}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── Form: Lịch quay ── */}
                {createMode === "shooting" && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarDays className="w-5 h-5 text-orange-500" />
                      <span className="font-bold text-orange-700">Lịch quay</span>
                      <button type="button" onClick={() => { resetShootingScheduleForm(); setCreateMode("none"); }} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>

                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold text-orange-700">Thông tin lịch quay</p>
                          <p className="text-xs text-gray-500 mt-0.5">Chọn loại dự án, nhập tên và bấm trực tiếp lên lịch để đánh dấu ngày quay.</p>
                        </div>
                        {shootDateCount > 0 && (
                          <span className="text-xs font-bold text-orange-700 bg-white border border-orange-200 rounded-full px-2.5 py-1 shrink-0">
                            {shootDateCount} ngày
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {SHOOTING_PROJECT_TYPE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setShootProjectType(option.value);
                              setShootScheduleItems(createShootingScheduleItems(option.value));
                            }}
                            className={`text-left rounded-xl border px-3 py-2 transition-colors ${shootProjectType === option.value ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-200 text-gray-700 hover:border-orange-400"}`}
                          >
                            <span className="block text-sm font-bold">{option.label}</span>
                            <span className={`block text-xs ${shootProjectType === option.value ? "text-orange-50" : "text-gray-500"}`}>{option.note}</span>
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
                        <div className="lg:col-span-2 space-y-3">
                          <div className="bg-white border border-orange-100 rounded-xl p-3 space-y-3">
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">Dự án</label>
                              <input type="text" list="project-name-options" value={shootFilmName} onChange={(e) => setShootFilmName(e.target.value)}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-sm bg-white"
                                placeholder={shootProjectType === "aep" ? "VD: Sát Giới" : "VD: TVC mùa hè"} />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-600 mb-1">{shootProjectType === "ads" ? "Số clip" : "Số tập"}</label>
                              <input type="text" value={shootEpisodeLabel} onChange={(e) => setShootEpisodeLabel(e.target.value)}
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-sm bg-white"
                                placeholder="VD: 5 hoặc 1 2 3" />
                              <p className="text-[11px] text-gray-400 mt-1.5">Nhập 5 để tạo {shootEpisodeUnitLabel} 1-5; nhập “{shootProjectType === "ads" ? "Clip" : "Tập"} 5” nếu chỉ tạo đúng số 5.</p>
                            </div>
                          </div>

                          <div className="bg-white border border-orange-100 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <p className="text-xs font-bold text-gray-700">Ngày đã chọn</p>
                              {shootDateCount > 0 && (
                                <button type="button" onClick={() => setShootDateInput("")} className="text-[11px] font-semibold text-gray-400 hover:text-red-500">
                                  Xoá hết
                                </button>
                              )}
                            </div>
                            {parsedShootDates.count > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {parsedShootDates.items.map((date) => (
                                  <button
                                    key={`${date.ym}-${date.day}`}
                                    type="button"
                                    onClick={() => handleToggleShootDate(formatIsoDateParts(date))}
                                    className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-2.5 py-1.5 text-[11px] font-bold text-orange-700 hover:border-red-300 hover:text-red-500 transition-colors"
                                  >
                                    {date.fullLabel}<X className="w-3 h-3" />
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-lg px-3 py-3 text-center">Chưa chọn ngày quay.</p>
                            )}
                          </div>
                        </div>

                        <div className="lg:col-span-3">
                          <div className="rounded-xl border border-orange-200 bg-white overflow-hidden shadow-sm">
                            <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-orange-100 bg-orange-50/70">
                              <button
                                type="button"
                                onClick={() => setShootCalendarMonth((prev) => addMonthsToYM(prev, -1))}
                                className="p-2 rounded-lg text-orange-600 hover:bg-white border border-transparent hover:border-orange-200 transition-colors"
                                title="Tháng trước"
                              >
                                <ChevronLeft className="w-4 h-4" />
                              </button>
                              <div className="text-sm font-bold text-gray-900">{monthLabel(shootCalendarMonth)}</div>
                              <button
                                type="button"
                                onClick={() => setShootCalendarMonth((prev) => addMonthsToYM(prev, 1))}
                                className="p-2 rounded-lg text-orange-600 hover:bg-white border border-transparent hover:border-orange-200 transition-colors"
                                title="Tháng sau"
                              >
                                <ChevronRight className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-7 gap-1.5 px-3 pt-3 text-center text-[10px] font-bold text-gray-400">
                              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((weekday) => <span key={weekday}>{weekday}</span>)}
                            </div>
                            <div className="grid grid-cols-7 gap-1.5 p-3">
                              {shootCalendarCells.map((date) => {
                                const isSelected = selectedShootDateKeys.has(date.isoDate);
                                return (
                                  <button
                                    key={date.isoDate}
                                    type="button"
                                    onClick={() => handleToggleShootDate(date.isoDate)}
                                    className={`h-10 sm:h-11 rounded-lg text-sm font-semibold border transition-all flex items-center justify-center ${isSelected ? "bg-orange-500 border-orange-500 text-white shadow-sm" : date.inCurrentMonth ? "bg-white border-orange-100 text-gray-800 hover:border-orange-400 hover:bg-orange-50" : "bg-gray-50 border-gray-100 text-gray-300 hover:text-gray-500"} ${date.isToday && !isSelected ? "ring-1 ring-orange-300" : ""}`}
                                  >
                                    {date.day}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Timer className="w-4 h-4 text-orange-500" /> Hạng mục tự tạo</p>
                        <button type="button" onClick={() => setShootScheduleItems(createShootingScheduleItems(shootProjectType))} className="text-xs font-semibold text-orange-600 hover:text-orange-700">
                          Nạp preset
                        </button>
                      </div>
                      <datalist id="shoot-category-options">
                        {JOB_CATEGORY_OPTIONS.map((option) => <option key={option} value={option} />)}
                      </datalist>
                      <div className="space-y-3">
                        {shootScheduleItems.map((item) => (
                          <div key={item.id} className={`rounded-xl border p-3 transition-colors ${item.enabled ? "border-orange-200 bg-orange-50/40" : "border-gray-200 bg-gray-50"}`}>
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                              <label className="md:col-span-1 flex md:justify-center items-center gap-2 text-xs font-medium text-gray-500 pb-2 md:pb-2.5">
                                <input
                                  type="checkbox"
                                  checked={item.enabled}
                                  onChange={(e) => setShootScheduleItems((prev) => prev.map((row) => row.id === item.id ? { ...row, enabled: e.target.checked } : row))}
                                  className="rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                                />
                                <span className="md:hidden">Tạo</span>
                              </label>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Tên job</label>
                                <input type="text" value={item.name} onChange={(e) => setShootScheduleItems((prev) => prev.map((row) => row.id === item.id ? { ...row, name: e.target.value } : row))}
                                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-orange-400 outline-none bg-white" />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Loại job</label>
                                <input type="text" list="shoot-category-options" value={item.jobCategory} onChange={(e) => setShootScheduleItems((prev) => prev.map((row) => row.id === item.id ? { ...row, jobCategory: e.target.value } : row))}
                                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-orange-400 outline-none bg-white" />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Đơn vị</label>
                                <select value={item.workUnit} onChange={(e) => setShootScheduleItems((prev) => prev.map((row) => row.id === item.id ? { ...row, workUnit: e.target.value as StandardWorkUnit } : row))}
                                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-orange-400 outline-none bg-white">
                                  <option value="episode">Theo tập</option>
                                  <option value="day">Theo ngày</option>
                                </select>
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Số lượng</label>
                                <input type="number" inputMode="numeric" min="1" max={item.workUnit === "episode" ? Math.max(shootEpisodeCount, 1) : undefined} value={item.quantity ?? ""}
                                  onChange={(e) => setShootScheduleItems((prev) => prev.map((row) => row.id === item.id ? { ...row, quantity: e.target.value === "" ? undefined : Number(e.target.value) } : row))}
                                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-orange-400 outline-none bg-white"
                                  placeholder={item.workUnit === "episode" ? String(shootEpisodeCount || 1) : "1"} />
                              </div>
                              <div className="md:col-span-2">
                                <label className="block text-xs font-medium text-gray-600 mb-1">Đơn giá</label>
                                <input type="number" inputMode="numeric" min="0" value={Number.isFinite(item.ratePerUnit) ? item.ratePerUnit : 0}
                                  onChange={(e) => setShootScheduleItems((prev) => prev.map((row) => row.id === item.id ? { ...row, ratePerUnit: Number(e.target.value) } : row))}
                                  className="w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-orange-400 outline-none bg-white" />
                              </div>
                              <div className="md:col-span-1 flex md:justify-end">
                                <button type="button" onClick={() => setShootScheduleItems((prev) => prev.filter((row) => row.id !== item.id))}
                                  className="p-2 text-gray-300 hover:text-red-500 hover:bg-white rounded-lg transition-colors" title="Xoá hạng mục">
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            {item.enabled && item.workUnit === "episode" && shootEpisodeCount > 0 && (
                              <p className="text-xs text-orange-700 mt-2 pl-0 md:pl-[8.333%]">
                                {getShootingScheduleItemQuantity(item, shootEpisodeCount)} {shootEpisodeUnitLabel} x {formatCurrency(Number(item.ratePerUnit) || 0)} = {formatCurrency((Number(item.ratePerUnit) || 0) * getShootingScheduleItemQuantity(item, shootEpisodeCount))}
                              </p>
                            )}
                            {item.enabled && item.workUnit === "day" && shootDateCount > 0 && (
                              <p className="text-xs text-orange-700 mt-2 pl-0 md:pl-[8.333%]">
                                {getShootingDayStaffQuantity(item)} người x {shootDateCount} ngày x {formatCurrency(Number(item.ratePerUnit) || 0)} = {formatCurrency((Number(item.ratePerUnit) || 0) * getShootingDayStaffQuantity(item) * shootDateCount)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setShootScheduleItems((prev) => [...prev, { id: `custom-${Date.now()}-${prev.length}`, enabled: true, name: "Hạng mục mới", jobCategory: "Khác", workUnit: "episode", ratePerUnit: 0 }])}
                        className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1 font-medium mt-1">
                        <PlusCircle className="w-3.5 h-3.5" /> Thêm hạng mục
                      </button>
                      <div className="text-xs text-gray-500 bg-orange-50 rounded-lg px-3 py-2 flex justify-between mt-2">
                        <span>{validShootScheduleItems.length} hạng mục đang bật</span>
                        <span className="font-semibold text-orange-700">{shootScheduleJobCount} job</span>
                      </div>
                    </div>

                    <div className="bg-orange-500 text-white rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold flex items-center gap-1.5"><CalendarDays className="w-4 h-4" /> {shootFilmName.trim() || "Chưa nhập dự án"}</p>
                          <p className="text-xs text-orange-50 mt-1">
                            {shootDateCount > 0 ? `Ngày quay ${parsedShootDates.items.map((date) => date.fullLabel).join(", ")}` : "Chưa chọn ngày quay"}
                            {hasShootEpisodeItems && shootEpisodeCount > 0 ? ` - ${shootEpisodeCount} ${shootEpisodeUnitLabel}` : ""}
                          </p>
                        </div>
                        <span className="text-xs font-bold bg-white/20 px-2 py-1 rounded-full shrink-0">{shootScheduleJobCount} job</span>
                      </div>
                      <div className="mt-3 space-y-1.5 text-xs text-orange-50">
                        {validShootScheduleItems.length === 0 ? (
                          <p>Chưa có hạng mục hợp lệ.</p>
                        ) : validShootScheduleItems.map((item) => (
                          <p key={item.id} className="flex justify-between gap-3">
                            <span>{item.name} ({item.workUnit === "episode" ? `${getShootingScheduleItemQuantity(item, shootEpisodeCount)} ${shootEpisodeUnitLabel}` : `${getShootingDayStaffQuantity(item)} người x ${shootDateCount} ngày`})</span>
                            <span className="font-semibold text-white">{formatCurrency(item.ratePerUnit * (item.workUnit === "episode" ? getShootingScheduleItemQuantity(item, shootEpisodeCount) : getShootingDayStaffQuantity(item) * shootDateCount))}</span>
                          </p>
                        ))}
                      </div>
                      <p className="font-black text-lg mt-3">Tổng: {formatCurrency(shootScheduleTotalPreview)}</p>
                    </div>

                    <div className="flex gap-2">
                      <button type="button" onClick={() => { resetShootingScheduleForm(); setCreateMode("none"); }} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Huỷ</button>
                      <button
                        type="button"
                        disabled={submitting || !shootFilmName.trim() || shootDateCount === 0 || validShootScheduleItems.length === 0 || (hasShootEpisodeItems && shootEpisodeCount === 0)}
                        onClick={handleCreateShootingDay}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                        {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang tạo...</> : <><CheckCircle2 className="w-4 h-4" /> Tạo lịch quay</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-orange-500" /> Lịch quay đã đánh dấu
                  </h2>
                  <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1">
                    {shootingCalendarDays.length} ngày
                  </span>
                </div>
                {shootingCalendarDays.length === 0 ? (
                  <p className="text-sm text-gray-400">Chưa có ngày quay nào được tạo từ Lịch quay.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {shootingCalendarDays.slice(0, 12).map((day) => {
                      const theme = getShootingCalendarTheme(day);
                      return (
                      <div key={day.dateKey} className={`rounded-xl border p-3 ${theme.card}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center shrink-0 ${theme.dateBox}`}>
                              <span className="text-lg font-black leading-none">{String(day.day).padStart(2, "0")}</span>
                              <span className="text-[10px] font-semibold">{day.ym.slice(5)}</span>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 truncate">{day.fullLabel}</p>
                              <p className={`text-xs truncate ${theme.titleText}`}>{day.projectList.join(", ") || "Chưa có dự án"}</p>
                            </div>
                          </div>
                          <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0 ${theme.badge}`}>{day.jobCount} job</span>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                          <span className="truncate">{day.groupList[0] ?? "Lịch quay"}</span>
                          <button
                            type="button"
                            onClick={() => {
                              setStaffingDayModal(day);
                              setStaffingSelections(Object.fromEntries(day.jobs.map((job) => [job.id, job.assignments[0]?.employeeId ?? ""])));
                            }}
                            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shrink-0 ${theme.button}`}
                          >
                            <UserPlus className="w-3.5 h-3.5" /> Nhân sự
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                )}
              </div>

              <div>
                {/* ── Toolbar: search + sort ── */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <h2 className="text-lg font-semibold shrink-0">Danh sách Job</h2>
                  <div className="relative flex-1 min-w-[140px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={jobSearch} onChange={(e) => setJobSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Tìm job..." />
                    {jobSearch && <button onClick={() => setJobSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
                  </div>
                  <button
                    onClick={() => setJobSort(s => s === "newest" ? "oldest" : "newest")}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 shrink-0">
                    <ArrowUpDown className="w-3.5 h-3.5" />
                    {jobSort === "newest" ? "Mới nhất" : "Cũ nhất"}
                  </button>
                  <select
                    value={jobProjectFilter}
                    onChange={(e) => setJobProjectFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 shrink-0"
                  >
                    <option value="all">Tất cả dự án</option>
                    {projectSuggestions.map((project) => (
                      <option key={project} value={project}>{project}</option>
                    ))}
                  </select>
                  <select
                    value={jobCategoryFilter}
                    onChange={(e) => setJobCategoryFilter(e.target.value)}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 bg-white hover:bg-gray-50 shrink-0"
                  >
                    <option value="all">Tất cả loại job</option>
                    {jobCategoryOptions.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  {(jobProjectFilter !== "all" || jobCategoryFilter !== "all") && (
                    <button
                      onClick={() => { setJobProjectFilter("all"); setJobCategoryFilter("all"); }}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-50 shrink-0"
                    >
                      Xoá lọc
                    </button>
                  )}
                  <button
                    onClick={handleAiReclassifyLegacyJobs}
                    disabled={jobAiReclassifying || uncategorizedStandardJobs.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-blue-200 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    {jobAiReclassifying ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    AI phân loại job cũ
                    <span className="px-1.5 py-0.5 rounded-full bg-white/80 text-[10px] border border-blue-200">{uncategorizedStandardJobs.length}</span>
                  </button>
                </div>

                {jobAiReclassifyNotice && (
                  <div className={`mb-3 px-3 py-2 rounded-xl border text-sm ${
                    jobAiReclassifyNotice.tone === "success"
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : jobAiReclassifyNotice.tone === "error"
                        ? "bg-red-50 border-red-200 text-red-700"
                        : "bg-blue-50 border-blue-200 text-blue-700"
                  }`}>
                    {jobAiReclassifyNotice.text}
                  </div>
                )}

                {/* ── Bulk-delete bar ── */}
                {selectedJobIds.size > 0 && (
                  <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-red-50 border border-red-200 rounded-xl">
                    <span className="text-sm font-medium text-red-700">Đã chọn {selectedJobIds.size} job</span>
                    <button
                      onClick={handleBulkDeleteJobs}
                      disabled={submitting}
                      className="flex items-center gap-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors">
                      <Trash2 className="w-3.5 h-3.5" /> Xoá tất cả đã chọn
                    </button>
                    <button onClick={() => setSelectedJobIds(new Set())} className="ml-auto text-gray-400 hover:text-gray-600">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {loading ? <LoadingBlock /> : jobs.length === 0 ? <EmptyBlock text="Chưa có job nào." /> : (() => {
                  const normalizedSearch = jobSearch.trim().toLowerCase();
                  const filtered = jobs
                    .filter((j) => {
                      const haystack = [j.title, j.description, j.projectName, j.jobCategory, j.groupName, j.episodeLabel, j.dayLabel]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                      if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
                      if (jobProjectFilter !== "all" && (j.projectName || "") !== jobProjectFilter) return false;
                      if (jobCategoryFilter !== "all" && getJobCategoryLabel(j) !== jobCategoryFilter) return false;
                      return true;
                    })
                    .sort((a, b) => {
                      const ta = new Date(a.createdAt).getTime();
                      const tb = new Date(b.createdAt).getTime();
                      return jobSort === "newest" ? tb - ta : ta - tb;
                    });
                  const allFilteredIds = filtered.map(j => j.id);
                  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedJobIds.has(id));
                  if (filtered.length === 0) return <EmptyBlock text={normalizedSearch ? `Không tìm thấy job nào cho "${jobSearch}".` : "Không có job nào khớp bộ lọc hiện tại."} />;
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
                      {/* ── Select-all row ── */}
                      <div className="flex items-center gap-2 px-1 md:col-span-2 xl:col-span-3">
                        <input type="checkbox" id="selectAllJobs" checked={allSelected}
                          onChange={() => {
                            if (allSelected) {
                              setSelectedJobIds(prev => { const n = new Set(prev); allFilteredIds.forEach(id => n.delete(id)); return n; });
                            } else {
                              setSelectedJobIds(prev => new Set([...prev, ...allFilteredIds]));
                            }
                          }}
                          className="w-4 h-4 rounded accent-red-500 cursor-pointer" />
                        <label htmlFor="selectAllJobs" className="text-xs text-gray-500 cursor-pointer select-none">
                          {allSelected ? "Bỏ chọn tất cả" : `Chọn tất cả (${filtered.length})`}
                        </label>
                      </div>
                      {filtered.map((job) => {
                        const isMini = job.jobType === "mini";
                        const categoryLabel = getJobCategoryLabel(job);
                        const categoryBadgeClass = getJobCategoryBadgeClass(categoryLabel);
                        const categorySurfaceClass = getJobCategorySurfaceClass(categoryLabel);
                        const standardMeta = !isMini
                          ? [
                              job.projectName,
                              job.episodeLabel ? `Tập ${job.episodeLabel.replace(/^tập\s*/i, "")}` : null,
                              job.dayLabel ? `Ngày ${job.dayLabel.replace(/^ngày\s*/i, "")}` : null,
                              job.workUnits ? `${job.workUnits} ${getWorkUnitLabel(job.workUnit as StandardWorkUnit | undefined, job.workUnits)}` : null,
                              job.ratePerUnit ? `${formatCurrency(job.ratePerUnit)}/${getWorkUnitRateLabel(job.workUnit as StandardWorkUnit | undefined)}` : null,
                            ].filter(Boolean).join(" · ")
                          : [job.projectName, job.totalUnits ? `${job.totalUnits} clip` : null].filter(Boolean).join(" · ");
                        const pct = isMini
                          ? (job.assignments.reduce((s, a) => s + (a.units ?? 1), 0) / (job.totalUnits ?? 1)) * 100
                          : job.assignments.reduce((a, b) => a + b.percentage, 0);
                        const isSelected = selectedJobIds.has(job.id);
                        const remainingLabel = isMini
                          ? `Còn ${(job.totalUnits ?? 0) - job.assignments.reduce((sum, assignment) => sum + (assignment.units ?? 1), 0)} clip`
                          : `Còn ${Math.max(0, 100 - job.assignments.reduce((sum, assignment) => sum + assignment.percentage, 0))}%`;
                        const { cardBg, accentText, barBg, barFill } = categorySurfaceClass;
                        return (
                          <div key={job.id} className={`relative overflow-hidden rounded-2xl p-3.5 shadow-sm transition-all ${cardBg} ${isSelected ? "ring-2 ring-red-300 ring-offset-2" : ""}`}>
                            <div className={`absolute -top-4 -right-4 w-16 h-16 rounded-full opacity-20 ${barFill}`} />
                            <div className="flex justify-between items-start mb-2 gap-2 relative z-10">
                              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                <input type="checkbox" checked={isSelected}
                                  onChange={() => setSelectedJobIds(prev => {
                                    const n = new Set(prev);
                                    isSelected ? n.delete(job.id) : n.add(job.id);
                                    return n;
                                  })}
                                  className="mt-1 w-4 h-4 rounded accent-red-500 cursor-pointer shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <span className={`text-sm leading-none ${accentText}`}>
                                      {isMini
                                        ? <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/></svg>
                                        : job.expiresAt
                                          ? <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                                          : <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg>}
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 bg-white/70 text-orange-600 border border-white/60">
                                      {remainingLabel}
                                    </span>
                                  </div>
                                  <h3 className="font-bold text-gray-900 text-[15px] leading-snug line-clamp-2">{job.title}</h3>
                                  <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${categoryBadgeClass}`}>
                                      {categoryLabel}
                                    </span>
                                    {job.groupName && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full shrink-0 border border-purple-200">{job.groupName}</span>}
                                    {job.expiresAt && <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 border border-orange-200"><Timer className="w-2.5 h-2.5" />HH {new Date(job.expiresAt).toLocaleDateString("vi-VN")}</span>}
                                  </div>
                                  {standardMeta && <p className="text-[11px] text-gray-500 mt-1.5 line-clamp-2">{standardMeta}</p>}
                                  {job.description && <p className="text-[11px] text-gray-400 mt-1 line-clamp-1">{job.description}</p>}
                                  <p className="text-[10px] text-gray-400 mt-1">{monthLabel(job.month || job.createdAt.slice(0, 7))}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 relative z-10">
                                <button onClick={() => openJobEditModal(job)} disabled={submitting}
                                  className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-white/70 rounded-xl transition-colors border border-white/60" title="Sửa job">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => handleDeleteJob(job.id)} disabled={submitting}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white/70 rounded-xl transition-colors border border-white/60" title="Xoá job">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="relative z-10 flex items-center justify-between gap-2 mt-2 mb-2">
                              <p className={`font-extrabold text-lg leading-none ${accentText}`}>
                                {isMini
                                  ? `${new Intl.NumberFormat("vi-VN").format(job.unitPrice ?? 0)}đ/clip`
                                  : formatCurrency(job.totalSalary)}
                              </p>
                              <p className="text-[10px] text-gray-500 shrink-0">
                                {job.assignments.length} người nhận
                              </p>
                            </div>
                            <div className={`w-full rounded-full h-1.5 mt-2 mb-2.5 relative z-10 ${barBg}`}>
                              <div className={`h-1.5 rounded-full transition-all ${barFill}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            {job.assignments.length > 0 && (
                              <div className="space-y-1.5 relative z-10 max-h-28 overflow-y-auto pr-1">
                                {job.assignments.map((a) => (
                                  <div key={a.id} className="flex flex-wrap justify-between items-center gap-1 text-sm bg-white/70 border border-white/80 px-2.5 py-2 rounded-xl backdrop-blur-[1px]">
                                    <span className="font-medium text-gray-800">{a.employeeName}</span>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {isMini
                                        ? <span className="text-purple-600 font-medium">{a.units ?? 1} clip</span>
                                        : <span className={`font-medium ${accentText}`}>{a.percentage}%</span>}
                                      <span className={`font-semibold ${accentText}`}>{formatCurrency(a.salaryEarned)}</span>
                                      <StatusBadge status={a.status} />
                                      {a.note && <span className="text-gray-400 text-xs italic" title={a.note}><MessageSquare className="w-3 h-3 inline" /></span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ── Employees tab ── */}
          {directorTab === "employees" && (
            <div className="space-y-6">
              <div className="bg-white p-5 sm:p-6 rounded-xl shadow-sm border border-gray-100">
                <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-green-500" /> Thêm Nhân viên
                </h2>
                <form onSubmit={handleCreateEmployee} className="flex gap-3">
                  <input type="text" required value={newEmployeeName} onChange={(e) => setNewEmployeeName(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Tên nhân viên..." />
                  <button type="submit" disabled={submitting}
                    className="bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-5 py-2 rounded-lg font-medium transition-colors">
                    {submitting ? "..." : "Thêm"}
                  </button>
                </form>
              </div>
              <div>
                <h2 className="text-lg font-semibold mb-4">Danh sách Nhân viên</h2>
                {loading ? <LoadingBlock /> : employees.length === 0 ? <EmptyBlock text="Chưa có nhân viên nào." /> : (
                  <div className="grid gap-3 md:grid-cols-2">
                    {employees.map((emp) => (
                      <div key={emp.id} className="bg-white p-4 rounded-xl border border-gray-100">
                        {editingEmployee?.id === emp.id ? (
                          <div className="flex gap-2">
                            <input autoFocus type="text" value={editingEmployee.name}
                              onChange={(e) => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                              onKeyDown={(e) => { if (e.key === "Enter") handleRenameEmployee(); if (e.key === "Escape") setEditingEmployee(null); }}
                              className="flex-1 px-3 py-1.5 border border-blue-400 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm" />
                            <button onClick={handleRenameEmployee} disabled={submitting}
                              className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60">Lưu</button>
                            <button onClick={() => setEditingEmployee(null)}
                              className="px-3 py-1.5 text-gray-500 hover:bg-gray-100 rounded-lg text-sm">Huỷ</button>
                          </div>
                        ) : (
                          <div className="flex justify-between items-start">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 ${emp.isActive === false ? 'bg-gray-100 text-gray-400' : 'bg-blue-100 text-blue-600'} rounded-full flex items-center justify-center font-bold text-sm shrink-0`}>
                                {emp.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className={`font-medium ${emp.isActive === false ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{emp.name}</p>
                                <p className="text-xs text-green-600 flex items-center gap-0.5">
                                  <Wallet className="w-3 h-3" />{formatCurrency(emp.balance)}
                                </p>
                                {emp.profile?.stk && (
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18M3 10h18M5 6l7-4 7 4M4 10v11M20 10v11M8 10v11M12 10v11M16 10v11"/></svg> {emp.profile.stk} · {emp.profile.nganHang ?? ""}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => {
                                  setProfileModal(emp);
                                  setProfileForm({
                                    cccd: emp.profile?.cccd ?? "",
                                    ngayCapCccd: emp.profile?.ngayCapCccd ?? "",
                                    noiCapCccd: emp.profile?.noiCapCccd ?? "",
                                    diaChi: emp.profile?.diaChi ?? "",
                                    mst: emp.profile?.mst ?? "",
                                    dienThoai: emp.profile?.dienThoai ?? "",
                                    stk: emp.profile?.stk ?? "",
                                    nganHang: emp.profile?.nganHang ?? "",
                                  });
                                }}
                                className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Thông tin cá nhân">
                                <Users className="w-4 h-4" />
                              </button>
                              <button onClick={() => setEditingEmployee({ id: emp.id, name: emp.name })}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Đổi tên">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteEmployee(emp.id)} disabled={submitting}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Xoá vĩnh viễn">
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleToggleEmployeeActive(emp)} disabled={submitting}
                                className={`p-1.5 ${emp.isActive === false ? 'text-green-500 hover:bg-green-50' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'} rounded-lg transition-colors`} title={emp.isActive === false ? "Cho làm lại" : "Thôi việc"}>
                                <LogOut className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Approvals tab ── */}
          {directorTab === "approvals" && (
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <h2 className="text-lg font-semibold">Chờ Duyệt</h2>
                {pendingApprovals.length > 0 && (
                  <button
                    onClick={handleApproveAllPending}
                    disabled={submitting}
                    className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Duyệt tất cả ({pendingApprovals.length})
                  </button>
                )}
              </div>
              {loading ? <LoadingBlock /> : pendingApprovals.length === 0 ? (
                <EmptyBlock text="Không có phần việc nào chờ duyệt." />
              ) : (
                <div className="grid gap-4">
                  {/* Group mini job assignments by job */}
                  {(() => {
                    const miniGroups: Record<string, { job: Job; assignments: JobAssignment[] }> = {};
                    const standardItems: { job: Job; assignment: JobAssignment }[] = [];
                    pendingApprovals.forEach(({ job, assignment }) => {
                      if (job.jobType === "mini") {
                        if (!miniGroups[job.id]) miniGroups[job.id] = { job, assignments: [] };
                        miniGroups[job.id].assignments.push(assignment);
                      } else {
                        standardItems.push({ job, assignment });
                      }
                    });
                    return (
                      <>
                        {/* Mini job groups */}
                        {Object.values(miniGroups).map(({ job, assignments }) => (
                          <div key={job.id} className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-violet-200 bg-violet-50/30">
                            <div className="flex items-start justify-between gap-3 mb-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 mb-1">Job mini · {monthLabel(job.month || job.createdAt.slice(0, 7))}</p>
                                <h3 className="font-semibold">{job.title}</h3>
                                <p className="text-xs text-violet-600 font-medium mt-0.5">{new Intl.NumberFormat("vi-VN").format(job.unitPrice ?? 0)}đ/clip</p>
                              </div>
                              <button
                                onClick={async () => {
                                  setSubmitting(true);
                                  try {
                                    for (const a of assignments) {
                                      await fetch(`/api/jobs/${job.id}/assignments/${a.id}/approve`, {
                                        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
                                      });
                                    }
                                    await fetchAll();
                                  } finally { setSubmitting(false); }
                                }}
                                disabled={submitting}
                                className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0">
                                <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt tất cả ({assignments.reduce((s, a) => s + (a.units ?? 1), 0)} clip)
                              </button>
                            </div>
                            <div className="space-y-2">
                              {assignments.map((a) => (
                                <div key={a.id} className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-2">
                                  <div>
                                    <span className="text-sm font-medium text-gray-800">{a.employeeName}</span>
                                    <span className="text-xs text-gray-400 ml-2">{a.units ?? 1} clip</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-green-600">{formatCurrency(a.salaryEarned)}</span>
                                    <button
                                      onClick={() => handleReject(job.id, a.id)}
                                      disabled={submitting}
                                      className="text-xs bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded-lg font-medium transition-colors">
                                      Từ chối
                                    </button>
                                    <button
                                      onClick={() => {
                                        setApprovingItem({ jobId: job.id, assignmentId: a.id, jobTitle: job.title, empName: a.employeeName, salary: a.salaryEarned });
                                        setApproveNote("");
                                      }}
                                      disabled={submitting}
                                      className="text-xs bg-green-100 hover:bg-green-200 text-green-700 px-2 py-1 rounded-lg font-medium transition-colors">
                                      Duyệt
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                        {/* Standard jobs */}
                        {standardItems.map(({ job, assignment }) => (
                          <div key={assignment.id} className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-amber-200 bg-amber-50/30">
                            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs text-gray-500 mb-1">Job · {monthLabel(job.month || job.createdAt.slice(0, 7))}</p>
                                <h3 className="font-semibold">{job.title}</h3>
                                <p className="text-sm text-gray-600 mt-1 flex flex-wrap gap-1">
                                  <span>NV: <span className="font-medium">{assignment.employeeName}</span></span>
                                  <span>· {assignment.percentage}%</span>
                                  <span className="text-green-600 font-medium">· {formatCurrency(assignment.salaryEarned)}</span>
                                </p>
                              </div>
                              <div className="flex gap-2 w-full sm:w-auto">
                                <button
                                  onClick={() => handleReject(job.id, assignment.id)}
                                  disabled={submitting}
                                  className="flex items-center justify-center gap-1.5 bg-red-100 hover:bg-red-200 disabled:opacity-60 text-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 sm:flex-none shrink-0"
                                >
                                  <XCircle className="w-4 h-4" /> Từ chối
                                </button>
                                <button
                                  onClick={() => {
                                    setApprovingItem({ jobId: job.id, assignmentId: assignment.id, jobTitle: job.title, empName: assignment.employeeName, salary: assignment.salaryEarned });
                                    setApproveNote("");
                                  }}
                                  disabled={submitting}
                                  className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex-1 sm:flex-none shrink-0"
                                >
                                  <CheckCircle2 className="w-4 h-4" /> Duyệt
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}

          {/* ── Bảng lương tab ── */}
          {directorTab === "salary" && (() => {
            // Danh sách tháng
            const salaryMonths = (() => {
              const s = new Set<string>([currentYM()]);
              jobs.forEach((job) => {
                const jm = job.month || job.createdAt.slice(0, 7);
                s.add(jm);
                job.assignments.forEach((a) => { if (a.approvedAt) s.add(getSalaryMonth(jm, a.approvedAt)); });
              });
              return Array.from(s).sort().reverse();
            })();

            // Tính bảng lương theo tháng đang chọn
            const monthManual = manualEntries[directorMonth] ?? [];
            const rows = employees.map((emp) => {
              const approved = jobs.flatMap((job) =>
                job.assignments.filter((a) => {
                  if (a.employeeId !== emp.id || a.status !== "APPROVED") return false;
                  const jm = job.month || job.createdAt.slice(0, 7);
                  return getSalaryMonth(jm, a.approvedAt) === directorMonth;
                }).map((a) => ({ job, assignment: a }))
              );
              const pending = jobs.flatMap((job) =>
                job.assignments.filter((a) => {
                  if (a.employeeId !== emp.id) return false;
                  if (a.status !== "WORKING" && a.status !== "PENDING_APPROVAL") return false;
                  const jm = job.month || job.createdAt.slice(0, 7);
                  return jm === directorMonth;
                }).map((a) => ({ job, assignment: a }))
              );
              const manual = monthManual.filter((e) => e.empId === emp.id);
              const totalApproved = approved.reduce((s, x) => s + x.assignment.salaryEarned, 0) + manual.reduce((s, e) => s + e.amount, 0);
              const totalPending = pending.reduce((s, x) => s + x.assignment.salaryEarned, 0);
              return { emp, approved, pending, manual, totalApproved, totalPending };
            }).filter((r) => r.approved.length > 0 || r.pending.length > 0 || r.manual.length > 0);

            const grandTotal = rows.reduce((s, r) => s + r.totalApproved, 0);

            return (
              <div className="space-y-5">
                {showSalaryPreview && (() => {
                  const BANK_BINS: [string[], string][] = [
                    [['vietcombank','vcb'], '970436'],
                    [['techcombank','tcb'], '970407'],
                    [['bidv'], '970418'],
                    [['vietinbank','ctg','viettinbank'], '970415'],
                    [['agribank'], '970405'],
                    [['mbbank','mb bank','mb'], '970422'],
                    [['vpbank','vp bank'], '970432'],
                    [['acb'], '970416'],
                    [['sacombank'], '970403'],
                    [['tpbank','tp bank'], '970423'],
                    [['vib'], '970441'],
                    [['hdbank','hd bank'], '970437'],
                    [['ocb'], '970448'],
                    [['seabank','sea bank'], '970440'],
                    [['shb'], '970443'],
                    [['msb'], '970426'],
                    [['lienvietpostbank','lienviệt','lpb'], '970449'],
                    [['eximbank','exim'], '970431'],
                    [['ncb'], '970419'],
                    [['pvcombank'], '970412'],
                    [['abbank'], '970425'],
                    [['vietbank'], '970433'],
                    [['baovietbank','bao viet'], '970438'],
                  ];
                  const getBankBin = (bankName?: string): string | null => {
                    if (!bankName) return null;
                    const lower = bankName.toLowerCase();
                    for (const [keys, bin] of BANK_BINS) {
                      if (keys.some(k => lower.includes(k))) return bin;
                    }
                    return null;
                  };
                  const tableRows = rows.map((r, i) => {
                    const status = (empStatusByMonth[directorMonth]?.[r.emp.id] ?? 'official') as 'official' | 'probation';
                    const payroll = getPayroll(status, r.totalApproved);
                    return { i, empId: r.emp.id, name: r.emp.name, cccd: r.emp.profile?.cccd ?? '', stk: r.emp.profile?.stk ?? '', nganHang: r.emp.profile?.nganHang ?? '', status, lcs: payroll.lcs, thuongKPI: payroll.thuongKPI, tongThuNhap: payroll.tongThuNhap, tongBH: payroll.tongBH, gtBanThan: payroll.gtBanThan, tntt: payroll.tntt, thue: payroll.thue, thucLinh: payroll.thucLinh };
                  });
                  const toggleStatus = async (empId: string, current: 'official' | 'probation') => {
                    const next = current === 'probation' ? 'official' : 'probation';
                    const updated = { ...empStatusByMonth, [directorMonth]: { ...(empStatusByMonth[directorMonth] ?? {}), [empId]: next } } as Record<string, Record<string, "official" | "probation">>;
                    setEmpStatusByMonth(updated);
                    await fetch('/api/settings/employment_status', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) });
                  };
                  const exportPayrollCSV = () => {
                    const header = "STT,Họ và tên,Loại HĐ,Lương đóng BHXH,Thưởng KPIs/Năng suất,Tổng thu nhập gộp,Thu nhập miễn thuế,Thu nhập chịu thuế,BHXH (8%),BHYT (1.5%),BHTN (1%),Tổng khấu trừ BH,Giảm trừ bản thân (2026),Giảm trừ NPT (2026),Thu nhập tính thuế,Thuế TNCN,Thực lĩnh";
                    const csvRows = tableRows.map((tr) => {
                      const p = getPayroll(tr.status, tr.tongThuNhap);
                      return [tr.i + 1, `"${tr.name}"`, tr.status === 'probation' ? 'Thử việc' : 'Chính thức', p.lcs, p.thuongKPI, p.tongThuNhap, p.tnMienThue, p.tnChiuThue, p.bhxh, p.bhyt, p.bhtn, p.tongBH, p.gtBanThan, p.gtNguoiPhuThuoc, p.tntt, p.thue, p.thucLinh].join(",");
                    });
                    const blob = new Blob(["\uFEFF" + [header, ...csvRows].join("\n")], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = `Bang-Luong-Chuan-2026-${directorMonth}.csv`; a.click(); URL.revokeObjectURL(url);
                  };
                  return (
                    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" onClick={() => setShowSalaryPreview(false)}>
                      <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            <FileSpreadsheet className="w-6 h-6 text-indigo-500" />
                            Bảng Lương Chuẩn (Luật 2026) — {monthLabel(directorMonth)}
                          </h3>
                          <button onClick={() => setShowSalaryPreview(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors bg-white shadow-sm border border-gray-100">
                            <X className="w-5 h-5 text-gray-500" />
                          </button>
                        </div>
                        <div className="overflow-auto flex-1 p-6 bg-slate-50">
                          <p className="text-xs text-slate-500 mb-3">Bấm vào cột <strong>Loại HĐ</strong> để chuyển trạng thái — lưu riêng theo từng tháng, không ảnh hưởng các tháng khác.</p>
                          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
                            <table className="w-full text-sm text-left">
                              <thead className="bg-slate-100 text-slate-600 text-xs font-bold whitespace-nowrap sticky top-0 uppercase tracking-wider z-10 shadow-sm">
                                <tr>
                                  <th className="px-4 py-4 border-b border-slate-200">STT</th>
                                  <th className="px-4 py-4 border-b border-slate-200 min-w-[150px]">Họ và tên</th>
                                  <th className="px-4 py-4 border-b border-slate-200">Loại HĐ</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-right" title="Mức lương cố định để đóng BHXH">Lương HĐ</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-right text-orange-500">Thưởng KPI</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-right text-white font-extrabold">Tổng thu nhập gộp</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-right">Trừ BH (10.5%)</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-right">Giảm trừ</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-right text-indigo-400">TN Tính thuế</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-right text-rose-400">Thuế TNCN</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-right text-emerald-400 text-base">Thực lĩnh</th>
                                  <th className="px-4 py-4 border-b border-slate-200 text-center">QR</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100 text-slate-700">
                                {tableRows.map((tr) => (
                                  <tr key={tr.i} className="hover:bg-slate-50 transition-colors whitespace-nowrap group">
                                    <td className="px-4 py-3.5 text-slate-400 font-medium">{tr.i + 1}</td>
                                    <td className="px-4 py-3.5 font-bold text-slate-800">{tr.name}</td>
                                    <td className="px-4 py-3.5">
                                      <button onClick={() => toggleStatus(tr.empId, tr.status)} className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition-colors ${ tr.status === 'probation' ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200' : 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' }`}>
                                        {tr.status === 'probation' ? '🔶 Thử việc' : '✅ Chính thức'}
                                      </button>
                                    </td>
                                    <td className="px-4 py-3.5 text-right text-slate-500">{formatCurrency(tr.lcs)}</td>
                                    <td className="px-4 py-3.5 text-right text-orange-600 font-medium">{formatCurrency(tr.thuongKPI)}</td>
                                    <td className="px-4 py-3.5 text-right font-bold text-black border-x border-slate-100 bg-slate-50/50 group-hover:bg-white">{formatCurrency(tr.tongThuNhap)}</td>
                                    <td className="px-4 py-3.5 text-right text-slate-500">{formatCurrency(tr.tongBH)}</td>
                                    <td className="px-4 py-3.5 text-right text-slate-500">{formatCurrency(tr.gtBanThan)}</td>
                                    <td className="px-4 py-3.5 text-right text-indigo-600 font-semibold border-x border-indigo-50/50">{formatCurrency(tr.tntt)}</td>
                                    <td className="px-4 py-3.5 text-right text-rose-600 font-bold border-r border-rose-50/50">{formatCurrency(tr.thue)}</td>
                                    <td className="px-4 py-3.5 text-right text-emerald-600 font-black text-base">{formatCurrency(tr.thucLinh)}</td>
                                    <td className="px-4 py-3.5 text-center">
                                      {(() => {
                                        const bin = getBankBin(tr.nganHang);
                                        if (!bin || !tr.stk) return <span className="text-[10px] text-slate-300">—</span>;
                                        const month = directorMonth.split('-')[1]?.replace(/^0/, '');
                                        const toAscii = (s: string) => s
                                          .replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D')
                                          .normalize('NFD')
                                          .replace(/[\u0300-\u036f]/g, '')
                                          .replace(/[^A-Za-z0-9 ]/g, '')
                                          .toUpperCase();
                                        const addInfo = toAscii(`TT LUONG T${month} ${tr.cccd} ${tr.name}`);
                                        const accountName = toAscii(tr.name);
                                        const url = `https://img.vietqr.io/image/${bin}-${tr.stk}-compact2.png?amount=${Math.round(tr.thucLinh)}&addInfo=${encodeURIComponent(addInfo)}&accountName=${encodeURIComponent(accountName)}`;
                                        return (
                                          <button onClick={() => setQrPreview({ name: tr.name, amount: tr.thucLinh, url })} className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors" title="Xem QR thanh toán lương">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h.01M18 14h.01M14 18h.01M18 18h.01M14 21h.01M21 14v7"/></svg>
                                          </button>
                                        );
                                      })()}
                                    </td>
                                  </tr>
                                ))}
                                {tableRows.length === 0 && (
                                  <tr><td colSpan={11} className="px-4 py-8 text-center text-slate-400 font-medium">Chưa có dữ liệu tính lương trong tháng này</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                          <button onClick={() => setShowSalaryPreview(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors">Đóng</button>
                          <button onClick={exportPayrollCSV} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg transition-colors shadow-sm">
                            <Download className="w-4 h-4" />
                            Xuất CSV chuẩn 2026
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}
                {/* QR Payment Modal */}
                {qrPreview && (
                  <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[70]" onClick={() => setQrPreview(null)}>
                    <div className="bg-white rounded-2xl p-6 shadow-2xl flex flex-col items-center gap-4 max-w-xs w-full mx-4" onClick={e => e.stopPropagation()}>
                      <div className="text-center">
                        <p className="font-bold text-slate-800 text-base">{qrPreview.name}</p>
                        <p className="text-emerald-600 font-black text-xl mt-1">{formatCurrency(qrPreview.amount)}</p>
                      </div>
                      <img src={qrPreview.url} alt="VietQR" className="w-56 h-56 rounded-xl border border-slate-200 shadow" />
                      <p className="text-[11px] text-slate-400 text-center">Quét mã để thanh toán lương qua VietQR</p>
                      <button onClick={() => setQrPreview(null)} className="w-full py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-600 font-medium text-sm transition-colors">Đóng</button>
                    </div>
                  </div>
                )}
                {/* Chọn tháng */}
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                  <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-0.5">
                    {salaryMonths.map((ym) => (
                      <button key={ym} onClick={() => setDirectorMonth(ym)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${directorMonth === ym ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                        {monthLabel(ym)}{ym === currentYM() ? " ●" : ""}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Bảng lương nhân viên ── */}
                <div className="bg-blue-600 text-white rounded-xl p-4 flex justify-between items-center">
                  <div>
                    <p className="text-blue-200 text-sm">Tổng chi — {monthLabel(directorMonth)}</p>
                    <p className="text-2xl font-black tracking-tight">{formatCurrency(grandTotal)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => {
                      const lines = [`Bảng lương ${monthLabel(directorMonth)}`, ""];
                      rows.forEach(({ emp, approved, totalApproved }) => {
                        lines.push(`${emp.name}: ${totalApproved.toLocaleString("vi-VN")} đ`);
                        approved.forEach(({ job, assignment }) => {
                          lines.push(`  - ${job.title} (${job.jobType === "mini" ? `${assignment.units ?? 1} clip` : `${assignment.percentage}%`}): ${assignment.salaryEarned.toLocaleString("vi-VN")} đ${assignment.note ? ` [${assignment.note}]` : ""}`);
                        });
                        lines.push("");
                      });
                      lines.push(`Tổng: ${grandTotal.toLocaleString("vi-VN")} đ`);
                      navigator.clipboard.writeText(lines.join("\n"));
                      setCopySuccess(true);
                      setTimeout(() => setCopySuccess(false), 2000);
                    }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors text-sm font-medium" title="Copy văn bản">
                      {copySuccess ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      <span>{copySuccess ? 'Copied!' : 'Copy'}</span>
                    </button>
                    <button onClick={() => {
                      const header = "Nhân viên,Job,Phần trăm / Clip,Số tiền,Ngày duyệt,Ghi chú";
                      const csvRows = rows.flatMap(({ emp, approved }) =>
                        approved.map(({ job, assignment }) =>
                          `"${emp.name}","${job.title}","${job.jobType === "mini" ? `${assignment.units ?? 1} clip` : `${assignment.percentage}%`}",${assignment.salaryEarned},"${assignment.approvedAt ? new Date(assignment.approvedAt).toLocaleDateString("vi-VN") : ""}","${assignment.note || ""}"`
                        )
                      );
                      const csv = [header, ...csvRows].join("\n");
                      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url;
                      a.download = `bang-luong-${directorMonth}.csv`;
                      a.click(); URL.revokeObjectURL(url);
                    }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors text-sm font-medium" title="Tải CSV">
                      <Download className="w-4 h-4" />
                      <span>CSV đơn giản</span>
                    </button>
                    <button onClick={() => setShowSalaryPreview(true)} className="flex items-center gap-1.5 px-3 py-2 bg-indigo-500 hover:bg-indigo-400 rounded-lg transition-colors text-sm font-medium" title="Xem trước Bảng Lương Chuẩn">
                      <Search className="w-4 h-4" />
                      <span>Xem trước</span>
                    </button>
                    <button onClick={() => {
                      setShowContractModal(true);
                      setSelectedContractEmps(rows.map(r => r.emp.id));
                    }} className="flex items-center gap-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors text-sm font-medium" title="Xuất hợp đồng (mail merge Word)">
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>Hợp đồng</span>
                    </button>
                  </div>
                </div>

                {showContractModal && (() => {
                  return (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setShowContractModal(false)}>
                      <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-gray-50/50">
                          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                            <FileSpreadsheet className="w-6 h-6 text-blue-500" />
                            Chọn nhân viên xuất hợp đồng
                          </h3>
                          <button onClick={() => setShowContractModal(false)} className="p-2 hover:bg-gray-200 rounded-full transition-colors bg-white shadow-sm border border-gray-100">
                            <X className="w-5 h-5 text-gray-500" />
                          </button>
                        </div>
                        <div className="p-4 max-h-[60vh] overflow-auto">
                           {rows.map(r => (
                               <label key={r.emp.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-xl cursor-pointer">
                                   <input type="checkbox" className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                     checked={selectedContractEmps.includes(r.emp.id)}
                                     onChange={(e) => {
                                         if (e.target.checked) setSelectedContractEmps([...selectedContractEmps, r.emp.id]);
                                         else setSelectedContractEmps(selectedContractEmps.filter(id => id !== r.emp.id));
                                     }}
                                   />
                                   <span className="font-medium text-gray-800">{r.emp.name}</span>
                               </label>
                           ))}
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                           <button onClick={() => setShowContractModal(false)} className="px-4 py-2 text-gray-600 font-medium hover:bg-gray-200 rounded-lg transition-colors">
                             Hủy
                           </button>
                           <button onClick={async () => {
                              const filteredRows = rows.filter(r => selectedContractEmps.includes(r.emp.id));
                              type ContractItem =
                                | { kind: "job"; emp: Employee; job: Job; assignment: JobAssignment }
                                | { kind: "manual"; emp: Employee; entry: ManualEntry };
                              const rawContracts: ContractItem[] = [
                                ...filteredRows.flatMap(({ emp, approved }) =>
                                  approved.map(({ job, assignment }) => ({ kind: "job" as const, emp, job, assignment }))
                                ),
                                ...filteredRows.flatMap(({ emp, manual }) =>
                                  manual.map((entry) => ({ kind: "manual" as const, emp, entry }))
                                ),
                              ];
                              if (rawContracts.length === 0) {
                                  alert("Không có dữ liệu hợp đồng cho nhân viên đã chọn.");
                                  return;
                              }
                              
                              const empOfRaw = (c: ContractItem) => c.emp;
                              const getRawAmount = (c: ContractItem) => c.kind === "job" ? c.assignment.salaryEarned : c.entry.amount;
                              const getRawContent = (c: ContractItem) => c.kind === "job" ? (c.job.description || c.job.title) : c.entry.title + (c.entry.note ? ` — ${c.entry.note}` : "");

                              type ProcessedContract = {
                                  emp: Employee;
                                  amount: number;
                                  content: string;
                                  date: { dd: string; mm: string; yyyy: string };
                              };

                              let splitContracts: ProcessedContract[] = [];
                              const maxAmount = 1900000;
                              const [yyyyStr, mmStr] = directorMonth.split("-");
                              
                              const uniqueEmpIds = Array.from(new Set(rawContracts.map(c => empOfRaw(c).id)));
                              
                              for (const empId of uniqueEmpIds) {
                                  const empRawContracts = rawContracts.filter(c => empOfRaw(c).id === empId);
                                  let empChunks: ProcessedContract[] = [];
                                  
                                  for (const c of empRawContracts) {
                                      const totalAmt = getRawAmount(c);
                                      const content = getRawContent(c);
                                      let remaining = totalAmt;
                                      
                                      if (remaining <= maxAmount) {
                                          empChunks.push({
                                              emp: empOfRaw(c),
                                              amount: remaining,
                                              content: content,
                                              date: { dd: "01", mm: mmStr, yyyy: yyyyStr }
                                          });
                                        } else {
                                          while (remaining > 0) {
                                              const chunkAmt = Math.min(remaining, maxAmount);
                                              empChunks.push({
                                                  emp: empOfRaw(c),
                                                  amount: chunkAmt,
                                                  content: content,
                                                  date: { dd: "01", mm: mmStr, yyyy: yyyyStr }
                                              });
                                              remaining -= chunkAmt;
                                          }
                                      }
                                  }
                                  
                                  // Assign unique days for this employee's contracts
                                  let day = 1;
                                  for (const chunk of empChunks) {
                                      let dayStr = String(day).padStart(2, "0");
                                      chunk.date = { dd: dayStr, mm: mmStr, yyyy: yyyyStr };
                                      day++;
                                      if (day > 28) day = 1; // Wrap around safely for all months
                                  }
                                  
                                  splitContracts = splitContracts.concat(empChunks);
                              }

                              const varRows: string[][] = [
                                ["MÃ BIÊN (Dùng trong file Word) / (Không sửa cột này)", "DIỄN GIẢI (Hướng dẫn nhập liệu)", ...splitContracts.map(() => "")],
                                ["HO_TEN_BEN_B", "Họ và tên người ký (Bắt buộc)", ...splitContracts.map(c => c.emp.profile?.hoTen || c.emp.name)],
                                ["{CCCD_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.cccd || "")],
                                ["{NGAY_CAP_CCCD_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.ngayCapCccd || "")],
                                ["{NOI_CAP_CCCD_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.noiCapCccd || "")],
                                ["{DIA_CHI_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.diaChi || "")],
                                ["{MST_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.mst || "")],
                                ["{DIEN_THOAI_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.dienThoai || "")],
                                ["{STK_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.stk || "")],
                                ["{NGAN_HANG_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.nganHang || "")],
                                ["SO_TIEN_DOI_TAC_THUC_NHAN", "Số tiền thực nhận", ...splitContracts.map(c => String(c.amount))],
                                ["NOI_DUNG_CONG_VIEC", "Nội dung công việc", ...splitContracts.map(c => c.content)],
                                ["NGAY_KY_KET", "Ngày ký", ...splitContracts.map(c => c.date.dd)],
                                ["THANG_KY_KET", "Tháng ký", ...splitContracts.map(c => c.date.mm)],
                                ["NAM_KY_KET", "Năm ký", ...splitContracts.map(c => c.date.yyyy)],
                              ];
                              const XLSX = await import("xlsx");
                              const worksheet = XLSX.utils.aoa_to_sheet(varRows);
                              const stkRowIndex = varRows.findIndex((row) => row[0] === "{STK_BEN_B}");
                              if (stkRowIndex >= 0) {
                                for (let colIndex = 2; colIndex < varRows[stkRowIndex].length; colIndex++) {
                                  const cellAddress = XLSX.utils.encode_cell({ r: stkRowIndex, c: colIndex });
                                  const cell = worksheet[cellAddress];
                                  if (cell) {
                                    cell.t = "s";
                                    cell.v = splitContracts[colIndex - 2]?.emp.profile?.stk || "";
                                    cell.z = "@";
                                  }
                                }
                              }
                              worksheet["!cols"] = [
                                { wch: 42 },
                                { wch: 28 },
                                ...splitContracts.map(() => ({ wch: 20 })),
                              ];
                              const workbook = XLSX.utils.book_new();
                              XLSX.utils.book_append_sheet(workbook, worksheet, "HopDong");
                              XLSX.writeFile(workbook, `hop-dong-${directorMonth}.xlsx`);
                              setShowContractModal(false);
                           }} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-sm">
                             Xuất Hợp Đồng
                           </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Bảng từng nhân viên */}
                {rows.length === 0 ? (
                  <EmptyBlock text={`Không có dữ liệu lương tháng ${monthLabel(directorMonth)}.`} />
                ) : (
                  <div className="grid gap-4">
                    {rows.map(({ emp, approved, pending, manual, totalApproved, totalPending }) => (
                      <div key={emp.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold">{emp.name}</span>
                            <button
                              onClick={() => { setManualModal({ emp }); setManualTitle(""); setManualAmount(""); setManualNote(""); }}
                              className="w-5 h-5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full flex items-center justify-center text-xs font-bold transition-colors shrink-0"
                              title="Thêm lương thủ công"
                            >+</button>
                          </div>
                          <div className="text-right">
                            <p className="text-green-700 font-black">{formatCurrency(totalApproved)}</p>
                            {totalPending > 0 && <p className="text-xs text-amber-600">+{formatCurrency(totalPending)} chờ duyệt</p>}
                          </div>
                        </div>
                        <div className="divide-y divide-gray-50">
                          {approved.map(({ job, assignment }) => (
                            <div key={assignment.id} className="px-4 py-2.5 text-sm">
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{job.title}</p>
                                  <p className="text-gray-400 text-xs">
                                    {job.jobType === "mini" ? `${assignment.units ?? 1} clip` : `${assignment.percentage}%`} · Duyệt {assignment.approvedAt ? new Date(assignment.approvedAt).toLocaleDateString("vi-VN") : "—"}
                                  </p>
                                  {assignment.note && <p className="text-blue-600 text-xs mt-0.5 flex items-center gap-1"><MessageSquare className="w-3 h-3" />{assignment.note}</p>}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-green-600 font-semibold">{formatCurrency(assignment.salaryEarned)}</span>
                                  <button
                                    onClick={() => setDateEditModal({
                                      job,
                                      assignment,
                                      createdAt: job.createdAt.slice(0, 10),
                                      approvedAt: assignment.approvedAt ? assignment.approvedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
                                    })}
                                    className="text-gray-300 hover:text-blue-400 transition-colors"
                                    title="Sửa ngày tạo / ngày duyệt"
                                  ><Pencil className="w-3.5 h-3.5" /></button>
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Xoá "${job.title}" của ${emp.name}?\n${job.jobType === "mini" ? `${assignment.units ?? 1} clip` : `${assignment.percentage}%`} (${formatCurrency(assignment.salaryEarned)}) sẽ trở về chợ.`)) return;
                                      await fetch(`/api/jobs/${job.id}/assignments/${assignment.id}`, { method: "DELETE" });
                                      await fetchAll();
                                    }}
                                    className="text-gray-300 hover:text-red-400 transition-colors"
                                    title="Xoá & trả về chợ"
                                  ><X className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {/* Manual entries */}
                          {manual.map((entry) => (
                            <div key={entry.id} className="px-4 py-2.5 text-sm bg-emerald-50/50">
                              <div className="flex justify-between items-start gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate text-emerald-800">{entry.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium">Thủ công</span>
                                    {entry.note && <p className="text-emerald-600 text-xs">{entry.note}</p>}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-emerald-600 font-semibold">{formatCurrency(entry.amount)}</span>
                                  <button
                                    onClick={async () => {
                                      await fetch(`/api/manual-salary/${entry.id}`, { method: "DELETE" });
                                      const updated = { ...manualEntries };
                                      updated[directorMonth] = (updated[directorMonth] ?? []).filter((e) => e.id !== entry.id);
                                      setManualEntries(updated);
                                    }}
                                    className="text-gray-300 hover:text-red-400 transition-colors text-xs"
                                    title="Xoá"
                                  ><X className="w-3.5 h-3.5" /></button>
                                </div>
                              </div>
                            </div>
                          ))}
                          {pending.map(({ job, assignment }) => (
                            <div key={assignment.id} className="flex justify-between items-center px-4 py-2.5 text-sm bg-amber-50/40">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate text-gray-500">{job.title}</p>
                                <p className="text-amber-500 text-xs">{assignment.percentage}% · <StatusBadge status={assignment.status} /></p>
                              </div>
                              <span className="text-amber-500 font-semibold ml-3 shrink-0">{formatCurrency(assignment.salaryEarned)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Nhân viên chưa có trong bảng lương tháng này ── */}
                {(() => {
                  const inRows = new Set(rows.map((r) => r.emp.id));
                  const missing = employees.filter((e) => !inRows.has(e.id));
                  if (missing.length === 0) return null;
                  return (
                    <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-3">
                      <p className="text-xs text-gray-400 font-medium mb-2">Chưa có lương tháng này — thêm thủ công:</p>
                      <div className="flex flex-wrap gap-2">
                        {missing.map((emp) => (
                          <button
                            key={emp.id}
                            onClick={() => { setManualModal({ emp }); setManualTitle(""); setManualAmount(""); setManualNote(""); }}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 rounded-xl text-sm font-medium text-gray-700 transition-colors"
                          >
                            <span className="w-5 h-5 bg-emerald-500 text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0">+</span>
                            {emp.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}

          {/* ── Tab Thu Chi ── */}
          {directorTab === "finance" && (() => {
            // Danh sách tháng (giống tab lương)
            const salaryMonths = (() => {
              const s = new Set<string>([currentYM()]);
              jobs.forEach((job) => {
                const jm = job.month || job.createdAt.slice(0, 7);
                s.add(jm);
                job.assignments.forEach((a) => { if (a.approvedAt) s.add(getSalaryMonth(jm, a.approvedAt)); });
              });
              return Array.from(s).sort().reverse();
            })();

            // Tổng lương nhân viên tháng đang chọn
            const salaryRows = employees.map((emp) => {
              const approved = jobs.flatMap((job) =>
                job.assignments.filter((a) => {
                  if (a.employeeId !== emp.id || a.status !== "APPROVED") return false;
                  const jm = job.month || job.createdAt.slice(0, 7);
                  return getSalaryMonth(jm, a.approvedAt) === directorMonth;
                }).map((a) => ({ job, assignment: a }))
              );
              const totalApproved = approved.reduce((s, x) => s + x.assignment.salaryEarned, 0);
              return { emp, approved, totalApproved };
            }).filter((r) => r.approved.length > 0);

            const manualSalaryMonth = (manualEntries[directorMonth] ?? []).reduce((s, e) => s + e.amount, 0);
            const grandTotalSalary = salaryRows.reduce((s, r) => s + r.totalApproved, 0) + manualSalaryMonth;
            const financeShootingDays = shootingCalendarDays.filter((day) => day.ym === directorMonth);

            // Thu Chi data cho tháng đang chọn
            const thuChiMonth = thuChiData
              ? thuChiData.filter((t) => t.date?.startsWith(directorMonth))
              : null;
            const thuChiThu = thuChiMonth?.filter((t) => t.type === "Thu").reduce((s, t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0) ?? 0;
            const thuChiChi = thuChiMonth?.filter((t) => t.type === "Chi").reduce((s, t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0) ?? 0;
            const _amtM = (t: ThuChiTransaction) => t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000;
            const thuMetubMonth = thuChiMonth?.filter(t => t.type === "Thu" && classifyRevenueSender(t.subject, t.note) === "metub").reduce((s, t) => s + _amtM(t), 0) ?? 0;
            const thuYeah1Month = thuChiMonth?.filter(t => t.type === "Thu" && classifyRevenueSender(t.subject, t.note) === "yeah1").reduce((s, t) => s + _amtM(t), 0) ?? 0;
            const thuMCVMonth   = thuChiMonth?.filter(t => t.type === "Thu" && classifyRevenueSender(t.subject, t.note) === "mcv").reduce((s, t) => s + _amtM(t), 0) ?? 0;
            const thuKhacMonth  = thuChiThu - thuMetubMonth - thuYeah1Month - thuMCVMonth;

            // Revenue (anhemphim.vn) cho tháng đang chọn
            const anhEmPhimThu = revenueData?.[directorMonth] ?? 0;

            // Tổng doanh thu = thu chi app + anhemphim
            const tongThu = thuChiThu + anhEmPhimThu;
            const tongChiTat = grandTotalSalary + thuChiChi;
            const loiNhuan = tongThu - tongChiTat;

            // Danh sách tháng cho báo cáo: hợp tháng từ cả 2 nguồn + salary
            const allReportMonths = [...new Set([
              ...( thuChiData ? thuChiData.map((t) => t.date?.slice(0, 7)).filter(Boolean) as string[] : []),
              ...( revenueData ? Object.keys(revenueData) : []),
              ...salaryMonths,
              ...Object.keys(manualEntries),
            ])].sort().reverse();

            const reportRows = allReportMonths.map((ym) => {
              const txs = thuChiData?.filter((t) => t.date?.startsWith(ym)) ?? [];
              const _amt = (t: ThuChiTransaction) => t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000;
              const thuTxs = txs.filter((t) => t.type === "Thu");
              const thuChiThuYm = thuTxs.reduce((s, t) => s + _amt(t), 0);
              const thuMetubYm  = thuTxs.filter(t => classifyRevenueSender(t.subject, t.note) === "metub").reduce((s, t) => s + _amt(t), 0);
              const thuYeah1Ym  = thuTxs.filter(t => classifyRevenueSender(t.subject, t.note) === "yeah1").reduce((s, t) => s + _amt(t), 0);
              const thuMCVYm    = thuTxs.filter(t => classifyRevenueSender(t.subject, t.note) === "mcv").reduce((s, t) => s + _amt(t), 0);
              const thuKhacYm   = thuChiThuYm - thuMetubYm - thuYeah1Ym - thuMCVYm;
              const chiYm = txs.filter((t) => t.type === "Chi").reduce((s, t) => s + _amt(t), 0);
              const revYm = revenueData?.[ym] ?? 0;
              const thuYm = thuChiThuYm + revYm;
              const salaryFromJobs = employees.map((emp) =>
                jobs.flatMap((job) => job.assignments.filter((a) => {
                  if (a.employeeId !== emp.id || a.status !== "APPROVED") return false;
                  return getSalaryMonth(job.month || job.createdAt.slice(0, 7), a.approvedAt) === ym;
                }).map((a) => a.salaryEarned))
              ).flat().reduce((s, x) => s + x, 0);
              const manualSalaryYm = (manualEntries[ym] ?? []).reduce((s, e) => s + e.amount, 0);
              const salary = salaryFromJobs + manualSalaryYm;
              const tongChi = chiYm + salary;
              const loiNhuanYm = thuYm - tongChi;
              return { ym, thu: thuYm, thuChiThu: thuChiThuYm, thuMetub: thuMetubYm, thuYeah1: thuYeah1Ym, thuMCV: thuMCVYm, thuKhac: thuKhacYm, revYm, chi: chiYm, salary, tongChi, loiNhuan: loiNhuanYm };
            });

            return (
              <div className="space-y-5">
                {/* Sub-tab toggle + export */}
                <div className="flex gap-2 items-center">
                  <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
                    <button onClick={() => setFinanceView("overview")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${financeView === "overview" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                      <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5L12 3l9 6.5V21H3V9.5Z"/><path d="M9 21V12h6v9"/></svg> Tổng quan
                    </button>
                    <button onClick={() => setFinanceView("month")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${financeView === "month" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                      <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Chi tiết
                    </button>
                    <button onClick={() => setFinanceView("report")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${financeView === "report" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                      <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16V10M12 16V6M17 16v-5"/></svg> Báo cáo
                    </button>
                    <button onClick={() => setFinanceView("anhemphim")}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${financeView === "anhemphim" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                      <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg> AEP
                    </button>
                  </div>
                  {/* Nút xuất CSV */}
                  {(thuChiData || revenueData) && financeView !== "overview" && financeView !== "anhemphim" && (
                    <button
                      title={financeView === "month" ? `Xuất CSV tháng ${directorMonth}` : "Xuất CSV tổng hợp"}
                      onClick={() => {
                        if (financeView === "month") {
                          // Xuất chi tiết tháng
                          const header = "Loại,Nội dung,Ngày,Số tiền (VND),Ghi chú";
                          const rows: string[] = [];
                          if (anhEmPhimThu > 0) {
                            rows.push(`Thu,anhemphim.vn,${directorMonth},${anhEmPhimThu},Doanh thu dịch vụ online`);
                          }
                          (thuChiData?.filter((t) => t.date?.startsWith(directorMonth)) ?? []).forEach((t) => {
                            const amt = t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000;
                            rows.push(`${t.type},"${t.subject}",${t.date},${t.type === "Chi" ? -amt : amt},"${t.note ?? ""}"`);
                          });
                          if (grandTotalSalary > 0) {
                            rows.push(`Chi,Lương nhân viên,${directorMonth},${-grandTotalSalary},${salaryRows.length} người`);
                          }
                          const csv = [header, ...rows].join("\n");
                          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `tai-chinh-${directorMonth}.csv`;
                          a.click();
                        } else {
                          // Xuất báo cáo tổng hợp
                          const header = "Tháng,AEP (VND),Metub (VND),Yeah1 (VND),MCV (VND),Thu khác (VND),Chi khác (VND),Lương (VND),Lợi nhuận (VND),VAT 8% (VND),TNCN 3% (VND),TNDN 18% (VND)";
                          const rows = reportRows.map((r) => {
                            const totalThu = r.revYm + r.thuChiThu;
                            const totalChi = r.chi + r.salary;
                            return [
                              r.ym,
                              r.revYm,
                              r.thuMetub,
                              r.thuYeah1,
                              r.thuMCV,
                              r.thuKhac,
                              r.chi,
                              r.salary,
                              r.loiNhuan,
                              Math.round(totalThu * 0.08),
                              Math.round(totalChi * 0.03),
                              r.loiNhuan > 0 ? Math.round(r.loiNhuan * 0.18) : 0,
                            ].join(",");
                          });
                          const totThu = reportRows.reduce((s, r) => s + r.revYm + r.thuChiThu, 0);
                          const totChi = reportRows.reduce((s, r) => s + r.chi + r.salary, 0);
                          const totProfit = reportRows.reduce((s, r) => s + r.loiNhuan, 0);
                          rows.push([
                            "TỔNG CỘNG",
                            reportRows.reduce((s, r) => s + r.revYm, 0),
                            reportRows.reduce((s, r) => s + r.thuMetub, 0),
                            reportRows.reduce((s, r) => s + r.thuYeah1, 0),
                            reportRows.reduce((s, r) => s + r.thuMCV, 0),
                            reportRows.reduce((s, r) => s + r.thuKhac, 0),
                            reportRows.reduce((s, r) => s + r.chi, 0),
                            reportRows.reduce((s, r) => s + r.salary, 0),
                            totProfit,
                            Math.round(totThu * 0.08),
                            Math.round(totChi * 0.03),
                            totProfit > 0 ? Math.round(totProfit * 0.18) : 0,
                          ].join(","));
                          const csv = [header, ...rows].join("\n");
                          const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                          const a = document.createElement("a");
                          a.href = URL.createObjectURL(blob);
                          a.download = `bao-cao-tai-chinh-${reportRows[0]?.ym ?? ""}-${reportRows[reportRows.length - 1]?.ym ?? ""}.csv`;
                          a.click();
                        }
                      }}
                      className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors shrink-0"
                    >
                      <Download className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {thuChiError && (
                  <div className="flex items-center justify-between px-3 py-2 bg-red-50 rounded-xl border border-red-200">
                    <p className="text-xs text-red-500 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />{thuChiError}</p>
                    <button onClick={fetchThuChi} disabled={thuChiLoading}
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 disabled:opacity-50">
                      <RefreshCw className={`w-3 h-3 ${thuChiLoading ? "animate-spin" : ""}`} /> Tải lại
                    </button>
                  </div>
                )}

                {/* Loading state */}
                {(thuChiLoading || revenueLoading) && (
                  <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin" /> Đang tải dữ liệu...
                  </div>
                )}

                {/* Connected but no data yet */}
                {!thuChiLoading && !revenueLoading && !thuChiData && !thuChiError && (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-400 mb-3">Chưa tải được dữ liệu từ app Thu Chi.</p>
                    <button onClick={fetchThuChi}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors flex items-center gap-2 mx-auto">
                      <RefreshCw className="w-4 h-4" /> Tải dữ liệu
                    </button>
                  </div>
                )}

                {/* Revenue error */}
                {revenueError && (
                  <div className="text-xs text-amber-600 px-1 space-y-1">
                    <p className="flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" /> anhemphim.vn: {revenueError}
                      <button onClick={fetchRevenue} className="underline ml-1">Thử lại</button>
                      {revenueDebug && (
                        <button
                          onClick={() => {
                            const text = `[Revenue API Error]\nTime: ${new Date().toISOString()}\n` +
                              Object.entries(revenueDebug).map(([k, v]) => `${k}: ${v ?? "null"}`).join("\n");
                            navigator.clipboard.writeText(text);
                          }}
                          className="underline ml-1 text-amber-700"
                        >Copy debug</button>
                      )}
                    </p>
                    {revenueDebug && (
                      <pre className="bg-amber-50 border border-amber-200 rounded p-2 text-[10px] text-amber-800 overflow-x-auto max-h-28 whitespace-pre-wrap break-all">{`status: ${revenueDebug.status}\ncf-ray: ${revenueDebug.cfRay ?? "–"}\ncf-mitigated: ${revenueDebug.cfMitigated ?? "–"}\nserver: ${revenueDebug.server ?? "–"}\nbody: ${String(revenueDebug.bodySnippet ?? "").slice(0, 200)}`}</pre>
                    )}
                  </div>
                )}
                {dailyAepRevenueError && (
                  <p className="text-xs text-orange-600 flex items-center gap-1.5 px-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> Casso ngày: {dailyAepRevenueError}
                    <button onClick={fetchDailyAepRevenue} className="underline ml-1">Thử lại</button>
                  </p>
                )}

                <div className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-orange-500" /> Lịch quay {monthLabel(directorMonth)}
                    </h2>
                    <span className="text-xs font-semibold text-orange-600 bg-orange-50 border border-orange-200 rounded-full px-2.5 py-1">
                      {financeShootingDays.length} ngày
                    </span>
                  </div>
                  {financeShootingDays.length === 0 ? (
                    <p className="text-sm text-gray-400">Chưa có ngày quay nào trong tháng này.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {financeShootingDays.map((day) => {
                        const theme = getShootingCalendarTheme(day);
                        return (
                        <div key={day.dateKey} className={`rounded-xl border p-3 ${theme.card}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={`w-11 h-11 rounded-xl flex flex-col items-center justify-center shrink-0 ${theme.dateBox}`}>
                                <span className="text-base font-black leading-none">{String(day.day).padStart(2, "0")}</span>
                                <span className="text-[10px] font-semibold">{day.ym.slice(5)}</span>
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900 truncate">{day.fullLabel}</p>
                                <p className={`text-xs truncate ${theme.titleText}`}>{day.projectList.join(", ") || "Chưa có dự án"}</p>
                              </div>
                            </div>
                            <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 shrink-0 ${theme.badge}`}>{day.jobCount} job</span>
                          </div>
                          <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-500">
                            <span className="truncate">{day.groupList[0] ?? "Lịch quay"}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setStaffingDayModal(day);
                                setStaffingSelections(Object.fromEntries(day.jobs.map((job) => [job.id, job.assignments[0]?.employeeId ?? ""])));
                              }}
                              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold shrink-0 ${theme.button}`}
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Nhân sự
                            </button>
                          </div>
                        </div>
                      );
                      })}
                    </div>
                  )}
                </div>

                {/* ── View: Tổng quan ── */}
                {(thuChiData || revenueData) && !thuChiLoading && !revenueLoading && financeView === "overview" && (() => {
                  const filteredRows = overviewFilter === "all" ? reportRows : reportRows.filter(r => r.ym === overviewFilter);

                  const totalAEP     = filteredRows.reduce((s, r) => s + r.revYm, 0);
                  const totalThuKhac = filteredRows.reduce((s, r) => s + r.thuChiThu, 0);
                  const totalMetub   = filteredRows.reduce((s, r) => s + r.thuMetub, 0);
                  const totalYeah1   = filteredRows.reduce((s, r) => s + r.thuYeah1, 0);
                  const totalMCV     = filteredRows.reduce((s, r) => s + r.thuMCV, 0);
                  const totalKhac    = filteredRows.reduce((s, r) => s + r.thuKhac, 0);
                  const totalThu     = totalAEP + totalThuKhac;
                  const totalChi     = filteredRows.reduce((s, r) => s + r.chi, 0);
                  const totalSalary  = filteredRows.reduce((s, r) => s + r.salary, 0);
                  const totalChiAll  = totalChi + totalSalary;
                  const totalProfit  = totalThu - totalChiAll;

                  const chartData = [...reportRows].reverse().map((r, i, arr) => {
                    const prev = arr[i - 1];
                    const profitDelta = prev ? r.loiNhuan - prev.loiNhuan : null;
                    return {
                      ym: r.ym,
                      name: r.ym.slice(5) + "/" + r.ym.slice(2, 4),
                      AEP: Math.round(r.revYm / 1e6 * 10) / 10,
                      Metub: Math.round(r.thuMetub / 1e6 * 10) / 10,
                      Yeah1: Math.round(r.thuYeah1 / 1e6 * 10) / 10,
                      MCV: Math.round(r.thuMCV / 1e6 * 10) / 10,
                      ThuKhac: Math.round(r.thuKhac / 1e6 * 10) / 10,
                      TongThu: Math.round((r.revYm + r.thuChiThu) / 1e6 * 10) / 10,
                      TongChi: Math.round((r.chi + r.salary) / 1e6 * 10) / 10,
                      LoiNhuan: Math.round(r.loiNhuan / 1e6 * 10) / 10,
                      Delta: profitDelta !== null ? Math.round(profitDelta / 1e6 * 10) / 10 : null,
                    };
                  });

                  const refIdx = overviewFilter === "all"
                    ? (() => {
                        // Tìm tháng gần nhất có dữ liệu thực (TongThu hoặc TongChi > 0)
                        for (let i = chartData.length - 1; i >= 0; i--) {
                          if (chartData[i].TongThu > 0 || chartData[i].TongChi > 0) return i;
                        }
                        return chartData.length - 1;
                      })()
                    : Math.max(0, chartData.findIndex(c => c.ym === overviewFilter));
                  const refRow = chartData[refIdx];
                  const prevRow = refIdx > 0 ? chartData[refIdx - 1] : null;

                  return (
                    <div className="space-y-4">
                      {/* Filter tháng */}
                      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-0.5">
                        <button
                          onClick={() => setOverviewFilter("all")}
                          className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            overviewFilter === "all" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}>
                          Tất cả ({reportRows.length} tháng)
                        </button>
                        {[...reportRows].reverse().map((r) => (
                          <button
                            key={r.ym}
                            onClick={() => setOverviewFilter(r.ym)}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                              overviewFilter === r.ym ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                            }`}>
                            {r.ym.slice(5)}/{r.ym.slice(2,4)}{r.ym === currentYM() ? " ●" : ""}
                          </button>
                        ))}
                      </div>

                      {/* 3 KPI cards */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-green-50 border border-green-200 rounded-2xl p-3">
                          <p className="text-[10px] text-green-600 font-semibold mb-1"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4.5"/></svg> Tổng doanh thu</p>
                          <p className="font-black text-green-700 text-base leading-tight">{formatCurrency(totalThu)}</p>
                          {totalAEP > 0 && <p className="text-[10px] text-green-500 mt-1"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg> {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalAEP)}</p>}
                          {totalMetub > 0 && <p className="text-[10px] text-blue-500">Metub: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalMetub)}</p>}
                          {totalYeah1 > 0 && <p className="text-[10px] text-pink-500">Yeah1: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalYeah1)}</p>}
                          {totalMCV > 0 && <p className="text-[10px] text-purple-500">MCV: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalMCV)}</p>}
                          {totalKhac > 0 && <p className="text-[10px] text-green-400">Khác: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalKhac)}</p>}
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                          <p className="text-[10px] text-red-500 font-semibold mb-1"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z"/><path d="M8 10h8M8 14h5"/></svg> Tổng chi phí</p>
                          <p className="font-black text-red-600 text-base leading-tight">{formatCurrency(totalChiAll)}</p>
                          {totalChi > 0 && <p className="text-[10px] text-red-400 mt-1">Chi: {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalChi)}</p>}
                          {totalSalary > 0 && <p className="text-[10px] text-red-300">Lương: {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalSalary)}</p>}
                        </div>
                        <div className={`${totalProfit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"} border rounded-2xl p-3`}>
                          <p className={`text-[10px] font-semibold mb-1 ${totalProfit >= 0 ? "text-emerald-600" : "text-orange-500"}`}><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> Lợi nhuận</p>
                          <p className={`font-black text-base leading-tight ${totalProfit >= 0 ? "text-emerald-700" : "text-orange-600"}`}>{formatCurrency(totalProfit)}</p>
                          {totalThu > 0 && <p className={`text-[10px] mt-1 ${totalProfit >= 0 ? "text-emerald-400" : "text-orange-400"}`}>
                            {Math.round(totalProfit / totalThu * 100)}% biên lợi nhuận
                          </p>}
                        </div>
                      </div>

                      {/* Card chỉ báo lời/lỗ */}
                      {refRow && (
                        <div className={`rounded-2xl border ${
                          refRow.LoiNhuan >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                        }`}>
                          <div className="p-4 flex items-center justify-between gap-4">
                            <div>
                              <p className={`text-xs font-semibold mb-0.5 ${
                                refRow.LoiNhuan >= 0 ? "text-emerald-600" : "text-red-500"
                              }`}>
                                {refRow.LoiNhuan >= 0 ? <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> : <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg>} {refRow.name} — {refRow.LoiNhuan >= 0 ? "Có lời" : "Lỗ"}
                              </p>
                              <p className={`text-2xl font-black ${
                                refRow.LoiNhuan >= 0 ? "text-emerald-700" : "text-red-600"
                              }`}>
                                {refRow.LoiNhuan >= 0 ? "+" : ""}{refRow.LoiNhuan.toFixed(1)}tr
                              </p>
                              {prevRow && refRow.Delta !== null && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {refRow.Delta >= 0 ? "↑" : "↓"} {Math.abs(refRow.Delta).toFixed(1)}tr so với {prevRow.name}
                                </p>
                              )}
                            </div>
                            {prevRow && refRow.Delta !== null && (() => {
                              const up = refRow.Delta >= 0;
                              const pct = prevRow.LoiNhuan !== 0
                                ? Math.round(refRow.Delta / Math.abs(prevRow.LoiNhuan) * 100) : 0;
                              return (
                                <div className="text-right">
                                  <p className={`text-3xl font-black ${up ? "text-emerald-500" : "text-red-400"}`}>
                                    {up ? "+" : ""}{pct}%
                                  </p>
                                  <p className="text-xs text-gray-400">so tháng trước</p>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Chart: Thu vs Chi */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Tổng thu vs Tổng chi (triệu đồng)</p>
                        <ResponsiveContainer width="100%" height={180}>
                          <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barGap={3} barCategoryGap="30%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v) => `${v}tr`} axisLine={false} tickLine={false} />
                            <Tooltip
                              formatter={(v, name) => [`${v ?? 0}tr`, String(name)]}
                              contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}
                              cursor={{ fill: "#f9fafb" }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 6 }} />
                            <Bar dataKey="AEP" name="Anh Em Phim" stackId="thu" fill="#34d399" radius={[0,0,0,0]} />
                            <Bar dataKey="Metub" name="Metub" stackId="thu" fill="#60a5fa" radius={[0,0,0,0]} />
                            <Bar dataKey="Yeah1" name="Yeah1" stackId="thu" fill="#f472b6" radius={[0,0,0,0]} />
                            <Bar dataKey="MCV" name="MCV" stackId="thu" fill="#a78bfa" radius={[0,0,0,0]} />
                            <Bar dataKey="ThuKhac" name="Thu khác" stackId="thu" fill="#6ee7b7" radius={[4,4,0,0]} />
                            <Bar dataKey="TongChi" name="Tổng chi" fill="#fb923c" radius={[4,4,0,0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>

                      {/* Chart: Đường lợi nhuận */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-4">
                        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Xu hướng lợi nhuận (triệu đồng)</p>
                        <ResponsiveContainer width="100%" height={150}>
                          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                            <defs>
                              <linearGradient id="gPos2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0.02} />
                              </linearGradient>
                              <linearGradient id="gNeg2" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#f87171" stopOpacity={0.25} />
                                <stop offset="95%" stopColor="#f87171" stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} tickFormatter={(v) => `${v}tr`} axisLine={false} tickLine={false} />
                            <Tooltip
                              formatter={(v) => [`${v ?? 0}tr`, "Lợi nhuận"]}
                              contentStyle={{ fontSize: 12, borderRadius: 10, border: "1px solid #e5e7eb" }}
                              cursor={{ stroke: "#e5e7eb" }}
                            />
                            <ReferenceLine y={0} stroke="#e5e7eb" strokeWidth={1.5} />
                            <Area
                              type="monotone"
                              dataKey="LoiNhuan"
                              stroke="#10b981"
                              fill="url(#gPos2)"
                              strokeWidth={2}
                              dot={(props) => {
                                const { cx, cy, payload } = props;
                                return <circle key={payload.name} cx={cx} cy={cy} r={4} fill={payload.LoiNhuan >= 0 ? "#10b981" : "#f87171"} stroke="white" strokeWidth={1.5} />;
                              }}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>

                      {/* ── Chart: Doanh thu AEP từng tháng chi tiết ── */}
                      {revenueData && (() => {
                        const aepEntries = Object.entries(revenueData)
                          .sort(([a], [b]) => a.localeCompare(b));

                        if (aepEntries.length === 0) return null;

                        const aepChartData = aepEntries.map(([ym, amount], i, arr) => {
                          const prev = i > 0 ? arr[i - 1][1] : null;
                          const growth = prev !== null && prev > 0 ? Math.round((amount - prev) / prev * 100) : null;
                          return {
                            name: ym.slice(5) + "/" + ym.slice(2, 4),
                            ym,
                            amount: Math.round(amount / 1e6 * 10) / 10,
                            growth,
                          };
                        });

                        const total = aepChartData.reduce((s, d) => s + d.amount, 0);
                        const avg   = aepChartData.length > 0 ? Math.round(total / aepChartData.length * 10) / 10 : 0;
                        const maxMonth = aepChartData.reduce((best, d) => d.amount > best.amount ? d : best, aepChartData[0]);
                        const lastMonth = aepChartData[aepChartData.length - 1];
                        const prevMonth = aepChartData.length >= 2 ? aepChartData[aepChartData.length - 2] : null;

                        return (
                          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                            {/* Header */}
                            <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2 border-b border-gray-50">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-emerald-50 shrink-0">
                                  <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg>
                                </span>
                                <div>
                                  <p className="text-[11px] font-bold text-gray-700 leading-tight">Doanh thu theo tháng</p>
                                  <p className="text-[10px] text-gray-400">Anh Em Phim · triệu đồng</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 shrink-0">{aepChartData.length} tháng</span>
                            </div>

                            {/* KPI row */}
                            <div className="grid grid-cols-3 divide-x divide-gray-50 border-b border-gray-50">
                              <div className="px-3 py-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Mới nhất</p>
                                <p className="text-base font-black text-emerald-600 leading-none">{lastMonth.amount.toFixed(1)}<span className="text-[10px] font-bold ml-0.5">tr</span></p>
                                {prevMonth && lastMonth.growth !== null ? (
                                  <p className={`text-[9px] font-bold mt-1 ${lastMonth.growth >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                    {lastMonth.growth >= 0 ? "↑" : "↓"}{Math.abs(lastMonth.growth)}%
                                  </p>
                                ) : <p className="text-[9px] text-gray-300 mt-1">{lastMonth.name}</p>}
                              </div>
                              <div className="px-3 py-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Trung bình</p>
                                <p className="text-base font-black text-indigo-500 leading-none">{avg.toFixed(1)}<span className="text-[10px] font-bold ml-0.5">tr</span></p>
                                <p className="text-[9px] text-gray-300 mt-1">/ tháng</p>
                              </div>
                              <div className="px-3 py-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Cao nhất</p>
                                <p className="text-base font-black text-amber-500 leading-none">{maxMonth.amount.toFixed(1)}<span className="text-[10px] font-bold ml-0.5">tr</span></p>
                                <p className="text-[9px] text-gray-400 mt-1">{maxMonth.name}</p>
                              </div>
                            </div>

                            {/* Chart */}
                            <div className="px-3 pt-3 pb-4">
                              <ResponsiveContainer width="100%" height={180}>
                                <ComposedChart data={aepChartData} margin={{ top: 8, right: 32, left: -16, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#d1d5db" }} axisLine={false} tickLine={false} />
                                  <YAxis tick={{ fontSize: 10, fill: "#d1d5db" }} tickFormatter={(v) => `${v}tr`} axisLine={false} tickLine={false} />
                                  <Tooltip
                                    content={({ active, payload }) => {
                                      if (!active || !payload?.length) return null;
                                      const d = payload[0]?.payload as { name: string; amount: number; growth: number | null };
                                      return (
                                        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-md">
                                          <p className="font-bold text-gray-700 mb-1">{d.name}</p>
                                          <p className="text-emerald-600 font-semibold">Doanh thu: {d.amount.toFixed(1)}tr</p>
                                          {d.growth !== null && (
                                            <p className={`mt-0.5 font-semibold ${d.growth >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                                              {d.growth >= 0 ? "↑" : "↓"} {Math.abs(d.growth)}% vs tháng trước
                                            </p>
                                          )}
                                        </div>
                                      );
                                    }}
                                    cursor={{ fill: "#f9fafb" }}
                                  />
                                  <ReferenceLine y={avg} stroke="#6366f1" strokeDasharray="5 3" strokeWidth={1.2}
                                    label={{ value: `TB ${avg.toFixed(0)}tr`, position: "right", fill: "#6366f1", fontSize: 9 }} />
                                  <Bar dataKey="amount" name="Doanh thu AEP" radius={[5, 5, 0, 0]}>
                                    {aepChartData.map((entry, index) => (
                                      <Cell key={`cell-month-${index}`} fill={entry.amount >= avg ? "#10b981" : "#6ee7b7"} />
                                    ))}
                                  </Bar>
                                </ComposedChart>
                              </ResponsiveContainer>
                              <p className="text-[9px] text-gray-300 text-right mt-1">Cột đậm = trên trung bình · đường tím = TB tháng</p>
                            </div>
                          </div>
                        );
                      })()}

                      {(() => {
                        const allDailyEntries = Object.entries(dailyAepRevenueData ?? {})
                          .sort(([a], [b]) => a.localeCompare(b));
                        const amountByDate = new Map(allDailyEntries);

                        const dailyEntries = allDailyEntries.slice(-30);
                        const rangeStart = dailyEntries[0]?.[0] ?? null;
                        const rangeEnd = dailyEntries[dailyEntries.length - 1]?.[0] ?? null;

                        if (dailyEntries.length === 0) {
                          return (
                            <div className="bg-white border border-gray-200 rounded-2xl p-4">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                                <svg className="inline w-[1em] h-[1em] align-[-0.15em] mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14v-3M12 14V7M17 14v-5"/></svg>
                                Doanh thu AEP theo ngày (30 ngày gần nhất)
                              </p>
                              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                                <p className="text-sm font-semibold text-gray-600">Chưa có dữ liệu doanh thu ngày từ Casso</p>
                                <p className="text-xs text-gray-400 mt-1">Sau khi webhook nhận giao dịch khớp 65k / 165k / 270k / 420k, chart ngày sẽ hiện ở đây.</p>
                                {dailyAepRevenueLoading && (
                                  <p className="text-[10px] text-gray-400 mt-3">Đang cập nhật dữ liệu doanh thu ngày từ Casso...</p>
                                )}
                              </div>
                            </div>
                          );
                        }

                        const dailyChartData = dailyEntries.map(([date, amount], index, arr) => {
                          const prevAmount = index > 0 ? arr[index - 1][1] : null;
                          const prevWeekDate = shiftIsoDate(date, -7);
                          const prevWeekAmountRaw = amountByDate.get(prevWeekDate);
                          const prevWeekAmount = typeof prevWeekAmountRaw === "number" ? prevWeekAmountRaw : null;
                          const growth = prevAmount !== null && prevAmount > 0
                            ? Math.round((amount - prevAmount) / prevAmount * 100)
                            : null;
                          const weekdayDelta = prevWeekAmount !== null
                            ? Math.round(((amount - prevWeekAmount) / 1e6) * 10) / 10
                            : null;
                          const weekdayDeltaPct = prevWeekAmount !== null && prevWeekAmount > 0
                            ? Math.round(((amount - prevWeekAmount) / prevWeekAmount) * 100)
                            : null;
                          const weekdayLabel = getWeekdayLabel(date);

                          return {
                            date,
                            day: date.slice(8, 10),
                            dayLabel: `${date.slice(8, 10)}/${date.slice(5, 7)}`,
                            amount: Math.round((amount / 1e6) * 10) / 10,
                            growth,
                            weekdayLabel,
                            prevWeekDate,
                            prevWeekAmount: prevWeekAmount !== null ? Math.round((prevWeekAmount / 1e6) * 10) / 10 : null,
                            weekdayDelta,
                            weekdayDeltaPct,
                          };
                        });

                        const total = dailyChartData.reduce((sum, item) => sum + item.amount, 0);
                        const average = dailyChartData.length > 0 ? Math.round((total / dailyChartData.length) * 10) / 10 : 0;
                        const bestDay = dailyChartData.reduce((best, item) => item.amount > best.amount ? item : best, dailyChartData[0]);
                        const latestDay = dailyChartData[dailyChartData.length - 1];
                        const comparisonDay = latestDay.date === currentISODate() && dailyChartData.length > 1
                          ? dailyChartData[dailyChartData.length - 2]
                          : latestDay;
                        const isUsingCompletedPreviousDay = comparisonDay.date !== latestDay.date;
                        const latestWeekdayComparisonText = comparisonDay.prevWeekAmount !== null
                          ? `${comparisonDay.weekdayLabel} ${isUsingCompletedPreviousDay ? `(${formatFullDate(comparisonDay.date)}) ` : ""}${comparisonDay.weekdayDelta === null ? "đi ngang" : comparisonDay.weekdayDelta > 0 ? `tăng ${Math.abs(comparisonDay.weekdayDelta).toFixed(1)}tr` : comparisonDay.weekdayDelta < 0 ? `giảm ${Math.abs(comparisonDay.weekdayDelta).toFixed(1)}tr` : "đi ngang"}${comparisonDay.weekdayDeltaPct !== null ? ` (${comparisonDay.weekdayDeltaPct > 0 ? "+" : ""}${comparisonDay.weekdayDeltaPct}%)` : ""} so với ${comparisonDay.weekdayLabel.toLowerCase()} tuần trước${comparisonDay.prevWeekDate ? ` (${formatFullDate(comparisonDay.prevWeekDate)})` : ""}`
                          : `Chưa có dữ liệu ${comparisonDay.weekdayLabel.toLowerCase()} tuần trước để so sánh${isUsingCompletedPreviousDay ? ` cho ngày ${formatFullDate(comparisonDay.date)}` : ""}.`;

                        return (
                          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                            {/* Header */}
                            <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-2 border-b border-gray-50">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="flex items-center justify-center w-7 h-7 rounded-xl bg-indigo-50 shrink-0">
                                  <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14v-3M12 14V7M17 14v-5"/></svg>
                                </span>
                                <div>
                                  <p className="text-[11px] font-bold text-gray-700 leading-tight">Doanh thu theo ngày</p>
                                  <p className="text-[10px] text-gray-400">30 ngày gần nhất · triệu đồng{rangeStart && rangeEnd ? ` · ${formatFullDate(rangeStart)} → ${formatFullDate(rangeEnd)}` : ""}</p>
                                </div>
                              </div>
                              <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100 shrink-0">{dailyChartData.length} ngày</span>
                            </div>

                            {/* KPI row */}
                            <div className="grid grid-cols-3 divide-x divide-gray-50 border-b border-gray-50">
                              <div className="px-3 py-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Mới nhất</p>
                                <p className="text-base font-black text-indigo-600 leading-none">{latestDay.amount.toFixed(1)}<span className="text-[10px] font-bold ml-0.5">tr</span></p>
                                {comparisonDay.weekdayDelta !== null ? (
                                  <p className={`text-[9px] font-bold mt-1 ${comparisonDay.weekdayDelta > 0 ? "text-emerald-500" : comparisonDay.weekdayDelta < 0 ? "text-rose-500" : "text-amber-500"}`}>
                                    {comparisonDay.weekdayDelta > 0 ? "↑" : comparisonDay.weekdayDelta < 0 ? "↓" : "→"}{Math.abs(comparisonDay.weekdayDelta).toFixed(1)}tr
                                  </p>
                                ) : <p className="text-[9px] text-gray-300 mt-1">Ngày {Number(latestDay.day)}</p>}
                              </div>
                              <div className="px-3 py-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Trung bình</p>
                                <p className="text-base font-black text-amber-500 leading-none">{average.toFixed(1)}<span className="text-[10px] font-bold ml-0.5">tr</span></p>
                                <p className="text-[9px] text-gray-300 mt-1">/ ngày</p>
                              </div>
                              <div className="px-3 py-2.5 text-center">
                                <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 mb-1">Cao nhất</p>
                                <p className="text-base font-black text-amber-500 leading-none">{bestDay.amount.toFixed(1)}<span className="text-[10px] font-bold ml-0.5">tr</span></p>
                                <p className="text-[9px] text-gray-400 mt-1">Ngày {Number(bestDay.day)}</p>
                              </div>
                            </div>

                            {/* Comparison banner */}
                            <div className={`mx-4 mt-3 rounded-xl border px-3 py-2 text-[11px] ${comparisonDay.weekdayDelta === null ? "border-gray-100 bg-gray-50 text-gray-400" : comparisonDay.weekdayDelta > 0 ? "border-emerald-100 bg-emerald-50 text-emerald-700" : comparisonDay.weekdayDelta < 0 ? "border-rose-100 bg-rose-50 text-rose-700" : "border-amber-100 bg-amber-50 text-amber-700"}`}>
                              {latestWeekdayComparisonText}
                            </div>

                            {/* Chart */}
                            <div className="px-3 pt-3 pb-4">
                              <ResponsiveContainer width="100%" height={180}>
                                <ComposedChart data={dailyChartData} margin={{ top: 8, right: 32, left: -16, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" stroke="#f5f5f5" vertical={false} />
                                  <XAxis dataKey="dayLabel" tick={{ fontSize: 10, fill: "#d1d5db" }} axisLine={false} tickLine={false} minTickGap={18} />
                                  <YAxis tick={{ fontSize: 10, fill: "#d1d5db" }} tickFormatter={(value) => `${value}tr`} axisLine={false} tickLine={false} />
                                  <Tooltip
                                    content={({ active, payload }) => {
                                      if (!active || !payload || payload.length === 0) return null;
                                      const point = payload[0]?.payload as {
                                        day: string; date: string; amount: number; weekdayLabel: string;
                                        prevWeekDate: string; prevWeekAmount: number | null;
                                        weekdayDelta: number | null; weekdayDeltaPct: number | null;
                                      };
                                      if (!point) return null;
                                      return (
                                        <div className="rounded-xl border border-gray-100 bg-white px-3 py-2 text-xs shadow-md">
                                          <p className="font-bold text-gray-700 mb-1">{formatFullDate(point.date)}</p>
                                          <p className="text-indigo-600 font-semibold">Doanh thu: {point.amount.toFixed(1)}tr</p>
                                          {point.weekdayDelta !== null ? (
                                            <p className={`mt-0.5 font-semibold ${point.weekdayDelta > 0 ? "text-emerald-600" : point.weekdayDelta < 0 ? "text-rose-500" : "text-amber-600"}`}>
                                              {point.weekdayLabel} {point.weekdayDelta > 0 ? "↑" : point.weekdayDelta < 0 ? "↓" : "→"} {Math.abs(point.weekdayDelta).toFixed(1)}tr{point.weekdayDeltaPct !== null ? ` (${point.weekdayDeltaPct > 0 ? "+" : ""}${point.weekdayDeltaPct}%)` : ""} vs tuần trước
                                            </p>
                                          ) : (
                                            <p className="mt-0.5 text-gray-400">Chưa có {point.weekdayLabel.toLowerCase()} tuần trước</p>
                                          )}
                                          {point.prevWeekAmount !== null && (
                                            <p className="mt-0.5 text-[10px] text-gray-400">Tuần trước ({formatFullDate(point.prevWeekDate)}): {point.prevWeekAmount.toFixed(1)}tr</p>
                                          )}
                                        </div>
                                      );
                                    }}
                                    cursor={{ fill: "#f9fafb" }}
                                  />
                                  <ReferenceLine y={average} stroke="#f59e0b" strokeDasharray="5 3" strokeWidth={1.2}
                                    label={{ value: `TB ${average.toFixed(1)}tr`, position: "right", fill: "#f59e0b", fontSize: 9 }} />
                                  <Bar dataKey="amount" name="Doanh thu ngày" radius={[5, 5, 0, 0]}>
                                    {dailyChartData.map((entry, index) => (
                                      <Cell key={`cell-day-${index}`} fill={entry.amount >= average ? "#6366f1" : "#a5b4fc"} />
                                    ))}
                                  </Bar>
                                </ComposedChart>
                              </ResponsiveContainer>
                              {dailyAepRevenueLoading && (
                                <p className="text-[9px] text-gray-300 mt-1">Đang cập nhật từ Casso...</p>
                              )}
                              <p className="text-[9px] text-gray-300 text-right mt-1">Cột đậm = trên trung bình · đường vàng = TB ngày</p>
                            </div>
                          </div>
                        );
                      })()}

                      {/* ── Widget: So sánh cùng thứ cùng giờ ── */}
                      {(() => {
                        if (intradayAepError) {
                          return (
                            <div className="bg-white border border-gray-200 rounded-2xl p-4">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">So sánh cùng thứ cùng giờ</p>
                              <p className="text-xs text-orange-500">{intradayAepError}</p>
                              <button onClick={fetchIntradayAepRevenue} className="mt-1 text-xs text-blue-600 underline">Thử lại</button>
                            </div>
                          );
                        }
                        if (!intradayAepData && intradayAepLoading) {
                          return (
                            <div className="bg-white border border-gray-200 rounded-2xl p-4 animate-pulse">
                              <div className="h-3 bg-gray-100 rounded w-40 mb-3" />
                              <div className="h-16 bg-gray-50 rounded-xl" />
                            </div>
                          );
                        }
                        if (!intradayAepData) return null;

                        const { todayDate, lastWeekDate, cutoffTime, weekdayName, today, lastWeek } = intradayAepData;
                        const todayM  = Math.round(today / 1e6 * 10) / 10;
                        const lastWeekM = Math.round(lastWeek / 1e6 * 10) / 10;
                        const delta = Math.round((todayM - lastWeekM) * 10) / 10;
                        const deltaPct = lastWeekM > 0 ? Math.round((todayM - lastWeekM) / lastWeekM * 100) : null;
                        const isUp = delta > 0;
                        const isDown = delta < 0;
                        const formatDate = (d: string) => {
                          const [, m, day] = d.split("-");
                          return `${Number(day)}/${Number(m)}`;
                        };

                        const noData = today === 0 && lastWeek === 0;

                        return (
                          <div className={`rounded-2xl border p-4 ${noData ? "bg-gray-50 border-gray-200" : isUp ? "bg-emerald-50 border-emerald-200" : isDown ? "bg-rose-50 border-rose-200" : "bg-amber-50 border-amber-200"}`}>
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                              <p className={`text-xs font-semibold uppercase tracking-wide ${noData ? "text-gray-400" : isUp ? "text-emerald-600" : isDown ? "text-rose-600" : "text-amber-600"}`}>
                                <svg className="inline w-[1em] h-[1em] align-[-0.15em] mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                                </svg>
                                {weekdayName} · đến {cutoffTime}
                              </p>
                              <button onClick={fetchIntradayAepRevenue} disabled={intradayAepLoading}
                                className="text-[10px] text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40 flex items-center gap-1">
                                <svg className={`w-3 h-3 ${intradayAepLoading ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M21 2v6h-6"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M3 22v-6h6"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
                                </svg>
                                {intradayAepLoading ? "Đang tải..." : "Làm mới"}
                              </button>
                            </div>

                            {noData ? (
                              <div className="text-center py-3">
                                <p className="text-sm text-gray-400 font-medium">Chưa có giao dịch AEP hôm nay</p>
                                <p className="text-[11px] text-gray-300 mt-1">Giao dịch khớp 65k / 165k / 270k / 420k sẽ hiện ở đây</p>
                              </div>
                            ) : (
                              <>
                                {/* Hai cột so sánh */}
                                <div className="grid grid-cols-2 gap-3 mb-3">
                                  <div className={`rounded-xl px-3 py-2.5 ${isUp ? "bg-emerald-100" : isDown ? "bg-rose-100" : "bg-amber-100"}`}>
                                    <p className="text-[10px] font-semibold text-gray-500 mb-1">{weekdayName} này ({formatDate(todayDate)})</p>
                                    <p className={`text-xl font-black ${isUp ? "text-emerald-700" : isDown ? "text-rose-700" : "text-amber-700"}`}>{todayM.toFixed(1)}tr</p>
                                    <p className="text-[10px] text-gray-400 mt-0.5">đến {cutoffTime}</p>
                                  </div>
                                  <div className="rounded-xl bg-white/70 px-3 py-2.5 border border-white">
                                    <p className="text-[10px] font-semibold text-gray-400 mb-1">{weekdayName} trước ({formatDate(lastWeekDate)})</p>
                                    <p className="text-xl font-black text-gray-500">{lastWeekM > 0 ? `${lastWeekM.toFixed(1)}tr` : "—"}</p>
                                    <p className="text-[10px] text-gray-300 mt-0.5">cùng mốc {cutoffTime}</p>
                                  </div>
                                </div>

                                {/* Banner kết quả */}
                                {lastWeekM > 0 ? (
                                  <div className={`rounded-xl px-3 py-2 flex items-center justify-between ${isUp ? "bg-emerald-100" : isDown ? "bg-rose-100" : "bg-amber-100"}`}>
                                    <span className={`text-sm font-bold ${isUp ? "text-emerald-700" : isDown ? "text-rose-700" : "text-amber-700"}`}>
                                      {isUp ? "↑ Tăng " : isDown ? "↓ Giảm " : "→ Đi ngang "}
                                      {Math.abs(delta).toFixed(1)}tr
                                    </span>
                                    {deltaPct !== null && (
                                      <span className={`text-sm font-black ${isUp ? "text-emerald-600" : isDown ? "text-rose-600" : "text-amber-600"}`}>
                                        {isUp ? "+" : isDown ? "-" : ""}{Math.abs(deltaPct)}%
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <p className="text-[11px] text-gray-400 text-center">Chưa có dữ liệu {weekdayName.toLowerCase()} tuần trước để so sánh</p>
                                )}

                                <p className="text-[10px] text-gray-300 mt-2 text-right">Dựa theo thời điểm Casso gọi webhook · received_at</p>
                              </>
                            )}
                          </div>
                        );
                      })()}

                      {/* ── Kế hoạch kênh theo nhóm ── */}
                      <div className="bg-white border border-gray-200 rounded-2xl p-4 space-y-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                            <svg className="inline w-[1em] h-[1em] align-[-0.15em] mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                            Kế hoạch kênh
                          </p>
                          <button onClick={() => { setShowAddGroup(v => !v); setNewGroupName(""); }}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                            <PlusCircle className="w-3.5 h-3.5" /> Thêm nhóm
                          </button>
                        </div>

                        {/* Form thêm nhóm */}
                        {showAddGroup && (
                          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                            <p className="text-xs font-semibold text-gray-600">Tên nhóm / dự án</p>
                            <input
                              autoFocus
                              type="text"
                              placeholder="vd: Nhóm Drama, Nhóm Sức Khoẻ, Hiếu Ráng Làm Phim..."
                              value={newGroupName}
                              onChange={e => setNewGroupName(e.target.value)}
                              onKeyDown={async e => {
                                if (e.key === "Enter" && newGroupName.trim()) {
                                  const g: SocialGroup = { id: Date.now().toString(), name: newGroupName.trim(), channels: [] };
                                  const next = [...socialGroups, g];
                                  setSocialGroups(next); setShowAddGroup(false); setNewGroupName("");
                                  await saveSocialGroups(next);
                                }
                              }}
                              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                            />
                            <div className="flex gap-2">
                              <button
                                disabled={!newGroupName.trim()}
                                onClick={async () => {
                                  const g: SocialGroup = { id: Date.now().toString(), name: newGroupName.trim(), channels: [] };
                                  const next = [...socialGroups, g];
                                  setSocialGroups(next); setShowAddGroup(false); setNewGroupName("");
                                  await saveSocialGroups(next);
                                }}
                                className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">Tạo nhóm</button>
                              <button onClick={() => { setShowAddGroup(false); setNewGroupName(""); }}
                                className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-semibold rounded-lg transition-colors">Huỷ</button>
                            </div>
                          </div>
                        )}

                        {/* Danh sách nhóm */}
                        {socialGroups.length === 0 && !showAddGroup && (
                          <p className="text-xs text-gray-400 text-center py-4">Chưa có nhóm kênh nào. Bấm <span className="font-semibold text-blue-500">+ Thêm nhóm</span> để lên kế hoạch.</p>
                        )}

                        {socialGroups.map((group) => (
                          <div key={group.id} className="border border-gray-100 rounded-xl overflow-hidden">
                            {/* Group header */}
                            <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                              {editingGroupId === group.id ? (
                                <input
                                  autoFocus
                                  value={editGroupName}
                                  onChange={e => setEditGroupName(e.target.value)}
                                  onKeyDown={async e => {
                                    if (e.key === "Enter" && editGroupName.trim()) {
                                      const next = socialGroups.map(g => g.id === group.id ? { ...g, name: editGroupName.trim() } : g);
                                      setSocialGroups(next); setEditingGroupId(null);
                                      await saveSocialGroups(next);
                                    } else if (e.key === "Escape") setEditingGroupId(null);
                                  }}
                                  onBlur={async () => {
                                    if (editGroupName.trim()) {
                                      const next = socialGroups.map(g => g.id === group.id ? { ...g, name: editGroupName.trim() } : g);
                                      setSocialGroups(next); await saveSocialGroups(next);
                                    }
                                    setEditingGroupId(null);
                                  }}
                                  className="flex-1 text-sm font-semibold border border-blue-300 rounded-lg px-2 py-0.5 outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                />
                              ) : (
                                <button
                                  onClick={() => { setEditingGroupId(group.id); setEditGroupName(group.name); }}
                                  className="text-sm font-semibold text-gray-700 hover:text-blue-600 transition-colors flex items-center gap-1">
                                  {group.name}
                                  <Pencil className="w-3 h-3 opacity-40" />
                                </button>
                              )}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => { setAddChannelGroupId(group.id); setAddChannelStep("pick"); setNewChannelPlatform(""); setNewChannelLabel(""); setNewChannelUrl(""); }}
                                  className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors px-2 py-0.5 rounded-lg hover:bg-blue-50">
                                  <PlusCircle className="w-3 h-3" /> Kênh
                                </button>
                                <button
                                  onClick={async () => {
                                    if (group.channels.length > 0 && !confirm(`Xoá nhóm "${group.name}" và ${group.channels.length} kênh?`)) return;
                                    const next = socialGroups.filter(g => g.id !== group.id);
                                    setSocialGroups(next); await saveSocialGroups(next);
                                  }}
                                  className="p-0.5 text-gray-300 hover:text-red-400 transition-colors rounded">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            {/* Add channel form — step 1: pick platform */}
                            {addChannelGroupId === group.id && addChannelStep === "pick" && (
                              <div className="p-3 bg-blue-50 border-b border-blue-100">
                                <p className="text-xs font-semibold text-blue-700 mb-2">Chọn nền tảng:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {PLATFORM_LIST.map(p => (
                                    <button key={p.id}
                                      onClick={() => { setNewChannelPlatform(p.id); setAddChannelStep("detail"); setNewChannelLabel(""); setNewChannelUrl(""); }}
                                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold ${p.bgColor} ${p.textColor} opacity-90 hover:opacity-100 transition-opacity`}>
                                      {p.icon}{p.label}
                                    </button>
                                  ))}
                                  <button onClick={() => setAddChannelGroupId(null)}
                                    className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-200 text-gray-600 hover:bg-gray-300 transition-colors">Huỷ</button>
                                </div>
                              </div>
                            )}

                            {/* Add channel form — step 2: detail */}
                            {addChannelGroupId === group.id && addChannelStep === "detail" && (() => {
                              const pm = getPlatformMeta(newChannelPlatform);
                              return (
                                <div className="p-3 bg-blue-50 border-b border-blue-100 space-y-2">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${pm.bgColor} ${pm.textColor}`}>{pm.icon}{pm.label}</span>
                                    <p className="text-xs text-blue-600 font-medium">Điền thông tin kênh</p>
                                  </div>
                                  <input type="text"
                                    placeholder={`Tên kênh (vd: ${pm.label} Drama) — để trống dùng tên mặc định`}
                                    value={newChannelLabel}
                                    onChange={e => setNewChannelLabel(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                  />
                                  <input type="url"
                                    placeholder="URL kênh (để trống nếu chưa tạo)"
                                    value={newChannelUrl}
                                    onChange={e => setNewChannelUrl(e.target.value)}
                                    className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      onClick={async () => {
                                        const ch: SocialChannel = {
                                          id: Date.now().toString(),
                                          platform: newChannelPlatform,
                                          label: newChannelLabel.trim() || pm.label,
                                          url: newChannelUrl.trim(),
                                        };
                                        const next = socialGroups.map(g => g.id === group.id ? { ...g, channels: [...g.channels, ch] } : g);
                                        setSocialGroups(next);
                                        setAddChannelGroupId(null);
                                        await saveSocialGroups(next);
                                      }}
                                      className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">Thêm kênh</button>
                                    <button onClick={() => setAddChannelStep("pick")}
                                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-semibold rounded-lg transition-colors">← Quay lại</button>
                                    <button onClick={() => setAddChannelGroupId(null)}
                                      className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-semibold rounded-lg transition-colors">Huỷ</button>
                                  </div>
                                </div>
                              );
                            })()}

                            {/* Channel list */}
                            <div className="p-3">
                              {group.channels.length === 0 ? (
                                <p className="text-xs text-gray-400 text-center py-2">Chưa có kênh nào — bấm <span className="text-blue-500 font-semibold">+ Kênh</span> để thêm.</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {group.channels.map(ch => {
                                    const pm = getPlatformMeta(ch.platform);
                                    const hasUrl = !!ch.url;
                                    const isEditing = editChannelId === ch.id;
                                    return (
                                      <div key={ch.id} className="group/ch relative">
                                        {isEditing ? (
                                          <div className="absolute z-20 bottom-full left-0 mb-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg p-3 space-y-2">
                                            <p className="text-xs font-semibold text-gray-600">Chỉnh sửa kênh</p>
                                            <input type="text"
                                              placeholder="Tên kênh"
                                              value={editChannelLabel}
                                              onChange={e => setEditChannelLabel(e.target.value)}
                                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
                                            />
                                            <input type="url"
                                              placeholder="URL (để trống nếu chưa tạo)"
                                              value={editChannelUrl}
                                              onChange={e => setEditChannelUrl(e.target.value)}
                                              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300"
                                            />
                                            <div className="flex gap-1.5">
                                              <button
                                                onClick={async () => {
                                                  const next = socialGroups.map(g => ({
                                                    ...g,
                                                    channels: g.channels.map(c => c.id === ch.id
                                                      ? { ...c, label: editChannelLabel.trim() || pm.label, url: editChannelUrl.trim() }
                                                      : c),
                                                  }));
                                                  setSocialGroups(next); setEditChannelId(null);
                                                  await saveSocialGroups(next);
                                                }}
                                                className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">Lưu</button>
                                              <button onClick={() => setEditChannelId(null)}
                                                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-xs text-gray-600 font-semibold rounded-lg">Huỷ</button>
                                              <button
                                                onClick={async () => {
                                                  const next = socialGroups.map(g => ({ ...g, channels: g.channels.filter(c => c.id !== ch.id) }));
                                                  setSocialGroups(next); setEditChannelId(null);
                                                  await saveSocialGroups(next);
                                                }}
                                                className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-600 text-xs font-semibold rounded-lg">Xoá</button>
                                            </div>
                                          </div>
                                        ) : null}
                                        {hasUrl ? (
                                          <div className="flex items-center gap-0 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                                            <a href={ch.url} target="_blank" rel="noopener noreferrer"
                                              className={`flex items-center gap-1.5 px-2.5 py-1.5 ${pm.bgColor} ${pm.textColor} text-xs font-semibold hover:opacity-90 transition-opacity`}>
                                              {pm.icon}<span>{ch.label}</span>
                                            </a>
                                            <button onClick={() => { setEditChannelId(ch.id); setEditChannelUrl(ch.url); setEditChannelLabel(ch.label); }}
                                              className="px-1.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-400 transition-colors">
                                              <Pencil className="w-3 h-3" />
                                            </button>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => { setEditChannelId(ch.id); setEditChannelUrl(""); setEditChannelLabel(ch.label); }}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-semibold text-gray-400 hover:border-blue-300 hover:text-blue-500 transition-colors">
                                            {pm.icon}<span>{ch.label}</span><span className="text-[10px] text-gray-300">• chưa tạo</span>
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* ── Chia lợi nhuận ── */}
                      {(() => {
                        const totalAllocated = profitShares.reduce((s, p) => s + p.percent, 0);
                        const remaining = 100 - totalAllocated;
                        return (
                          <div className="bg-white border border-gray-200 rounded-2xl p-4">
                            <div className="flex items-center justify-between mb-3">
                              <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M1 9h5M18 9h5M1 15h5M18 15h5"/></svg> Chia lợi nhuận</p>
                                {profitShares.length > 0 && totalAllocated !== 100 && (
                                  <p className="text-[10px] text-orange-500 mt-0.5"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Tổng = {Math.round(totalAllocated * 10) / 10}% (chưa đủ 100%)</p>
                                )}
                                {profitShares.length > 0 && totalAllocated === 100 && (
                                  <p className="text-[10px] text-emerald-500 mt-0.5"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Tổng đúng 100%</p>
                                )}
                              </div>
                              <button
                                onClick={() => { setShowProfitAdd(v => !v); setProfitAddName(""); setProfitAddPercent(""); setEditingProfitId(null); }}
                                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold transition-colors">
                                <PlusCircle className="w-3.5 h-3.5" /> Thêm người
                              </button>
                            </div>

                            {/* Form thêm mới */}
                            {showProfitAdd && (
                              <div className="mb-3 p-3 bg-gray-50 rounded-xl border border-gray-100 space-y-2">
                                <p className="text-xs font-semibold text-gray-600"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Thêm thành viên</p>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    placeholder="Tên (ví dụ: Hiếu)"
                                    value={profitAddName}
                                    onChange={e => setProfitAddName(e.target.value)}
                                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                    autoFocus
                                  />
                                  <input
                                    type="number"
                                    placeholder="% (ví dụ: 30)"
                                    value={profitAddPercent}
                                    onChange={e => setProfitAddPercent(e.target.value)}
                                    min={0} max={100} step={0.01}
                                    className="w-24 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    disabled={!profitAddName.trim() || !profitAddPercent}
                                    onClick={async () => {
                                      const pct = parseFloat(profitAddPercent);
                                      if (!profitAddName.trim() || isNaN(pct)) return;
                                      const newShares = [...profitShares, { id: Date.now().toString(), name: profitAddName.trim(), percent: pct }];
                                      setProfitShares(newShares);
                                      setShowProfitAdd(false);
                                      await saveProfitShares(newShares);
                                    }}
                                    className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-colors">
                                    Lưu
                                  </button>
                                  <button
                                    onClick={() => { setShowProfitAdd(false); setProfitAddName(""); setProfitAddPercent(""); }}
                                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-semibold rounded-lg transition-colors">
                                    Huỷ
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Danh sách */}
                            {profitShares.length === 0 ? (
                              <p className="text-xs text-gray-400 text-center py-4">Chưa có ai. Bấm <span className="font-semibold text-blue-500">+ Thêm người</span> để bắt đầu.</p>
                            ) : (
                              <div className="space-y-1">
                                {profitShares.map(ps => {
                                  const amount = totalProfit * ps.percent / 100;
                                  const isEditing = editingProfitId === ps.id;
                                  return (
                                    <div key={ps.id} className="rounded-xl border border-gray-100 overflow-hidden">
                                      {isEditing ? (
                                        <div className="p-2.5 bg-blue-50 space-y-2">
                                          <div className="flex gap-2">
                                            <input
                                              type="text"
                                              value={editProfitName}
                                              onChange={e => setEditProfitName(e.target.value)}
                                              className="flex-1 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                              autoFocus
                                            />
                                            <input
                                              type="number"
                                              value={editProfitPercent}
                                              onChange={e => setEditProfitPercent(e.target.value)}
                                              min={0} max={100} step={0.01}
                                              className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-300 bg-white"
                                            />
                                          </div>
                                          <div className="flex gap-2">
                                            <button
                                              onClick={async () => {
                                                const pct = parseFloat(editProfitPercent);
                                                if (!editProfitName.trim() || isNaN(pct)) return;
                                                const newShares = profitShares.map(p => p.id === ps.id ? { ...p, name: editProfitName.trim(), percent: pct } : p);
                                                setProfitShares(newShares);
                                                setEditingProfitId(null);
                                                await saveProfitShares(newShares);
                                              }}
                                              className="flex-1 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">
                                              Lưu
                                            </button>
                                            <button
                                              onClick={() => setEditingProfitId(null)}
                                              className="px-3 py-1 bg-gray-200 hover:bg-gray-300 text-gray-600 text-xs font-semibold rounded-lg">
                                              Huỷ
                                            </button>
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors">
                                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-400 to-blue-500 flex items-center justify-center shrink-0">
                                            <span className="text-white text-xs font-bold">{ps.name.slice(0, 2).toUpperCase()}</span>
                                          </div>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-gray-800 truncate">{ps.name}</p>
                                            <p className="text-xs text-gray-400">{ps.percent}% lợi nhuận</p>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <p className={`text-sm font-black ${amount >= 0 ? "text-emerald-600" : "text-red-500"}`}>{formatCurrency(Math.round(amount))}</p>
                                            <p className="text-[10px] text-gray-400">{totalProfit >= 0 ? "lãi" : "lỗ chia"}</p>
                                          </div>
                                          <div className="flex gap-1 shrink-0 ml-1">
                                            <button
                                              onClick={() => { setEditingProfitId(ps.id); setEditProfitName(ps.name); setEditProfitPercent(String(ps.percent)); setShowProfitAdd(false); }}
                                              className="p-1.5 rounded-lg hover:bg-blue-100 text-gray-400 hover:text-blue-600 transition-colors">
                                              <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={async () => {
                                                const newShares = profitShares.filter(p => p.id !== ps.id);
                                                setProfitShares(newShares);
                                                await saveProfitShares(newShares);
                                              }}
                                              className="p-1.5 rounded-lg hover:bg-red-100 text-gray-400 hover:text-red-500 transition-colors">
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                {/* Dòng tổng */}
                                <div className="mt-2 pt-2 border-t border-dashed border-gray-200 flex items-center justify-between px-1">
                                  <p className="text-xs text-gray-500">
                                    Tổng đã phân bổ: <span className={`font-bold ${totalAllocated === 100 ? "text-emerald-600" : "text-orange-500"}`}>{Math.round(totalAllocated * 10) / 10}%</span>
                                    {remaining > 0.001 && <span className="text-gray-400"> — còn <span className="font-semibold text-gray-600">{Math.round(remaining * 10) / 10}%</span> chưa chia</span>}
                                  </p>
                                  <p className="text-xs font-black text-gray-700">{formatCurrency(totalProfit)}</p>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                    </div>
                  );
                })()}

                {/* ── View: Chi tiết tháng ── */}
                {(thuChiData || revenueData) && !thuChiLoading && !revenueLoading && financeView === "month" && (
                  <>
                    {/* Chọn tháng */}
                    <div className="flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
                      <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-0.5">
                        {salaryMonths.map((ym) => (
                          <button key={ym} onClick={() => setDirectorMonth(ym)}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${directorMonth === ym ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                            {monthLabel(ym)}{ym === currentYM() ? " ●" : ""}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Cards P&L — 4 card */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {/* Doanh thu tổng */}
                      <div className="bg-green-50 border border-green-200 rounded-2xl p-3">
                        <p className="text-xs text-green-600 font-medium mb-1"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4.5"/></svg> Doanh thu</p>
                        <p className="font-black text-green-700 text-base leading-tight">{formatCurrency(tongThu)}</p>
                        {(anhEmPhimThu > 0 || thuChiThu > 0) && (
                          <div className="mt-1.5 space-y-0.5">
                            {anhEmPhimThu > 0 && <p className="text-[10px] text-green-500"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg> AEP: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(anhEmPhimThu)}</p>}
                            {thuMetubMonth > 0 && <p className="text-[10px] text-blue-500">Metub: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(thuMetubMonth)}</p>}
                            {thuYeah1Month > 0 && <p className="text-[10px] text-pink-500">Yeah1: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(thuYeah1Month)}</p>}
                            {thuMCVMonth > 0 && <p className="text-[10px] text-purple-500">MCV: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(thuMCVMonth)}</p>}
                            {thuKhacMonth > 0 && <p className="text-[10px] text-green-400">Khác: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(thuKhacMonth)}</p>}
                          </div>
                        )}
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                        <p className="text-xs text-red-500 font-medium mb-1"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z"/><path d="M8 10h8M8 14h5"/></svg> Chi phí khác</p>
                        <p className="font-black text-red-600 text-base leading-tight">{formatCurrency(thuChiChi)}</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
                        <p className="text-xs text-blue-600 font-medium mb-1"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/></svg> Lương nhân viên</p>
                        <p className="font-black text-blue-700 text-base leading-tight">{formatCurrency(grandTotalSalary)}</p>
                      </div>
                      <div className={`rounded-2xl p-3 border ${loiNhuan >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
                        <p className={`text-xs font-medium mb-1 ${loiNhuan >= 0 ? "text-emerald-600" : "text-orange-600"}`}>
                          {loiNhuan >= 0 ? <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> Lợi nhuận</> : <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/></svg> Lỗ</>}
                        </p>
                        <p className={`font-black text-base leading-tight ${loiNhuan >= 0 ? "text-emerald-700" : "text-orange-600"}`}>
                          {loiNhuan >= 0 ? "" : "–"}{formatCurrency(Math.abs(loiNhuan))}
                        </p>
                      </div>
                    </div>

                    {/* Dự báo thuế — chỉ mang tính chỉ báo */}
                    {(tongThu > 0 || tongChiTat > 0) && (
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 space-y-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"/><path d="M9 12h6M9 16h4"/></svg></span>
                          <p className="text-xs font-semibold text-amber-700">Dự báo thuế</p>
                          <span className="text-[10px] bg-amber-100 text-amber-500 px-2 py-0.5 rounded-full font-medium ml-auto">Chỉ báo — không tính vào chi phí</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className="text-[10px] text-amber-500 font-semibold mb-0.5"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> VAT (8%)</p>
                            <p className="text-sm font-black text-amber-700">{formatCurrency(tongThu * 0.08)}</p>
                            <p className="text-[10px] text-amber-400">8% × Tổng thu</p>
                          </div>
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className="text-[10px] text-amber-500 font-semibold mb-0.5"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20v-2a8 8 0 0 1 16 0v2"/></svg> TNCN (~3%)</p>
                            <p className="text-sm font-black text-amber-700">{formatCurrency(tongChiTat * 0.03)}</p>
                            <p className="text-[10px] text-amber-400">3% × Tổng chi</p>
                          </div>
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className="text-[10px] text-amber-500 font-semibold mb-0.5"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="18" height="20"/><path d="M9 22V12h6v10M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1"/></svg> TNDN (18%)</p>
                            <p className="text-sm font-black text-amber-700">{loiNhuan > 0 ? formatCurrency(loiNhuan * 0.18) : "—"}</p>
                            <p className="text-[10px] text-amber-400">18% × Lợi nhuận</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bảng giao dịch tháng */}
                    {(thuChiMonth?.length ?? 0) > 0 || anhEmPhimThu > 0 || grandTotalSalary > 0 ? (
                      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <p className="font-semibold text-sm text-gray-800"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"/><path d="M9 12h6M9 16h4"/></svg> Giao dịch {monthLabel(directorMonth)}</p>
                          <span className="text-xs text-gray-400">{(thuChiMonth?.length ?? 0) + (anhEmPhimThu > 0 ? 1 : 0) + (grandTotalSalary > 0 ? 1 : 0)} mục</span>
                        </div>
                        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                          {/* Doanh thu anhemphim.vn */}
                          {anhEmPhimThu > 0 && (
                            <div className="flex items-center justify-between px-4 py-2.5 gap-2 bg-green-50/30">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-green-700"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg> anhemphim.vn</p>
                                <p className="text-xs text-green-400">Doanh thu dịch vụ online — {monthLabel(directorMonth)}</p>
                              </div>
                              <span className="font-bold text-sm text-green-600 shrink-0">+{formatCurrency(anhEmPhimThu)}</span>
                            </div>
                          )}
                          {/* Giao dịch từ Thu Chi app */}
                          {thuChiMonth?.map((t) => (
                            <div key={t.id} className="flex items-center justify-between px-4 py-2.5 gap-2">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-800 truncate">{t.subject}</p>
                                <p className="text-xs text-gray-400">{t.date}{t.note ? ` · ${t.note}` : ""}</p>
                              </div>
                              <span className={`font-bold text-sm shrink-0 ${t.type === "Thu" ? "text-green-600" : "text-red-500"}`}>
                                {t.type === "Thu" ? "+" : "–"}{new Intl.NumberFormat("vi-VN").format(Number(t.amount))}{t.currency === "USD" ? "$" : "đ"}
                              </span>
                            </div>
                          ))}
                          {/* Lương */}
                          {grandTotalSalary > 0 && (
                            <div className="flex items-center justify-between px-4 py-2.5 gap-2 bg-blue-50/50">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-blue-700"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/></svg> Lương nhân viên ({salaryRows.length} người)</p>
                                <p className="text-xs text-blue-400">Job Bình An — đã duyệt</p>
                              </div>
                              <span className="font-bold text-sm text-red-500 shrink-0">–{formatCurrency(grandTotalSalary)}</span>
                            </div>
                          )}
                        </div>
                        <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
                          <span className="text-sm font-semibold text-gray-700">Tổng chi</span>
                          <span className="font-black text-red-600">{formatCurrency(tongChiTat)}</span>
                        </div>
                      </div>
                    ) : (
                      <EmptyBlock text={`Không có dữ liệu nào trong ${monthLabel(directorMonth)}.`} />
                    )}
                  </>
                )}

                {/* ── View: Báo cáo tổng hợp ── */}
                {(thuChiData || revenueData) && !thuChiLoading && !revenueLoading && financeView === "report" && (
                  <>
                    {reportRows.length === 0 ? (
                      <EmptyBlock text="Chưa có dữ liệu tháng nào." />
                    ) : (
                      <>
                      {/* Bảng số liệu */}
                      <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                        <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                          <p className="font-semibold text-sm text-gray-800"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16V10M12 16V6M17 16v-5"/></svg> Tổng hợp {reportRows.length} tháng</p>
                          {revenueLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                                <th className="px-4 py-2 text-left">Tháng</th>
                                <th className="px-3 py-2 text-right"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg> AEP</th>
                                <th className="px-3 py-2 text-right text-blue-400">Metub</th>
                                <th className="px-3 py-2 text-right text-pink-400">Yeah1</th>
                                <th className="px-3 py-2 text-right text-purple-400">MCV</th>
                                <th className="px-3 py-2 text-right"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16V10M12 16V6M17 16v-5"/></svg> Thu khác</th>
                                <th className="px-3 py-2 text-right"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z"/><path d="M8 10h8M8 14h5"/></svg> Chi khác</th>
                                <th className="px-3 py-2 text-right"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/></svg> Lương</th>
                                <th className="px-3 py-2 text-right">Lợi nhuận</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {reportRows.map((r) => (
                                <tr key={r.ym}
                                  onClick={() => { setDirectorMonth(r.ym); setFinanceView("month"); }}
                                  className="hover:bg-gray-50 cursor-pointer transition-colors">
                                  <td className="px-4 py-2.5 font-semibold text-gray-700 whitespace-nowrap">
                                    {monthLabel(r.ym)}{r.ym === currentYM() ? " ●" : ""}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-green-600 font-medium whitespace-nowrap">
                                    {r.revYm > 0 ? `+${new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(r.revYm)}` : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-blue-500 whitespace-nowrap">
                                    {r.thuMetub > 0 ? `+${new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(r.thuMetub)}` : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-pink-500 whitespace-nowrap">
                                    {r.thuYeah1 > 0 ? `+${new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(r.thuYeah1)}` : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-purple-500 whitespace-nowrap">
                                    {r.thuMCV > 0 ? `+${new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(r.thuMCV)}` : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-green-500 whitespace-nowrap">
                                    {r.thuKhac > 0 ? `+${new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(r.thuKhac)}` : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-red-500 whitespace-nowrap">
                                    {r.chi > 0 ? `–${new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(r.chi)}` : "—"}
                                  </td>
                                  <td className="px-3 py-2.5 text-right text-blue-600 whitespace-nowrap">
                                    {r.salary > 0 ? `–${new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(r.salary)}` : "—"}
                                  </td>
                                  <td className={`px-3 py-2.5 text-right font-bold whitespace-nowrap ${r.loiNhuan >= 0 ? "text-emerald-600" : "text-orange-500"}`}>
                                    {r.loiNhuan >= 0 ? "+" : "–"}{new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(Math.abs(r.loiNhuan))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-gray-200 bg-gray-50 font-bold text-sm">
                                <td className="px-4 py-2.5 text-gray-700">Tổng cộng</td>
                                <td className="px-3 py-2.5 text-right text-green-600">
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.revYm, 0))}
                                </td>
                                <td className="px-3 py-2.5 text-right text-blue-500">
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.thuMetub, 0))}
                                </td>
                                <td className="px-3 py-2.5 text-right text-pink-500">
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.thuYeah1, 0))}
                                </td>
                                <td className="px-3 py-2.5 text-right text-purple-500">
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.thuMCV, 0))}
                                </td>
                                <td className="px-3 py-2.5 text-right text-green-500">
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.thuKhac, 0))}
                                </td>
                                <td className="px-3 py-2.5 text-right text-red-500">
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.chi, 0))}
                                </td>
                                <td className="px-3 py-2.5 text-right text-blue-600">
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.salary, 0))}
                                </td>
                                <td className={`px-3 py-2.5 text-right ${reportRows.reduce((s,r) => s+r.loiNhuan,0) >= 0 ? "text-emerald-600" : "text-orange-500"}`}>
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.loiNhuan, 0))}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                        <div className="px-4 py-2 border-t border-gray-100">
                          <p className="text-xs text-gray-400">Nhấn vào tháng để xem chi tiết. AEP = anhemphim.vn.</p>
                        </div>
                        {/* Dự báo thuế tổng hợp */}
                        {(() => {
                          const totalThu = reportRows.reduce((s, r) => s + r.revYm + r.thuChiThu, 0);
                          const totalChi = reportRows.reduce((s, r) => s + r.chi + r.salary, 0);
                          const totalProfit = reportRows.reduce((s, r) => s + r.loiNhuan, 0);
                          return (
                            <div className="px-4 py-3 border-t border-amber-100 bg-amber-50">
                              <div className="flex items-center gap-1.5 mb-2">
                                <span className="text-xs"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M8 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2h-2"/><path d="M9 12h6M9 16h4"/></svg></span>
                                <p className="text-xs font-semibold text-amber-700">Dự báo thuế tổng hợp</p>
                                <span className="text-[10px] bg-amber-100 text-amber-500 px-2 py-0.5 rounded-full font-medium ml-auto">Chỉ báo</span>
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <p className="text-[10px] text-amber-500 font-medium"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82Z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> VAT (8%)</p>
                                  <p className="text-sm font-black text-amber-700">{formatCurrency(totalThu * 0.08)}</p>
                                  <p className="text-[10px] text-amber-400">8% × Tổng thu</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-amber-500 font-medium"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20v-2a8 8 0 0 1 16 0v2"/></svg> TNCN (~3%)</p>
                                  <p className="text-sm font-black text-amber-700">{formatCurrency(totalChi * 0.03)}</p>
                                  <p className="text-[10px] text-amber-400">3% × Tổng chi</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-amber-500 font-medium"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="2" width="18" height="20"/><path d="M9 22V12h6v10M9 6h1M14 6h1M9 10h1M14 10h1M9 14h1M14 14h1"/></svg> TNDN (18%)</p>
                                  <p className="text-sm font-black text-amber-700">{totalProfit > 0 ? formatCurrency(totalProfit * 0.18) : "—"}</p>
                                  <p className="text-[10px] text-amber-400">18% × Lợi nhuận</p>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      </>
                    )}
                  </>
                )}

                {/* ── View: Anhemphim.vn ── */}
                {financeView === "anhemphim" && (() => {
                  const AEP_START = "2026-02";
                  const aepMonths = [...new Set([
                    ...(revenueData ? Object.keys(revenueData) : []),
                    ...(thuChiData ? thuChiData.map(t => t.date?.slice(0,7)).filter(Boolean) as string[] : []),
                    ...salaryMonths,
                  ])].filter(ym => ym >= AEP_START).sort().reverse();

                  const aepRev = revenueData?.[aepMonth] ?? 0;

                  // Tính từ classification đã lưu
                  const aepExpenses = thuChiData
                    ? thuChiData.filter(t => t.type === "Chi" && t.date?.startsWith(aepMonth) && isCheckedExpense(aepClassification, t))
                    : [];
                  const aepExpensesTotal = aepExpenses.reduce((s,t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0);

                  // Lương AEP: dùng salaryAssignments (theo assignmentId)
                  const aepSalaryRows = employees.map(emp => {
                    const approved = jobs.flatMap(job =>
                      job.assignments.filter(a => {
                        if (a.employeeId !== emp.id || a.status !== "APPROVED") return false;
                        const jm = job.month || job.createdAt.slice(0,7);
                        return getSalaryMonth(jm, a.approvedAt) === aepMonth && aepClassification?.salaryAssignments[a.id] === true;
                      }).map(a => ({ job, assignment: a }))
                    );
                    const total = approved.reduce((s,x) => s + x.assignment.salaryEarned, 0);
                    return { emp, approved, total };
                  }).filter(r => r.total > 0);
                  const aepSalaryTotal = aepSalaryRows.reduce((s,r) => s + r.total, 0);

                  // Lương thủ công AEP
                  const allManualMonth = (manualEntries[aepMonth] ?? []);
                  const aepManualEntries = allManualMonth.filter(e => aepClassification?.manualEntries[e.id] === true);
                  const aepManualTotal = aepManualEntries.reduce((s,e) => s + e.amount, 0);

                  const aepTotalChi = aepExpensesTotal + aepSalaryTotal + aepManualTotal;
                  const aepProfit = aepRev - aepTotalChi;

                  // Dữ liệu cho tab Chốt: tất cả chi phí và assignments của tháng
                  const allChiMonth = thuChiData ? thuChiData.filter(t => t.type === "Chi" && t.date?.startsWith(aepMonth)) : [];
                  const allSalaryAssignmentsMonth = jobs.flatMap(job =>
                    job.assignments.filter(a => {
                      if (a.status !== "APPROVED") return false;
                      const jm = job.month || job.createdAt.slice(0,7);
                      return getSalaryMonth(jm, a.approvedAt) === aepMonth;
                    }).map(a => ({ job, assignment: a }))
                  );

                  // Khởi tạo draft khi vào tab Chốt
                  const initDraft = () => {
                    const base = aepClassification ?? EMPTY_AEP_CLASSIFICATION;
                    setAepAiScanNotice(null);
                    setAepSalaryAiNotice(null);
                    setAepManualAiNotice(null);
                    setAepRestoreNotice(null);
                    setAepExpandedExpenseDays({});
                    setAepShootConfirmQueue([]);
                    setAepShootDecisions({});
                    setAepDraftDirty(false);
                    setAepDraft({
                      expenses: Object.fromEntries(allChiMonth.map(t => {
                        const stableKey = getExpenseStableKey(t);
                        return [String(t.id), base.expenses[String(t.id)] ?? base.expenseKeys[stableKey] ?? false];
                      })),
                      expenseKeys: Object.fromEntries(allChiMonth.map(t => {
                        const stableKey = getExpenseStableKey(t);
                        return [stableKey, base.expenseKeys[stableKey] ?? base.expenses[String(t.id)] ?? false];
                      })),
                      salaryAssignments: Object.fromEntries(allSalaryAssignmentsMonth.map(({assignment}) => [assignment.id, base.salaryAssignments?.[assignment.id] ?? false])),
                      manualEntries: Object.fromEntries(allManualMonth.map(e => [e.id, base.manualEntries?.[e.id] ?? false])),
                    });
                  };

                  return (
                    <div className="space-y-4">
                      {/* Header */}
                      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-5 shadow-lg">
                        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10" />
                        <div className="relative z-10">
                          <p className="text-white/80 text-xs font-medium mb-1">Phân tích dự án</p>
                          <h2 className="text-white font-black text-2xl leading-tight">anhemphim.vn</h2>
                          <p className="text-white/70 text-xs mt-1">Chỉ tính từ tháng 2/2026 trở đi</p>
                        </div>
                      </div>

                      {/* Chọn tháng */}
                      <div className="flex items-start gap-2">
                        <div className="flex gap-1 overflow-x-auto hide-scrollbar pb-0.5 flex-1">
                          {aepMonths.map(ym => (
                              <button key={ym} onClick={() => { setAepMonth(ym); setAepDraft(null); setAepDraftDirty(false); setAepAiScanNotice(null); setAepSalaryAiNotice(null); setAepManualAiNotice(null); setAepRestoreNotice(null); setAepShootConfirmQueue([]); setAepShootDecisions({}); setAepFilterExpense(""); setAepFilterExpenseDateFrom(""); setAepFilterExpenseDateTo(""); setAepFilterSalary(""); setAepFilterManual(""); setAepExpandedExpenseDays({}); }}
                              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${aepMonth === ym ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                              {monthLabel(ym)}{ym === currentYM() ? " ●" : ""}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => {
                            setAepExportMonths([aepMonth]);
                            setShowAepExportModal(true);
                          }}
                          disabled={aepExporting}
                          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border border-emerald-200 bg-white text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Xuất XLSX
                        </button>
                      </div>

                      {aepRestoreNotice && (
                        <div className={`rounded-xl px-3 py-2 text-xs flex items-start gap-2 ${aepRestoreNotice.tone === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : aepRestoreNotice.tone === "error" ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-violet-50 text-violet-700 border border-violet-200"}`}>
                          {aepRestoreNotice.tone === "error" ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : aepRestoreNotice.tone === "success" ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Loader2 className="w-3.5 h-3.5 mt-0.5 shrink-0 animate-spin" />}
                          <span>{aepRestoreNotice.text}</span>
                        </div>
                      )}

                      <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
                        <div className="px-4 py-3 bg-violet-50 border-b border-violet-100 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-violet-700 flex items-center gap-1.5"><History className="w-4 h-4" /> Lịch sử chốt AEP</p>
                            <p className="text-[11px] text-violet-500">Dùng nút khôi phục để lấy lại bảng tick từ các mốc đã lưu.</p>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-1 rounded-full bg-white text-violet-500 border border-violet-200 shrink-0">{aepHistory.length} bản gần nhất</span>
                        </div>
                        {aepHistory.length === 0 ? (
                          <div className="px-4 py-4 text-xs text-gray-500 space-y-1">
                            <p>Chưa có snapshot nào cho tháng này.</p>
                            <p>Sau bản vá này, mỗi lần lưu AEP sẽ tự tạo snapshot để bạn khôi phục về sau.</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-violet-50">
                            {aepHistory.slice(0, 5).map((entry) => {
                              const expenseCount = countCheckedEntries(entry.data.expenseKeys) || countCheckedEntries(entry.data.expenses);
                              const salaryCount = countCheckedEntries(entry.data.salaryAssignments);
                              const manualCount = countCheckedEntries(entry.data.manualEntries);
                              return (
                                <div key={entry.id} className="px-4 py-3 flex items-center gap-3">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-semibold text-gray-700">{formatHistoryTimestamp(entry.createdAt)}</span>
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 font-semibold">{getAepHistorySourceLabel(entry.source)}</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1">Chi phí: {expenseCount} · Lương job: {salaryCount} · Lương tay: {manualCount}</p>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => restoreAepSnapshot(entry.id)}
                                    disabled={aepRestoringSnapshotId === entry.id}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-violet-200 text-violet-600 bg-white hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                  >
                                    {aepRestoringSnapshotId === entry.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                                    Khôi phục
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Sub-tabs */}
                      <div className="flex bg-gray-100 p-1 rounded-xl gap-1">
                        <button onClick={() => setAepSubTab("overview")}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${aepSubTab === "overview" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                          <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 16V10M12 16V6M17 16v-5"/></svg> Tổng quan
                        </button>
                        <button onClick={() => { setAepSubTab("chot"); if (!aepDraft) initDraft(); }}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${aepSubTab === "chot" ? "bg-white text-violet-700 shadow-sm" : "text-gray-500"}`}>
                          <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Chốt số liệu
                        </button>
                      </div>

                      {/* TAB: Tổng quan */}
                      {aepSubTab === "overview" && (
                        <div className="space-y-4">
                          {/* KPI */}
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-green-50 border border-green-200 rounded-2xl p-3">
                              <p className="text-[10px] text-green-600 font-semibold mb-1"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg> Doanh thu</p>
                              <p className="font-black text-green-700 text-sm leading-tight">{formatCurrency(aepRev)}</p>
                              <p className="text-[10px] text-green-400 mt-1">anhemphim.vn</p>
                            </div>
                            <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                              <p className="text-[10px] text-red-500 font-semibold mb-1"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z"/><path d="M8 10h8M8 14h5"/></svg> Chi phí</p>
                              <p className="font-black text-red-600 text-sm leading-tight">{formatCurrency(aepTotalChi)}</p>
                              {aepClassification
                                ? <p className="text-[10px] text-red-400 mt-1">VH: {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(aepExpensesTotal)} · Lương: {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(aepSalaryTotal)}</p>
                                : <p className="text-[10px] text-red-300 mt-1">Chưa chốt</p>}
                            </div>
                            <div className={`border rounded-2xl p-3 ${aepProfit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
                              <p className={`text-[10px] font-semibold mb-1 ${aepProfit >= 0 ? "text-emerald-600" : "text-orange-500"}`}><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg> Lợi nhuận</p>
                              <p className={`font-black text-sm leading-tight ${aepProfit >= 0 ? "text-emerald-700" : "text-orange-600"}`}>{aepClassification ? formatCurrency(aepProfit) : "—"}</p>
                              {aepClassification && aepRev > 0 && <p className={`text-[10px] mt-1 ${aepProfit >= 0 ? "text-emerald-400" : "text-orange-400"}`}>{Math.round(aepProfit/aepRev*100)}% biên</p>}
                            </div>
                          </div>

                          {!aepClassification && (
                            <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                              Chưa chốt số liệu. Sang tab <strong><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Chốt số liệu</strong> để chọn các khoản thuộc AEP.
                            </div>
                          )}

                          {aepClassification && (
                            <div className="space-y-3">
                              {aepExpenses.length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                  <div className="px-4 py-3 bg-red-50 border-b border-red-100 flex items-center justify-between">
                                    <p className="text-sm font-semibold text-red-700"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z"/><path d="M8 10h8M8 14h5"/></svg> Chi phí vận hành — {monthLabel(aepMonth)}</p>
                                    <p className="text-sm font-black text-red-600">{formatCurrency(aepExpensesTotal)}</p>
                                  </div>
                                  <div className="divide-y divide-gray-50">
                                    {aepExpenses.map(t => {
                                      const amt = t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000;
                                      return (
                                        <div key={t.id} className="px-4 py-2.5 flex justify-between items-start gap-2 text-sm">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{t.subject}</p>
                                            {t.note && <p className="text-xs text-gray-400 truncate">{t.note}</p>}
                                            <p className="text-xs text-gray-400">{t.date}</p>
                                          </div>
                                          <span className="text-red-500 font-semibold shrink-0">{formatCurrency(amt)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {aepSalaryRows.length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                  <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                                    <p className="text-sm font-semibold text-blue-700"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/></svg> Lương sản xuất — {monthLabel(aepMonth)}</p>
                                    <p className="text-sm font-black text-blue-600">{formatCurrency(aepSalaryTotal)}</p>
                                  </div>
                                  <div className="divide-y divide-gray-50">
                                    {aepSalaryRows.map(({ emp, approved, total }) => (
                                      <div key={emp.id} className="px-4 py-2.5 text-sm">
                                        <div className="flex justify-between items-center mb-1">
                                          <span className="font-semibold">{emp.profile?.hoTen || emp.name}</span>
                                          <span className="text-blue-600 font-bold">{formatCurrency(total)}</span>
                                        </div>
                                        {approved.map(({ job, assignment }) => (
                                          <p key={assignment.id} className="text-xs text-gray-400 ml-2">· {job.title} — {formatCurrency(assignment.salaryEarned)}</p>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {aepManualEntries.length > 0 && (
                                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                  <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                                    <p className="text-sm font-semibold text-emerald-700"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4.5"/></svg> Lương thủ công — {monthLabel(aepMonth)}</p>
                                    <p className="text-sm font-black text-emerald-600">{formatCurrency(aepManualTotal)}</p>
                                  </div>
                                  <div className="divide-y divide-gray-50">
                                    {aepManualEntries.map(e => {
                                      const empName = employees.find(emp => emp.id === e.empId)?.profile?.hoTen || employees.find(emp => emp.id === e.empId)?.name || e.empId;
                                      return (
                                        <div key={e.id} className="px-4 py-2.5 flex justify-between items-start gap-2 text-sm">
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium truncate">{e.title}</p>
                                            <p className="text-xs text-gray-400">{empName}{e.note ? ` · ${e.note}` : ""}</p>
                                          </div>
                                          <span className="text-emerald-600 font-semibold shrink-0">{formatCurrency(e.amount)}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              {aepExpenses.length === 0 && aepSalaryRows.length === 0 && (
                                <div className="text-center py-6 text-gray-400 text-sm bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                  Không có chi phí AEP nào trong {monthLabel(aepMonth)}.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* TAB: Chốt số liệu */}
                      {aepSubTab === "chot" && aepDraft && (() => {
                        // ── Filtered lists ──────────────────────────────
                        const filteredChiMonth = allChiMonth.filter(t => {
                          const kw = aepFilterExpense.trim().toLowerCase();
                          if (kw && !t.subject.toLowerCase().includes(kw) && !(t.note ?? "").toLowerCase().includes(kw)) return false;
                          if (aepFilterExpenseDateFrom && t.date < aepFilterExpenseDateFrom) return false;
                          if (aepFilterExpenseDateTo && t.date > aepFilterExpenseDateTo) return false;
                          return true;
                        });
                        const filteredSalaryMonth = allSalaryAssignmentsMonth.filter(({ job, assignment }) => {
                          const kw = aepFilterSalary.trim().toLowerCase();
                          if (!kw) return true;
                          const empName = (employees.find(e => e.id === assignment.employeeId)?.profile?.hoTen || assignment.employeeName || "").toLowerCase();
                          return empName.includes(kw) || job.title.toLowerCase().includes(kw);
                        });
                        const filteredManualMonth = allManualMonth.filter(e => {
                          const kw = aepFilterManual.trim().toLowerCase();
                          if (!kw) return true;
                          const empName = (employees.find(emp => emp.id === e.empId)?.profile?.hoTen || employees.find(emp => emp.id === e.empId)?.name || "").toLowerCase();
                          return empName.includes(kw) || e.title.toLowerCase().includes(kw);
                        });

                        const groupedExpenseDays = filteredChiMonth.reduce<Array<{
                          date: string;
                          label: string;
                          items: ThuChiTransaction[];
                          total: number;
                          checkedCount: number;
                          preview: string;
                        }>>((groups, transaction) => {
                          const amount = transaction.currency === "VND" ? Number(transaction.amount) : Number(transaction.amount) * 25000;
                          const existing = groups.find((group) => group.date === transaction.date);
                          if (existing) {
                            existing.items.push(transaction);
                            existing.total += amount;
                            if (isCheckedExpense(aepDraft, transaction)) existing.checkedCount += 1;
                            const previewParts = existing.items
                              .slice(0, 3)
                              .map((item) => item.note?.trim() || item.subject?.trim())
                              .filter(Boolean);
                            existing.preview = previewParts.join(" · ");
                            return groups;
                          }

                          groups.push({
                            date: transaction.date,
                            label: formatFullDate(transaction.date),
                            items: [transaction],
                            total: amount,
                            checkedCount: isCheckedExpense(aepDraft, transaction) ? 1 : 0,
                            preview: transaction.note?.trim() || transaction.subject?.trim() || "",
                          });
                          return groups;
                        }, []);

                        const draftExpensesTotal = allChiMonth
                          .filter(t => aepDraft.expenses[String(t.id)])
                          .reduce((s,t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0);
                        const draftJobSalaryTotal = allSalaryAssignmentsMonth
                          .filter(({assignment}) => aepDraft.salaryAssignments[assignment.id])
                          .reduce((s,{assignment}) => s + assignment.salaryEarned, 0);
                        const draftManualTotal = allManualMonth
                          .filter(e => aepDraft.manualEntries[e.id])
                          .reduce((s,e) => s + e.amount, 0);
                        const draftSalaryTotal = draftJobSalaryTotal + draftManualTotal;
                        const draftTotal = draftExpensesTotal + draftSalaryTotal;

                        const hasExpenseFilter = !!aepFilterExpense || !!aepFilterExpenseDateFrom || !!aepFilterExpenseDateTo;
                        const hasSalaryFilter = !!aepFilterSalary;
                        const hasManualFilter = !!aepFilterManual;

                        return (
                          <div className="space-y-4">
                            {/* Preview số đang chọn */}
                            <div className="bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 flex items-center justify-between">
                              <div>
                                <p className="text-xs text-violet-500 font-medium">Tổng chi phí đang chọn</p>
                                <p className="text-lg font-black text-violet-700">{formatCurrency(draftTotal)}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-gray-400">VH: {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(draftExpensesTotal)}</p>
                                <p className="text-xs text-gray-400">Lương: {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(draftSalaryTotal)}</p>
                              </div>
                            </div>

                            {/* ── Chi phí vận hành ── */}
                            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                              <div className="px-4 py-3 bg-red-50 border-b border-red-100">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-sm font-semibold text-red-700"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z"/><path d="M8 10h8M8 14h5"/></svg> Chi phí — {monthLabel(aepMonth)}</p>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      onClick={() => runAepExpenseAiScan(allChiMonth)}
                                      disabled={aepAiScanning || allChiMonth.length === 0}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-violet-600 border border-violet-200 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                      {aepAiScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI quét
                                    </button>
                                    <button
                                      onClick={() => {
                                        const allChecked = filteredChiMonth.every(t => isCheckedExpense(aepDraft, t));
                                        updateAepDraft(d => d ? {
                                          ...d,
                                          expenses: { ...d.expenses, ...Object.fromEntries(filteredChiMonth.map(t => [String(t.id), !allChecked])) },
                                          expenseKeys: { ...d.expenseKeys, ...Object.fromEntries(filteredChiMonth.map(t => [getExpenseStableKey(t), !allChecked])) },
                                        } : d);
                                      }}
                                      className="text-xs text-red-500 hover:text-red-700 font-medium shrink-0">
                                      {filteredChiMonth.every(t => isCheckedExpense(aepDraft, t)) ? "Bỏ chọn" : "Chọn tất cả"}
                                      {hasExpenseFilter ? " (đang lọc)" : ""}
                                    </button>
                                  </div>
                                </div>
                                {/* Filter chi phí */}
                                <div className="space-y-1.5">
                                  <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                    <input
                                      type="text"
                                      placeholder="Tìm theo tên khoản chi, ghi chú..."
                                      value={aepFilterExpense}
                                      onChange={e => setAepFilterExpense(e.target.value)}
                                      className="w-full pl-7 pr-7 py-1.5 text-xs border border-red-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-red-300"
                                    />
                                    {aepFilterExpense && (
                                      <button onClick={() => setAepFilterExpense("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="flex gap-1.5 items-center">
                                    <CalendarDays className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                                    <input
                                      type="date"
                                      value={aepFilterExpenseDateFrom}
                                      onChange={e => setAepFilterExpenseDateFrom(e.target.value)}
                                      className="flex-1 px-2 py-1 text-xs border border-red-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-red-300"
                                    />
                                    <span className="text-xs text-gray-400 shrink-0">—</span>
                                    <input
                                      type="date"
                                      value={aepFilterExpenseDateTo}
                                      onChange={e => setAepFilterExpenseDateTo(e.target.value)}
                                      className="flex-1 px-2 py-1 text-xs border border-red-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-red-300"
                                    />
                                    {(aepFilterExpenseDateFrom || aepFilterExpenseDateTo) && (
                                      <button onClick={() => { setAepFilterExpenseDateFrom(""); setAepFilterExpenseDateTo(""); }} className="text-gray-400 hover:text-red-500 shrink-0">
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  {hasExpenseFilter && (
                                    <p className="text-[10px] text-red-400">
                                      Hiển thị {filteredChiMonth.length}/{allChiMonth.length} khoản · <button onClick={() => { setAepFilterExpense(""); setAepFilterExpenseDateFrom(""); setAepFilterExpenseDateTo(""); }} className="underline">Xoá bộ lọc</button>
                                    </p>
                                  )}
                                  {aepAiScanNotice && (
                                    <div className={`flex items-start gap-1.5 text-[10px] rounded-lg px-2.5 py-2 ${aepAiScanNotice.tone === "success" ? "bg-violet-100 text-violet-700" : aepAiScanNotice.tone === "error" ? "bg-rose-100 text-rose-700" : "bg-white/80 text-violet-500 border border-violet-100"}`}>
                                      {aepAiScanNotice.tone === "error" ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : aepAiScanNotice.tone === "success" ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                                      <span>{aepAiScanNotice.text}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {allChiMonth.length === 0 ? (
                                <p className="px-4 py-4 text-sm text-gray-400 text-center">Không có khoản chi nào trong tháng này</p>
                              ) : filteredChiMonth.length === 0 ? (
                                <p className="px-4 py-4 text-sm text-gray-400 text-center">Không có kết quả phù hợp</p>
                              ) : (
                                <div className="divide-y divide-gray-50">
                                  {groupedExpenseDays.map((group) => {
                                    const expanded = aepExpandedExpenseDays[group.date] === true;
                                    const allCheckedInDay = group.items.length > 0 && group.items.every((item) => isCheckedExpense(aepDraft, item));
                                    return (
                                      <div key={group.date} className="bg-white">
                                        <div className="flex items-center gap-2 px-4 py-3 bg-red-50/60">
                                          <button
                                            type="button"
                                            onClick={() => setAepExpandedExpenseDays((prev) => ({ ...prev, [group.date]: !expanded }))}
                                            className="p-1 rounded-md text-red-500 hover:bg-red-100 transition-colors shrink-0"
                                          >
                                            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} />
                                          </button>
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-red-700">{group.label}</p>
                                            <p className="text-[11px] text-red-400">{group.checkedCount}/{group.items.length} khoản đã tick</p>
                                            {!!group.preview && <p className="text-[11px] text-gray-500 truncate mt-0.5">{group.preview}{group.items.length > 3 ? " ..." : ""}</p>}
                                          </div>
                                          <span className="text-sm font-black text-red-600 shrink-0">{formatCurrency(group.total)}</span>
                                          <button
                                            type="button"
                                            onClick={() => updateAepDraft((draft) => draft ? {
                                              ...draft,
                                              expenses: {
                                                ...draft.expenses,
                                                ...Object.fromEntries(group.items.map((item) => [String(item.id), !allCheckedInDay])),
                                              },
                                              expenseKeys: {
                                                ...draft.expenseKeys,
                                                ...Object.fromEntries(group.items.map((item) => [getExpenseStableKey(item), !allCheckedInDay])),
                                              },
                                            } : draft)}
                                            className="text-[11px] font-semibold text-red-500 hover:text-red-700 shrink-0"
                                          >
                                            {allCheckedInDay ? "Bỏ tick ngày" : "Tick cả ngày"}
                                          </button>
                                        </div>
                                        {expanded && (
                                          <div className="divide-y divide-gray-50">
                                            {group.items.map((t) => {
                                              const amt = t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000;
                                              const checked = isCheckedExpense(aepDraft, t);
                                              return (
                                                <label key={t.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? "bg-red-50/50" : "hover:bg-gray-50"}`}>
                                                  <input type="checkbox" checked={checked}
                                                    onChange={e => updateAepDraft(d => d ? {
                                                      ...d,
                                                      expenses: { ...d.expenses, [String(t.id)]: e.target.checked },
                                                      expenseKeys: { ...d.expenseKeys, [getExpenseStableKey(t)]: e.target.checked },
                                                    } : d)}
                                                    className="w-4 h-4 accent-red-500 shrink-0 rounded" />
                                                  <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate text-gray-800">{t.subject}</p>
                                                    {t.note && <p className="text-xs text-gray-400 truncate">{t.note}</p>}
                                                    <p className="text-xs text-gray-400">{t.date}</p>
                                                  </div>
                                                  <span className={`text-sm font-semibold shrink-0 ${checked ? "text-red-600" : "text-gray-400"}`}>{formatCurrency(amt)}</span>
                                                </label>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* ── Lương job ── */}
                            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100">
                                <div className="flex items-center justify-between mb-2">
                                  <p className="text-sm font-semibold text-blue-700"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 14 0v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75M22 21v-2a4 4 0 0 0-3-3.87"/></svg> Lương — {monthLabel(aepMonth)}</p>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button
                                      onClick={() => runAepSalaryAiScan(allSalaryAssignmentsMonth)}
                                      disabled={aepSalaryAiScanning || allSalaryAssignmentsMonth.length === 0}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-violet-600 border border-violet-200 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                      {aepSalaryAiScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI quét
                                    </button>
                                    <button
                                      onClick={() => {
                                        const ids = filteredSalaryMonth.map(({assignment}) => assignment.id);
                                        const allChecked = ids.every(id => aepDraft.salaryAssignments[id]);
                                        updateAepDraft(d => d ? { ...d, salaryAssignments: { ...d.salaryAssignments, ...Object.fromEntries(ids.map(id => [id, !allChecked])) } } : d);
                                      }}
                                      className="text-xs text-blue-500 hover:text-blue-700 font-medium shrink-0">
                                      {filteredSalaryMonth.every(({assignment}) => aepDraft.salaryAssignments[assignment.id]) ? "Bỏ chọn" : "Chọn tất cả"}
                                      {hasSalaryFilter ? " (đang lọc)" : ""}
                                    </button>
                                  </div>
                                </div>
                                {/* Filter nhân viên */}
                                <div className="relative">
                                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                  <input
                                    type="text"
                                    placeholder="Tìm theo tên nhân viên, tên job..."
                                    value={aepFilterSalary}
                                    onChange={e => setAepFilterSalary(e.target.value)}
                                    className="w-full pl-7 pr-7 py-1.5 text-xs border border-blue-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-300"
                                  />
                                  {aepFilterSalary && (
                                    <button onClick={() => setAepFilterSalary("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                      <X className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                {hasSalaryFilter && (
                                  <p className="text-[10px] text-blue-400 mt-1">
                                    Hiển thị {filteredSalaryMonth.length}/{allSalaryAssignmentsMonth.length} khoản
                                  </p>
                                )}
                                {aepSalaryAiNotice && (
                                  <div className={`mt-1 flex items-start gap-1.5 text-[10px] rounded-lg px-2.5 py-2 ${aepSalaryAiNotice.tone === "success" ? "bg-blue-100 text-blue-700" : aepSalaryAiNotice.tone === "error" ? "bg-rose-100 text-rose-700" : "bg-white/80 text-blue-500 border border-blue-100"}`}>
                                    {aepSalaryAiNotice.tone === "error" ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : aepSalaryAiNotice.tone === "success" ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                                    <span>{aepSalaryAiNotice.text}</span>
                                  </div>
                                )}
                              </div>
                              {allSalaryAssignmentsMonth.length === 0 ? (
                                <p className="px-4 py-4 text-sm text-gray-400 text-center">Không có khoản lương nào trong tháng này</p>
                              ) : filteredSalaryMonth.length === 0 ? (
                                <p className="px-4 py-4 text-sm text-gray-400 text-center">Không có kết quả phù hợp</p>
                              ) : (
                                <div className="divide-y divide-gray-50">
                                  {filteredSalaryMonth.map(({ job, assignment }) => {
                                    const checked = !!aepDraft.salaryAssignments[assignment.id];
                                    const empName = employees.find(e => e.id === assignment.employeeId)?.profile?.hoTen || assignment.employeeName;
                                    return (
                                      <label key={assignment.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? "bg-blue-50/50" : "hover:bg-gray-50"}`}>
                                        <input type="checkbox" checked={checked}
                                          onChange={e => updateAepDraft(d => d ? { ...d, salaryAssignments: { ...d.salaryAssignments, [assignment.id]: e.target.checked } } : d)}
                                          className="w-4 h-4 accent-blue-500 shrink-0 rounded" />
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate text-gray-800">{job.title}</p>
                                          <p className="text-xs text-gray-400 truncate">{empName}</p>
                                        </div>
                                        <span className={`text-sm font-semibold shrink-0 ${checked ? "text-blue-600" : "text-gray-400"}`}>{formatCurrency(assignment.salaryEarned)}</span>
                                      </label>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                            {/* ── Lương thủ công ── */}
                            {allManualMonth.length > 0 && (
                              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
                                <div className="px-4 py-3 bg-emerald-50 border-b border-emerald-100">
                                  <div className="flex items-center justify-between mb-2">
                                    <p className="text-sm font-semibold text-emerald-700"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4.5"/></svg> Lương thủ công — {monthLabel(aepMonth)}</p>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        onClick={() => runAepManualAiScan(allManualMonth, new Map(employees.map(emp => [emp.id, emp.profile?.hoTen || emp.name])))}
                                        disabled={aepManualAiScanning || allManualMonth.length === 0}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white text-violet-600 border border-violet-200 hover:bg-violet-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                                        {aepManualAiScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} AI quét
                                      </button>
                                      <button
                                        onClick={() => {
                                          const ids = filteredManualMonth.map(e => e.id);
                                          const allChecked = ids.every(id => aepDraft.manualEntries[id]);
                                          updateAepDraft(d => d ? { ...d, manualEntries: { ...d.manualEntries, ...Object.fromEntries(ids.map(id => [id, !allChecked])) } } : d);
                                        }}
                                        className="text-xs text-emerald-500 hover:text-emerald-700 font-medium shrink-0">
                                        {filteredManualMonth.every(e => aepDraft.manualEntries[e.id]) ? "Bỏ chọn" : "Chọn tất cả"}
                                        {hasManualFilter ? " (đang lọc)" : ""}
                                      </button>
                                    </div>
                                  </div>
                                  {/* Filter nhân viên */}
                                  <div className="relative">
                                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                    <input
                                      type="text"
                                      placeholder="Tìm theo tên nhân viên, tiêu đề..."
                                      value={aepFilterManual}
                                      onChange={e => setAepFilterManual(e.target.value)}
                                      className="w-full pl-7 pr-7 py-1.5 text-xs border border-emerald-200 rounded-lg bg-white outline-none focus:ring-2 focus:ring-emerald-300"
                                    />
                                    {aepFilterManual && (
                                      <button onClick={() => setAepFilterManual("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                                        <X className="w-3 h-3" />
                                      </button>
                                    )}
                                  </div>
                                  {hasManualFilter && (
                                    <p className="text-[10px] text-emerald-400 mt-1">
                                      Hiển thị {filteredManualMonth.length}/{allManualMonth.length} khoản
                                    </p>
                                  )}
                                  {aepManualAiNotice && (
                                    <div className={`mt-1 flex items-start gap-1.5 text-[10px] rounded-lg px-2.5 py-2 ${aepManualAiNotice.tone === "success" ? "bg-emerald-100 text-emerald-700" : aepManualAiNotice.tone === "error" ? "bg-rose-100 text-rose-700" : "bg-white/80 text-emerald-500 border border-emerald-100"}`}>
                                      {aepManualAiNotice.tone === "error" ? <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : aepManualAiNotice.tone === "success" ? <CheckCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                                      <span>{aepManualAiNotice.text}</span>
                                    </div>
                                  )}
                                </div>
                                {filteredManualMonth.length === 0 ? (
                                  <p className="px-4 py-4 text-sm text-gray-400 text-center">Không có kết quả phù hợp</p>
                                ) : (
                                  <div className="divide-y divide-gray-50">
                                    {filteredManualMonth.map(e => {
                                      const checked = !!aepDraft.manualEntries[e.id];
                                      const empName = employees.find(emp => emp.id === e.empId)?.profile?.hoTen || employees.find(emp => emp.id === e.empId)?.name || e.empId;
                                      return (
                                        <label key={e.id} className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${checked ? "bg-emerald-50/50" : "hover:bg-gray-50"}`}>
                                          <input type="checkbox" checked={checked}
                                            onChange={ev => updateAepDraft(d => d ? { ...d, manualEntries: { ...d.manualEntries, [e.id]: ev.target.checked } } : d)}
                                            className="w-4 h-4 accent-emerald-500 shrink-0 rounded" />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate text-gray-800">{e.title}</p>
                                            <p className="text-xs text-gray-400 truncate">{empName}{e.note ? ` · ${e.note}` : ""}</p>
                                          </div>
                                          <span className={`text-sm font-semibold shrink-0 ${checked ? "text-emerald-600" : "text-gray-400"}`}>{formatCurrency(e.amount)}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Nút lưu */}
                            <button
                              onClick={async () => {
                                const newClassification = {
                                  expenses: { ...aepDraft.expenses },
                                  expenseKeys: { ...aepDraft.expenseKeys },
                                  salaryAssignments: { ...aepDraft.salaryAssignments },
                                  manualEntries: { ...aepDraft.manualEntries },
                                };
                                setAepClassification(newClassification);
                                setAepDraftDirty(false);
                                setAepSubTab("overview");
                                try {
                                  const res = await fetch(`/api/aep/${aepMonth}`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify(newClassification),
                                  });
                                  const payload = await res.json().catch(() => null);
                                  if (res.ok && Array.isArray(payload?.history)) setAepHistory(payload.history);
                                } catch { /* ignore */ }
                              }}
                              className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm">
                              <Save className="w-4 h-4" /> Lưu và xem tổng quan
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </main>

      {/* Modal thông tin cá nhân nhân viên */}
      {/* ── Modal sửa ngày tạo / ngày duyệt job ── */}
      {aepShootConfirmQueue[0] && (() => {
        const candidate = aepShootConfirmQueue[0];
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => rejectAepShootGroup(candidate)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-gray-900 flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-500" /> Xác nhận chi phí ngày quay</h2>
                  <p className="text-xs text-gray-400 mt-1">
                    {candidate.label}{candidate.filmNames.length > 0 ? ` · ${candidate.filmNames.join(", ")}` : ""}
                  </p>
                </div>
                <button onClick={() => rejectAepShootGroup(candidate)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-5 space-y-4">
                <div className="bg-violet-50 border border-violet-100 rounded-xl p-3 text-sm text-violet-700">
                  AI thấy {candidate.expenses.length} khoản chi trùng với lịch ngày quay này và mang kiểu chi phí hiện trường. Nếu đúng là ngày quay của Anh Em Phim, bấm xác nhận để tick cả nhóm.
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nguồn đối chiếu ngày quay</p>
                  <div className="space-y-1">
                    {candidate.sourceLabels.slice(0, 3).map((label, index) => (
                      <p key={`${candidate.key}-${index}`} className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{label}</p>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Các khoản sẽ được chọn</p>
                  <div className="border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-100">
                    {candidate.expenses.map((expense) => {
                      const amount = expense.currency === "VND" ? Number(expense.amount) : Number(expense.amount) * 25000;
                      return (
                        <div key={expense.id} className="px-4 py-3 flex items-start gap-3 text-sm">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-800">{expense.subject}</p>
                            {expense.note && <p className="text-xs text-gray-400 mt-0.5">{expense.note}</p>}
                            <p className="text-xs text-gray-400 mt-0.5">{expense.date}</p>
                          </div>
                          <span className="font-semibold text-red-500 shrink-0">{formatCurrency(amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={() => confirmAepShootGroup(candidate)}
                  className="flex-1 bg-violet-600 hover:bg-violet-700 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
                  Đúng, chọn cả nhóm
                </button>
                <button
                  onClick={() => rejectAepShootGroup(candidate)}
                  className="px-4 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl text-sm transition-colors">
                  Bỏ qua
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {dateEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDateEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Sửa ngày ký kết</h2>
                <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[220px]">{dateEditModal.job.title}</p>
              </div>
              <button onClick={() => setDateEditModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Ngày tạo job (ký kết hợp đồng)</label>
                <input
                  type="date"
                  value={dateEditModal.createdAt}
                  onChange={(e) => setDateEditModal((p) => p ? { ...p, createdAt: e.target.value } : p)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Ngày duyệt (thanh toán)</label>
                <input
                  type="date"
                  value={dateEditModal.approvedAt}
                  onChange={(e) => setDateEditModal((p) => p ? { ...p, approvedAt: e.target.value } : p)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={async () => {
                  if (!dateEditModal) return;
                  const { job, assignment, createdAt, approvedAt } = dateEditModal;
                  await fetch(`/api/jobs/${job.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      createdAt: new Date(createdAt).toISOString(),
                      assignmentId: assignment.id,
                      approvedAt: new Date(approvedAt).toISOString(),
                    }),
                  });
                  await fetchAll();
                  setDateEditModal(null);
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors"
              ><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Lưu</button>
              <button onClick={() => setDateEditModal(null)}
                className="px-4 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl text-sm transition-colors">Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {staffingDayModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setStaffingDayModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><UserPlus className="w-4 h-4 text-orange-500" /> Gán nhanh nhân sự</h2>
                <p className="text-xs text-gray-400 mt-0.5">{staffingDayModal.fullLabel} · {staffingDayModal.projectList?.join(", ") || "Lịch quay"}</p>
              </div>
              <button onClick={() => setStaffingDayModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-3">
              {staffingDayModal.jobs.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Không có job nào trong ngày này.</p>
              ) : staffingDayModal.jobs.map((job) => {
                const assignedPercent = job.assignments.reduce((sum, assignment) => sum + assignment.percentage, 0);
                const isFull = assignedPercent >= 100;
                return (
                  <div key={job.id} className={`rounded-xl border p-3 ${isFull ? "border-emerald-200 bg-emerald-50" : "border-orange-200 bg-orange-50/40"}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-gray-900 truncate">{job.title}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          {job.jobCategory || "Job"} · {formatCurrency(job.totalSalary)}
                          {job.assignments.length > 0 ? ` · Đã gán: ${job.assignments.map((assignment) => assignment.employeeName).join(", ")}` : ""}
                        </p>
                      </div>
                      {isFull ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-white border border-emerald-200 rounded-full px-3 py-1.5 shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đã đủ
                        </span>
                      ) : (
                        <select
                          value={staffingSelections[job.id] ?? ""}
                          onChange={(e) => setStaffingSelections((prev) => ({ ...prev, [job.id]: e.target.value }))}
                          className="w-full sm:w-56 px-3 py-2 border border-orange-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-orange-400 outline-none"
                        >
                          <option value="">Chọn nhân sự</option>
                          {employees.filter((employee) => employee.isActive !== false).map((employee) => (
                            <option key={employee.id} value={employee.id}>{employee.profile?.hoTen || employee.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button onClick={() => setStaffingDayModal(null)} className="px-4 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl text-sm transition-colors">Huỷ</button>
              <button
                type="button"
                onClick={handleAssignStaffingDay}
                disabled={submitting || !staffingDayModal.jobs.some((job) => (staffingSelections[job.id] ?? "") && job.assignments.reduce((sum, assignment) => sum + assignment.percentage, 0) < 100)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang gán...</> : <><UserPlus className="w-4 h-4" /> Gán nhân sự</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {jobEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setJobEditModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 flex items-center gap-2"><Pencil className="w-4 h-4 text-blue-600" /> Sửa job</h2>
                <p className="text-xs text-gray-400 mt-0.5">Cập nhật thông tin sau khi tạo</p>
              </div>
              <button onClick={() => setJobEditModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Tên job</label>
                  <input
                    type="text"
                    value={jobEditModal.title}
                    onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, title: e.target.value } : prev)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Tháng tính lương</label>
                  <input
                    type="month"
                    value={jobEditModal.month}
                    onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, month: e.target.value } : prev)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Loại job</label>
                  <select
                    value={JOB_CATEGORY_OPTIONS.includes(jobEditModal.jobCategory as typeof JOB_CATEGORY_OPTIONS[number]) ? jobEditModal.jobCategory : "Khác"}
                    onChange={(e) => {
                      if (e.target.value !== "Khác") {
                        setJobEditModal((prev) => prev ? { ...prev, jobCategory: e.target.value } : prev);
                      } else {
                        setJobEditModal((prev) => prev ? { ...prev, jobCategory: "" } : prev);
                      }
                    }}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  >
                    {JOB_CATEGORY_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  {(!JOB_CATEGORY_OPTIONS.includes(jobEditModal.jobCategory as typeof JOB_CATEGORY_OPTIONS[number]) || jobEditModal.jobCategory === "") && (
                    <input
                      type="text"
                      autoFocus
                      value={jobEditModal.jobCategory}
                      onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, jobCategory: e.target.value } : prev)}
                      placeholder="Nhập cụ thể loại job..."
                      className="mt-2 w-full px-3 py-2.5 border border-blue-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Dự án</label>
                  <input
                    type="text"
                    list="project-name-options"
                    value={jobEditModal.projectName}
                    onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, projectName: e.target.value } : prev)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    placeholder="Tên dự án / phim"
                  />
                </div>
              </div>

              {jobEditModal.jobType === "mini" ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Giá / clip</label>
                    <input
                      type="number"
                      min="0"
                      value={jobEditModal.unitPrice}
                      onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, unitPrice: e.target.value } : prev)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tổng clip</label>
                    <input
                      type="number"
                      min="1"
                      value={jobEditModal.totalUnits}
                      onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, totalUnits: e.target.value } : prev)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Ngày hết hạn</label>
                    <input
                      type="date"
                      value={jobEditModal.expiresAt}
                      onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, expiresAt: e.target.value } : prev)}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Đơn vị tính</label>
                      <select
                        value={jobEditModal.workUnit}
                        onChange={(e) => setJobEditModal((prev) => prev ? {
                          ...prev,
                          workUnit: e.target.value as StandardWorkUnit,
                          ...(e.target.value === "episode" ? { dayLabel: "" } : { episodeLabel: "" }),
                        } : prev)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      >
                        <option value="episode">Theo tập</option>
                        <option value="day">Theo ngày</option>
                      </select>
                    </div>
                    {jobEditModal.workUnit === "episode" && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Tên / số tập</label>
                        <input
                          type="text"
                          value={jobEditModal.episodeLabel}
                          onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, episodeLabel: e.target.value } : prev)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="VD: 14 15 16 17 18"
                        />
                      </div>
                    )}
                    {jobEditModal.workUnit === "day" && (
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1">Những ngày trong tháng</label>
                        <input
                          type="text"
                          value={jobEditModal.dayLabel}
                          onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, dayLabel: e.target.value } : prev)}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="VD: 14 15 16"
                        />
                      </div>
                    )}
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Số {getWorkUnitLabel(jobEditModal.workUnit)}</label>
                      <input
                        type="number"
                        min="1"
                        value={jobEditModal.workUnit === "episode"
                          ? (parseEpisodeLabelInput(jobEditModal.episodeLabel).count > 0 ? String(parseEpisodeLabelInput(jobEditModal.episodeLabel).count) : jobEditModal.workUnits)
                          : (parseDayLabelInput(jobEditModal.dayLabel).count > 0 ? String(parseDayLabelInput(jobEditModal.dayLabel).count) : jobEditModal.workUnits)}
                        onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, workUnits: e.target.value } : prev)}
                        readOnly={(jobEditModal.workUnit === "episode" && parseEpisodeLabelInput(jobEditModal.episodeLabel).count > 0)
                          || (jobEditModal.workUnit === "day" && parseDayLabelInput(jobEditModal.dayLabel).count > 0)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Tiền / {getWorkUnitRateLabel(jobEditModal.workUnit)}</label>
                      <input
                        type="number"
                        min="0"
                        value={jobEditModal.ratePerUnit}
                        onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, ratePerUnit: e.target.value } : prev)}
                        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <label className="block text-xs font-semibold text-gray-500">Ngày hết hạn</label>
                      <label className="inline-flex items-center gap-2 text-[11px] text-gray-500">
                        <input
                          type="checkbox"
                          checked={jobEditModal.hasExpiry}
                          onChange={(e) => setJobEditModal((prev) => prev ? {
                            ...prev,
                            hasExpiry: e.target.checked,
                            expiresAt: e.target.checked ? prev.expiresAt : "",
                          } : prev)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        Có hạn chót
                      </label>
                    </div>
                    <input
                      type="date"
                      value={jobEditModal.expiresAt}
                      onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, expiresAt: e.target.value } : prev)}
                      disabled={!jobEditModal.hasExpiry}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Tắt mục này nếu job không có hạn chót.</p>
                  </div>
                </>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex justify-between items-center text-sm">
                <div>
                  <span className="text-blue-700">Tổng tiền sau chỉnh sửa</span>
                  {jobEditModal.workUnit === "episode" && jobEditModal.episodeLabel && (
                    <p className="text-xs text-blue-600 mt-1">Danh sách tập: {parseEpisodeLabelInput(jobEditModal.episodeLabel).normalized}</p>
                  )}
                  {jobEditModal.workUnit === "day" && jobEditModal.dayLabel && (
                    <p className="text-xs text-blue-600 mt-1">Danh sách ngày: {parseDayLabelInput(jobEditModal.dayLabel).normalized}</p>
                  )}
                </div>
                <span className="font-black text-blue-800">{formatCurrency(editJobTotalPreview)}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Mô tả / ghi chú</label>
                <textarea
                  value={jobEditModal.description}
                  onChange={(e) => setJobEditModal((prev) => prev ? { ...prev, description: e.target.value } : prev)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none h-24 resize-none"
                />
              </div>
            </div>

            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={handleSaveJobEdit}
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors"
              >
                {submitting ? "Đang lưu..." : "Lưu thay đổi"}
              </button>
              <button onClick={() => setJobEditModal(null)} className="px-4 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl text-sm transition-colors">Huỷ</button>
            </div>
          </div>
        </div>
      )}

      {profileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setProfileModal(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20v-2a8 8 0 0 1 16 0v2"/></svg> Thông tin cá nhân</h2>
                <p className="text-xs text-gray-400 mt-0.5">{profileModal.name} · dùng để thanh toán & hợp đồng</p>
              </div>
              <button onClick={() => setProfileModal(null)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              {([
                { key: "hoTen",       label: "Họ và tên đầy đủ",  placeholder: "Nguyễn Văn A",  type: "text" },
                { key: "cccd",        label: "Số CCCD / CMND",     placeholder: "012345678901", type: "text" },
                { key: "ngayCapCccd", label: "Ngày cấp",           placeholder: "DD/MM/YYYY",  type: "text" },
                { key: "noiCapCccd",  label: "Nơi cấp",            placeholder: "Cục Cảnh sát QLHC về TTXH", type: "text" },
                { key: "diaChi",      label: "Địa chỉ thường trú", placeholder: "Số nhà, đường, phường, quận/huyện, tỉnh/TP", type: "text" },
                { key: "mst",         label: "Mã số thuế cá nhân", placeholder: "Để trống nếu chưa có", type: "text" },
                { key: "dienThoai",   label: "Số điện thoại",      placeholder: "0901234567", type: "tel" },
                { key: "stk",         label: "Số tài khoản NH",    placeholder: "1234567890123", type: "text" },
                { key: "nganHang",    label: "Ngân hàng",          placeholder: "VD: Techcombank, Vietcombank...", type: "text" },
              ] as {key:string;label:string;placeholder:string;type:string}[]).map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">{label}</label>
                  <input
                    type={type}
                    value={profileForm[key] ?? ""}
                    onChange={(e) => setProfileForm((prev) => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              ))}
            </div>
            <div className="px-5 pb-5 flex gap-2">
              <button
                onClick={async () => {
                  setSubmitting(true);
                  try {
                    const res = await fetch(`/api/employees/${profileModal.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        ...(profileForm.hoTen ? { name: profileForm.hoTen } : {}),
                        profile: profileForm,
                      }),
                    });
                    if (res.ok) { await fetchAll(); setProfileModal(null); }
                  } finally { setSubmitting(false); }
                }}
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-2.5 rounded-xl font-semibold text-sm transition-colors">
                {submitting ? "Đang lưu..." : <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg> Lưu thông tin</>}
              </button>
              <button onClick={() => setProfileModal(null)}
                className="px-4 py-2.5 text-gray-500 hover:bg-gray-100 rounded-xl text-sm transition-colors">
                Huỷ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal thêm lương thủ công */}
      {manualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setManualModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Thêm lương thủ công</h3>
                <p className="text-xs text-gray-400 mt-0.5">{manualModal.emp.name} · {monthLabel(directorMonth)}</p>
              </div>
              <button onClick={() => setManualModal(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form
              className="p-4 space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                const amt = Number(manualAmount.replace(/[^0-9]/g, ""));
                if (!manualTitle.trim() || !amt) return;
                const entry: ManualEntry = {
                  id: Date.now().toString(),
                  empId: manualModal.emp.id,
                  month: directorMonth,
                  title: manualTitle.trim(),
                  amount: amt,
                  note: manualNote.trim(),
                };
                // Cập nhật UI ngay lập tức (optimistic)
                const updated = { ...manualEntries };
                updated[directorMonth] = [...(updated[directorMonth] ?? []), entry];
                setManualEntries(updated);
                setManualModal(null);
                // Lưu lên server
                const res = await fetch("/api/manual-salary", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(entry),
                });
                if (!res.ok) {
                  // Nếu lỗi, tải lại dữ liệu thật từ server
                  fetchAll();
                }
              }}
            >
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tên công việc / mô tả</label>
                <input
                  autoFocus
                  type="text"
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="VD: Phụ cấp xăng xe, Quay thêm buổi..."
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Số tiền (VND)</label>
                <input
                  type="number"
                  min="0"
                  value={manualAmount}
                  onChange={(e) => setManualAmount(e.target.value)}
                  placeholder="VD: 500000"
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Ghi chú <span className="text-gray-400">(tuỳ chọn)</span></label>
                <input
                  type="text"
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Ghi chú thêm..."
                  className="w-full border border-gray-300 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"
                />
              </div>
              <button
                type="submit"
                disabled={!manualTitle.trim() || !manualAmount}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-colors text-sm"
              >
                Lưu
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Group AI Modal */}
      {groupModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-gray-100 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-base flex items-center gap-2"><Sparkles className="w-4 h-4 text-purple-500" /> Tạo nhóm job bằng AI</h3>
              <button onClick={() => setGroupModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Mô tả sự kiện</label>
                <textarea value={groupInput} onChange={(e) => setGroupInput(e.target.value)}
                  rows={3} placeholder={"Ví dụ:\nNgày quay Sát Giới 27/2 Tập 1 2\nNgày quay Hào Kiệt 5/3 Tập 5"}
                  className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Nhập tên phim, ngày quay, số tập — AI tự tạo đủ 7 job tại chỗ + job dựng mỗi tập.</p>
              </div>
              {aiError && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{aiError}
                </div>
              )}
              <button
                onClick={async () => {
                  setAiLoading(true);
                  setAiError(null);
                  setPreviewJobs(null);
                  try {
                    const now = new Date();
                    const res = await fetch("/api/ai/parse-jobs", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ input: groupInput, currentYear: now.getFullYear(), currentMonth: now.getMonth() + 1 }),
                    });
                    const data = await res.json();
                    if (!res.ok) { setAiError(data.error || "Lỗi không xác định"); return; }
                    setPreviewGroupName(data.groupName);
                    setPreviewJobs(data.jobs);
                  } catch (e) {
                    setAiError(`Lỗi kết nối: ${e}`);
                  } finally {
                    setAiLoading(false);
                  }
                }}
                disabled={!groupInput.trim() || aiLoading}
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2"
              >
                {aiLoading ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang phân tích...</> : <><Sparkles className="w-4 h-4" /> Phân tích AI</>}
              </button>

              {/* Preview */}
              {previewJobs && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-gray-700">{previewGroupName} — {previewJobs.length} job</p>
                    <span className="text-xs text-gray-400">
                      Tổng: {new Intl.NumberFormat("vi-VN").format(previewJobs.reduce((s, j) => s + j.totalSalary, 0))}đ
                    </span>
                  </div>
                  <div className="space-y-2">
                    {previewJobs.map((job, idx) => (
                      <div key={idx} className={`rounded-xl border p-3 flex items-center gap-3 ${job.isOnSite ? "border-orange-200 bg-orange-50/40" : "border-blue-200 bg-blue-50/40"}`}>
                        <div className="flex-1 min-w-0 space-y-1">
                          <input type="text" value={job.title}
                            onChange={(e) => setPreviewJobs(prev => prev!.map((j, i) => i === idx ? { ...j, title: e.target.value } : j))}
                            className="w-full text-sm font-medium bg-transparent border-0 outline-none focus:ring-1 focus:ring-purple-400 rounded px-1"
                          />
                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="flex items-center">
                              <span className="text-xs text-gray-400 mr-1">₫</span>
                              <input type="number" value={job.totalSalary}
                                onChange={(e) => setPreviewJobs(prev => prev!.map((j, i) => i === idx ? { ...j, totalSalary: Number(e.target.value) } : j))}
                                className="w-28 text-xs text-green-700 font-semibold bg-transparent border-0 outline-none focus:ring-1 focus:ring-purple-400 rounded px-1"
                              />
                            </div>
                            {job.isOnSite
                              ? <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full flex items-center gap-1"><Timer className="w-2.5 h-2.5" />Tại chỗ — tự ẩn {new Date(job.expiresAt!).toLocaleDateString("vi-VN")}</span>
                              : <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Hậu kỳ</span>
                            }
                          </div>
                        </div>
                        <button onClick={() => setPreviewJobs(prev => prev!.filter((_, i) => i !== idx))}
                          className="p-1 text-gray-300 hover:text-red-500 shrink-0"><X className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {previewJobs && previewJobs.length > 0 && (
              <div className="p-4 border-t border-gray-100 shrink-0">
                <button
                  disabled={submitting}
                  onClick={async () => {
                    setSubmitting(true);
                    try {
                      await fetch("/api/jobs/batch", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          jobs: previewJobs.map(j => ({ ...j, groupName: previewGroupName })),
                        }),
                      });
                      setGroupModalOpen(false);
                      setPreviewJobs(null);
                      setGroupInput("");
                      await fetchAll();
                    } finally { setSubmitting(false); }
                  }}
                  className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" /> Tạo {previewJobs.length} job
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Approve Modal - Director */}
      {approvingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl">
            <div className="p-5">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-base font-bold">Duyệt phần việc</h3>
                <button onClick={() => { setApprovingItem(null); setApproveNote(""); }} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-1 text-sm">
                <p className="font-medium text-gray-900 line-clamp-1">{approvingItem.jobTitle}</p>
                <p className="text-gray-500">Nhân viên: <span className="font-medium text-gray-700">{approvingItem.empName}</span></p>
                <p className="text-gray-500">Thưởng: <span className="font-semibold text-green-600">{new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(approvingItem.salary)}</span></p>
              </div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <MessageSquare className="w-3.5 h-3.5 inline mr-1" />Ghi chú (tuỳ chọn)
              </label>
              <textarea value={approveNote} onChange={(e) => setApproveNote(e.target.value)}
                rows={3} placeholder="Nhận xét, phản hồi cho nhân viên..."
                className="w-full border border-gray-300 rounded-lg p-2.5 text-sm resize-none focus:ring-2 focus:ring-green-500 outline-none"
              />
              <div className="flex gap-2 mt-4">
                <button onClick={() => { setApprovingItem(null); setApproveNote(""); }}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  Huỷ
                </button>
                <button onClick={() => handleApprove(approvingItem.jobId, approvingItem.assignmentId, approveNote.trim() || undefined)}
                  disabled={submitting}
                  className="flex-1 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" /> Xác nhận duyệt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
{showAepExportModal && (() => {
        const AEP_START = "2026-02";
        const salaryMonths = (() => {
          const s = new Set<string>([currentYM()]);
          jobs.forEach((job) => {
            const jm = job.month || job.createdAt.slice(0, 7);
            s.add(jm);
            job.assignments.forEach((a) => { if (a.approvedAt) s.add(getSalaryMonth(jm, a.approvedAt)); });
          });
          return Array.from(s);
        })();
        const aepMonths = [...new Set([
          ...(revenueData ? Object.keys(revenueData) : []),
          ...(thuChiData ? thuChiData.map((t) => t.date?.slice(0, 7)).filter(Boolean) as string[] : []),
          ...salaryMonths,
        ])].filter((ym) => ym >= AEP_START).sort().reverse();

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowAepExportModal(false)}>
            <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2"><FileSpreadsheet className="w-5 h-5 text-emerald-600" /> Xuất Excel (BCTC)</h3>
                  <p className="text-xs text-gray-500 mt-1">Gộp số liệu các tháng đã chọn thành 1 file duy nhất</p>
                </div>
                <button onClick={() => setShowAepExportModal(false)} className="p-2 -mr-2 bg-gray-50 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 overflow-y-auto min-h-[150px] space-y-2">
                {aepMonths.map((ym) => (
                  <label key={ym} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/50 cursor-pointer transition-colors group">
                    <input
                      type="checkbox"
                      checked={aepExportMonths.includes(ym)}
                      onChange={(e) => {
                        if (e.target.checked) setAepExportMonths((prev) => [...prev, ym]);
                        else setAepExportMonths((prev) => prev.filter((m) => m !== ym));
                      }}
                      className="w-5 h-5 text-emerald-600 rounded border-gray-300 focus:ring-emerald-500 transition-shadow"
                    />
                    <span className="text-sm font-semibold text-gray-700 group-hover:text-emerald-800 transition-colors flex-1">{monthLabel(ym)}</span>
                    {ym === aepMonth && <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold ml-auto">Tháng hiện tại</span>}
                  </label>
                ))}
              </div>

              <div className="p-5 border-t border-gray-100 bg-gray-50 shrink-0 flex gap-3 sm:rounded-b-2xl">
                <button
                  onClick={() => setShowAepExportModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-100 transition-colors"
                >
                  Hủy
                </button>
                <button
                  disabled={aepExportMonths.length === 0 || aepExporting}
                  onClick={async () => {
                    try {
                      setAepExporting(true);
                      const XLSX = await import("xlsx");

                      let totalRev = 0;
                      let totalExpenses = 0;
                      let totalSalary = 0;
                      let totalManual = 0;

                      const allExpenseRows: any[][] = [];
                      const allSalaryRows: any[][] = [];
                      const allManualRows: any[][] = [];

                      for (const month of aepExportMonths) {
                        const res = await fetch(`/api/aep/${month}`);
                        const data = await res.json().catch(() => null);
                        const classification = data || EMPTY_AEP_CLASSIFICATION;

                        const rev = revenueData?.[month] ?? 0;
                        totalRev += rev;

                        const monthExpenses = thuChiData
                          ? thuChiData.filter((t) => t.type === "Chi" && t.date?.startsWith(month) && isCheckedExpense(classification, t))
                          : [];
                        totalExpenses += monthExpenses.reduce((s, t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0);

                        allExpenseRows.push(
                          ...monthExpenses.map((t) => [
                            t.date,
                            t.subject,
                            t.note || "",
                            t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000,
                            t.currency,
                            t.created_by || "",
                          ])
                        );

                        const monthSalaryData = employees.map((emp) => {
                          const approved = jobs.flatMap((job) =>
                            job.assignments.filter((a) => {
                              if (a.employeeId !== emp.id || a.status !== "APPROVED") return false;
                              const jm = job.month || job.createdAt.slice(0, 7);
                              return getSalaryMonth(jm, a.approvedAt) === month && classification?.salaryAssignments?.[a.id] === true;
                            }).map((a) => ({ job, assignment: a }))
                          );
                          return { emp, approved };
                        }).filter((r) => r.approved.length > 0);

                        monthSalaryData.forEach(({ emp, approved }) => {
                          approved.forEach(({ job, assignment }) => {
                            totalSalary += assignment.salaryEarned;
                            allSalaryRows.push([
                              emp.profile?.hoTen || emp.name,
                              job.title,
                              assignment.approvedAt ? assignment.approvedAt.slice(0, 10) : "",
                              assignment.salaryEarned,
                              month,
                            ]);
                          });
                        });

                        const allManualForMonth = manualEntries[month] ?? [];
                        const monthManualEntries = allManualForMonth.filter((e) => classification?.manualEntries?.[e.id] === true);
                        totalManual += monthManualEntries.reduce((s, e) => s + e.amount, 0);

                        allManualRows.push(
                          ...monthManualEntries.map((entry) => [
                            employees.find((emp) => emp.id === entry.empId)?.profile?.hoTen || employees.find((emp) => emp.id === entry.empId)?.name || entry.empId,
                            entry.title,
                            entry.note || "",
                            entry.amount,
                            month,
                          ])
                        );
                      }

                      const totalChi = totalExpenses + totalSalary + totalManual;
                      const profit = totalRev - totalChi;

                      const summaryRows = [
                        ["Hạng mục", "Giá trị"],
                        ["Các tháng gộp", aepExportMonths.map(monthLabel).join(", ")],
                        ["Tổng Doanh thu", totalRev],
                        ["Tổng Chi phí vận hành", totalExpenses],
                        ["Tổng Lương sản xuất", totalSalary],
                        ["Tổng Lương thủ công", totalManual],
                        ["Tổng chi phí", totalChi],
                        ["Lợi nhuận", profit],
                        ["Xuất lúc", new Date().toLocaleString("vi-VN")],
                      ];

                      const expenseSheetRows = [
                        ["Ngày", "Hạng mục", "Ghi chú", "Số tiền (VND)", "Tiền tệ gốc", "Người tạo"],
                        ...allExpenseRows,
                      ];

                      const salarySheetRows = [
                        ["Nhân sự", "Job", "Ngày duyệt", "Lương", "Tháng tính"],
                        ...allSalaryRows,
                      ];

                      const manualSheetRows = [
                        ["Nhân sự", "Tiêu đề", "Ghi chú", "Số tiền", "Tháng tính"],
                        ...allManualRows,
                      ];

                      const workbook = XLSX.utils.book_new();
                      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(summaryRows), "TongQuan");
                      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(expenseSheetRows), "ChiPhi");
                      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(salarySheetRows), "LuongJob");
                      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(manualSheetRows), "LuongThuCong");

                      const fileName = aepExportMonths.length === 1 ? `AEP-${aepExportMonths[0]}.xlsx` : `AEP-Gop-${aepExportMonths.length}-Thang.xlsx`;
                      XLSX.writeFile(workbook, fileName);

                      setShowAepExportModal(false);
                    } catch (e) {
                      console.error("Export error", e);
                      alert("Không thể xuất file XLSX. Vui lòng thử lại.");
                    } finally {
                      setAepExporting(false);
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
                >
                  {aepExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang gộp & xuất...
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4" />
                      Xuất File
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      </div>
    );
  }

  // ══════════════════════════════════════════════════════
  // EMPLOYEE PAGE
  // ══════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-2.5 flex justify-between items-center">
          {/* Avatar + Tên */}
          <div className="flex items-center gap-3">
            <label className="relative cursor-pointer group shrink-0">
              <div className="w-9 h-9 rounded-full overflow-hidden bg-green-100 flex items-center justify-center text-green-700 font-bold text-sm ring-2 ring-white">
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  : currentEmployee?.name.charAt(0).toUpperCase()}
              </div>
              <div className="absolute inset-0 rounded-full bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <span className="text-white text-[9px] font-bold leading-tight text-center">UP<br/>LOAD</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file || !currentEmployee) return;
                const reader = new FileReader();
                reader.onload = (ev) => {
                  const url = ev.target?.result as string;
                  localStorage.setItem(`avatar_${currentEmployee.id}`, url);
                  setAvatarUrl(url);
                };
                reader.readAsDataURL(file);
                e.target.value = "";
              }} />
            </label>
            <p className="font-semibold text-gray-900 text-sm">
                {currentEmployee?.profile?.hoTen || currentEmployee?.name}
              </p>
            </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                if (employeeView !== "profile") {
                  const p = currentEmployee?.profile ?? {};
                  setEmpProfileFormState({
                    hoTen: p.hoTen ?? "",
                    cccd: p.cccd ?? "",
                    ngayCapCccd: p.ngayCapCccd ?? "",
                    noiCapCccd: p.noiCapCccd ?? "",
                    diaChi: p.diaChi ?? "",
                    mst: p.mst ?? "",
                    dienThoai: p.dienThoai ?? "",
                    stk: p.stk ?? "",
                    nganHang: p.nganHang ?? "",
                  });
                }
                setEmployeeView(employeeView === "profile" ? "market" : "profile");
              }}
              className={`p-2 rounded-lg transition-colors ${
                employeeView === "profile"
                  ? "text-indigo-600 bg-indigo-50"
                  : "text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
              }`}
              title="Thông tin cá nhân">
              <Users className="w-4 h-4" />
            </button>
            <button
              onClick={() => setEmployeeView(employeeView === "leaderboard" ? "market" : "leaderboard")}
              className={`p-2 rounded-lg transition-colors ${
                employeeView === "leaderboard"
                  ? "text-yellow-500 bg-yellow-50"
                  : "text-gray-400 hover:text-yellow-500 hover:bg-yellow-50"
              }`}
              title="Bảng xếp hạng">
              <Trophy className="w-4 h-4" />
            </button>
            <button onClick={() => fetchAll()} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-gray-100 rounded-lg transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={handleLogout} className="p-2 text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-lg transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-6 sm:space-y-10">

        {/* ── Bộ chọn tháng ── */}
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-gray-400 shrink-0" />
          <div className="flex items-center gap-1 overflow-x-auto pb-0.5 hide-scrollbar">
            {availableMonths.map((ym) => (
              <button
                key={ym}
                onClick={() => setSelectedMonth(ym)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  selectedMonth === ym
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {monthLabel(ym)}
                {ym === currentYM() && " ●"}
              </button>
            ))}
          </div>
        </div>

        {/* ══ PROFILE VIEW ══ */}
        {employeeView === "profile" && (() => {
          const empProfileForm = empProfileFormState;
          const empFields: { key: keyof EmployeeProfile; label: string; type?: string; placeholder: string }[] = [
            { key: "hoTen", label: "Họ và tên đầy đủ", placeholder: "Nguyễn Văn A" },
            { key: "cccd", label: "Số CCCD / CMND", placeholder: "012345678901" },
            { key: "ngayCapCccd", label: "Ngày cấp", type: "date", placeholder: "" },
            { key: "noiCapCccd", label: "Nơi cấp", placeholder: "Công an tỉnh Bình Định" },
            { key: "diaChi", label: "Địa chỉ thường trú", placeholder: "Số 1, đường ABC, phường XYZ..." },
            { key: "mst", label: "Mã số thuế (MST)", placeholder: "1234567890" },
            { key: "dienThoai", label: "Số điện thoại", placeholder: "0912 345 678" },
            { key: "stk", label: "Số tài khoản ngân hàng", placeholder: "1234567890" },
            { key: "nganHang", label: "Ngân hàng", placeholder: "Vietcombank, BIDV, VPBank..." },
          ];

          const handleSaveEmpProfile = async () => {
            if (!currentEmployee) return;
            setEmpProfileSaving(true);
            const body: Record<string, unknown> = { profile: empProfileForm };
            if (empProfileForm.hoTen?.trim()) body.name = empProfileForm.hoTen.trim();
            const res = await fetch(`/api/employees/${currentEmployee.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            });
            if (res.ok) {
              const updated = await res.json();
              setCurrentEmployee(updated);
              fetchAll();
              setEmpProfileSaving(false);
              setEmpProfileSaved(true);
              setTimeout(() => setEmpProfileSaved(false), 2500);
            } else {
              setEmpProfileSaving(false);
              alert("Lưu thất bại, vui lòng thử lại.");
            }
          };

          return (
            <div className="pb-8">
              {/* Header card */}
              <div className="relative overflow-hidden rounded-2xl mb-5 bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-5 shadow-lg">
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/10" />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="text-4xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h5M14 14h3"/></svg></div>
                  <div>
                    <p className="text-white/80 text-xs font-medium">Hồ sơ cá nhân</p>
                    <h2 className="text-white font-black text-xl leading-tight">
                      {currentEmployee?.profile?.hoTen || currentEmployee?.name}
                    </h2>
                    <p className="text-white/70 text-xs mt-0.5">Cập nhật thông tin để nhận lương đúng hạn</p>
                  </div>
                </div>
              </div>

              {/* Form */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-50">
                  {empFields.map((f) => {
                    const val = empProfileForm[f.key] ?? "";
                    return (
                      <div key={f.key} className="px-4 py-3">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider block mb-1">
                          {f.label}
                        </label>
                        <input
                          type={f.type ?? "text"}
                          className="w-full bg-gray-50 rounded-xl px-3 py-2.5 text-sm text-gray-800 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-300 transition-all"
                          placeholder={f.placeholder}
                          value={val}
                          onChange={(e) => setEmpProfileFormState(prev => ({ ...prev, [f.key]: e.target.value }))}
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="px-4 py-4 bg-gray-50 border-t border-gray-100">
                  <button
                    onClick={handleSaveEmpProfile}
                    disabled={empProfileSaving}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 shadow-sm"
                  >
                    {empProfileSaving ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Đang lưu...</>
                    ) : empProfileSaved ? (
                      <><CheckCircle className="w-4 h-4" /> Đã lưu thành công!</>
                    ) : (
                      <><Save className="w-4 h-4" /> Lưu thông tin</>
                    )}
                  </button>
                  <p className="text-center text-xs text-gray-400 mt-2">
                    Thông tin sẽ được dùng để xác minh và thanh toán lương
                  </p>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ══ LEADERBOARD VIEW ══ */}
        {employeeView === "leaderboard" && (() => {
          // Tính tổng thu nhập APPROVED của mỗi nhân viên trong tháng chọn
          const rankMap = new Map<string, { name: string; earned: number; jobCount: number }>();
          for (const emp of employees) {
            rankMap.set(emp.id, { name: emp.name, earned: 0, jobCount: 0 });
          }
          for (const job of jobs) {
            for (const a of job.assignments) {
              if (a.status !== "APPROVED") continue;
              const jm = job.month || job.createdAt.slice(0, 7);
              if (getSalaryMonth(jm, a.approvedAt) !== selectedMonth) continue;
              const entry = rankMap.get(a.employeeId);
              if (entry) {
                entry.earned += a.salaryEarned;
                entry.jobCount += 1;
              }
            }
          }
          const ranked = Array.from(rankMap.values())
            .filter((e) => e.earned > 0)
            .sort((a, b) => b.earned - a.earned);

          const medals = [
            <svg key="1" className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="15" r="6"/><path d="M8.56 2.9A7 7 0 0 1 18.71 9l1.6 2.77M3.69 9l1.61-2.77A7 7 0 0 1 13.14 2.1"/><text x="9.5" y="20" fontSize="8" strokeWidth="0.5" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text></svg>,
            <svg key="2" className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="15" r="6"/><path d="M8.56 2.9A7 7 0 0 1 18.71 9l1.6 2.77M3.69 9l1.61-2.77A7 7 0 0 1 13.14 2.1"/><text x="9.5" y="20" fontSize="8" strokeWidth="0.5" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text></svg>,
            <svg key="3" className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="15" r="6"/><path d="M8.56 2.9A7 7 0 0 1 18.71 9l1.6 2.77M3.69 9l1.61-2.77A7 7 0 0 1 13.14 2.1"/><text x="9.5" y="20" fontSize="8" strokeWidth="0.5" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text></svg>,
          ];
          const topEarned = ranked[0]?.earned ?? 1;

          return (
            <div>
              {/* Header */}
              <div className="relative overflow-hidden rounded-2xl mb-6 bg-gradient-to-br from-yellow-400 via-amber-400 to-orange-400 p-5 shadow-lg">
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/10" />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="text-4xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4"/><path d="M6 9a6 6 0 0 0 12 0V3H6v6Z"/><path d="M12 15v3M9 18h6"/></svg></div>
                  <div>
                    <p className="text-white/80 text-xs font-medium">Bảng xếp hạng</p>
                    <h2 className="text-white font-black text-xl leading-tight">{monthLabel(selectedMonth)}</h2>
                    <p className="text-white/70 text-xs mt-0.5">{ranked.length} nhân viên có thu nhập</p>
                  </div>
                </div>
              </div>

              {ranked.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <Trophy className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Chưa có dữ liệu tháng này</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {ranked.map((entry, idx) => {
                    const isMe = entry.name === currentEmployee?.name;
                    const barPct = Math.max(8, (entry.earned / topEarned) * 100);
                    const rankColors = [
                      "from-yellow-50 to-amber-50 border-yellow-300",
                      "from-gray-50 to-slate-50 border-gray-300",
                      "from-orange-50 to-amber-50 border-orange-300",
                    ];
                    const barColors = ["bg-yellow-400", "bg-gray-400", "bg-orange-400", "bg-blue-400"];
                    const cardClass = idx < 3
                      ? `bg-gradient-to-r ${rankColors[idx]} border`
                      : isMe
                      ? "bg-blue-50 border border-blue-200"
                      : "bg-white border border-gray-100";

                    return (
                      <div key={entry.name} className={`rounded-2xl p-4 ${cardClass} ${isMe ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}>
                        <div className="flex items-center gap-3 mb-2">
                          {/* Rank */}
                          <div className="w-8 shrink-0 text-center">
                            {idx < 3
                              ? <span className="text-2xl leading-none">{medals[idx]}</span>
                              : <span className="text-sm font-black text-gray-400">#{idx + 1}</span>}
                          </div>
                          {/* Name */}
                          <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm truncate ${isMe ? "text-blue-700" : "text-gray-900"}`}>
                              {entry.name} {isMe && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold ml-1">Tôi</span>}
                            </p>
                            <p className="text-xs text-gray-400">{entry.jobCount} job hoàn thành</p>
                          </div>
                          {/* Earned */}
                          <div className="text-right shrink-0">
                            <p className={`font-black text-base ${idx === 0 ? "text-yellow-600" : idx === 1 ? "text-gray-500" : idx === 2 ? "text-orange-500" : isMe ? "text-blue-600" : "text-gray-800"}`}>
                              {new Intl.NumberFormat("vi-VN").format(entry.earned)}
                            </p>
                            <p className="text-[10px] text-gray-400">đồng</p>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${barColors[Math.min(idx, 3)]}`}
                            style={{ width: `${barPct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* ══ MARKET VIEW ══ */}
        {employeeView === "market" && (
        <>

        {/* ── Stats Banner ── */}
        {(() => {
          // Lọc assignment theo tháng lương được chọn
          const jobEarnedInMonth = myAssignments
            .filter(({ job, assignment }) => {
              if (assignment.status !== "APPROVED") return false;
              const jm = job.month || job.createdAt.slice(0, 7);
              return getSalaryMonth(jm, assignment.approvedAt) === selectedMonth;
            })
            .reduce((sum, { assignment }) => sum + assignment.salaryEarned, 0);
          // Cộng thêm lương thủ công của tháng đang xem
          const myManualBanner = (manualEntries[selectedMonth] ?? []).filter(e => e.empId === currentEmployee?.id);
          const earnedInMonth = jobEarnedInMonth + myManualBanner.reduce((s, e) => s + e.amount, 0);

          // Đang làm / chờ duyệt: tất cả assignment chưa được duyệt (không lọc theo tháng)
          const inProgress = myAssignments
            .filter(({ assignment }) =>
              assignment.status === "WORKING" || assignment.status === "PENDING_APPROVAL"
            )
            .reduce((sum, { assignment }) => sum + assignment.salaryEarned, 0);

          const availableJobs = jobs.filter((job) => {
            if (job.jobType === "mini") {
              const claimedUnits = job.assignments.reduce((s, a) => s + (a.units ?? 1), 0);
              return (
                claimedUnits < (job.totalUnits ?? 0) &&
                !job.assignments.some((a) => a.employeeId === currentEmployee?.id)
              );
            }
            const claimed = job.assignments.reduce((a, b) => a + b.percentage, 0);
            return claimed < 100 && !job.assignments.some((a) => a.employeeId === currentEmployee?.id);
          });

          const availableValue = availableJobs.reduce((sum, job) => {
            if (job.jobType === "mini") {
              const remaining = (job.totalUnits ?? 0) - job.assignments.reduce((s, a) => s + (a.units ?? 1), 0);
              return sum + (job.unitPrice ?? 0) * remaining;
            }
            const claimed = job.assignments.reduce((a, b) => a + b.percentage, 0);
            return sum + (job.totalSalary * (100 - claimed)) / 100;
          }, 0);

          return (
            <div className="flex flex-col sm:grid sm:grid-cols-3 gap-3 sm:gap-4">
              {/* Đã nhận - full width trên mobile */}
              <div className="relative overflow-hidden rounded-2xl shadow-lg" style={{ aspectRatio: '21/9' }}>
                <img src="/job-done.webp" alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="relative px-5 py-4 text-white h-full flex flex-col justify-center">
                  <p className="text-xs sm:text-sm font-medium mb-1 flex items-center gap-1.5 drop-shadow">
                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Đã nhận — {monthLabel(selectedMonth)}
                  </p>
                  <p className="text-2xl sm:text-3xl font-black tracking-tight leading-none drop-shadow">
                    {new Intl.NumberFormat("vi-VN").format(earnedInMonth)}
                  </p>
                  <p className="text-xs mt-1 drop-shadow opacity-90">đồng</p>
                </div>
              </div>

              {/* 2 card nhỏ: cùng hàng trên mobile, tách cột trên sm+ */}
              <div className="grid grid-cols-2 sm:contents gap-3 sm:gap-0">
                {/* Đang làm */}
                <div className="relative overflow-hidden rounded-2xl shadow-lg" style={{ aspectRatio: '21/9' }}>
                  <img src="/working.webp" alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="relative px-3 sm:px-5 py-3 sm:py-4 text-white h-full flex flex-col justify-center">
                    <p className="text-[10px] sm:text-sm font-medium mb-0.5 sm:mb-1 flex items-center gap-1 drop-shadow leading-tight">
                      <Clock className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                      <span>Đang làm<span className="hidden sm:inline"> / Chờ duyệt</span></span>
                    </p>
                    <p className="text-lg sm:text-3xl font-black tracking-tight leading-none drop-shadow">
                      {new Intl.NumberFormat("vi-VN").format(inProgress)}
                    </p>
                    <p className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 drop-shadow opacity-90">đồng</p>
                  </div>
                </div>

                {/* Còn trên chợ */}
                <div className="relative overflow-hidden rounded-2xl shadow-lg" style={{ aspectRatio: '21/9' }}>
                  <img src="/job-market.webp" alt="" className="absolute inset-0 w-full h-full object-cover" />
                  <div className="relative px-3 sm:px-5 py-3 sm:py-4 text-white h-full flex flex-col justify-center">
                    <p className="text-[10px] sm:text-sm font-medium mb-0.5 sm:mb-1 flex items-center gap-1 drop-shadow leading-tight">
                      <Briefcase className="w-3 h-3 sm:w-4 sm:h-4 shrink-0" />
                      <span>Trên chợ</span>
                    </p>
                    <p className="text-lg sm:text-3xl font-black tracking-tight leading-none drop-shadow">
                      {new Intl.NumberFormat("vi-VN").format(availableValue)}
                    </p>
                    <p className="text-[10px] sm:text-xs mt-0.5 sm:mt-1 drop-shadow opacity-90">đồng · {availableJobs.length} job</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Job Market */}
        {(() => {
          if (loading) return <LoadingBlock />;

          const openJobs = jobs.filter((job) => {
            if (job.jobType === "mini") {
              // Mini: still open if total claimed units < totalUnits
              const claimedUnits = job.assignments.reduce((s, a) => s + (a.units ?? 1), 0);
              return claimedUnits < (job.totalUnits ?? 0);
            }
            const claimed = job.assignments.reduce((a, b) => a + b.percentage, 0);
            // Hiện trên chợ nếu còn % chưa được nhận (kể cả khi mình đang làm 1 phần)
            return claimed < 100;
          });

          const myActiveJobs = jobs.filter((job) =>
            job.assignments.some(
              (a) => a.employeeId === currentEmployee?.id && (a.status === "WORKING" || a.status === "PENDING_APPROVAL")
            )
          );

          const myDoneJobs = jobs.filter((job) =>
            job.assignments.some(
              (a) => a.employeeId === currentEmployee?.id && a.status === "APPROVED"
            )
          );

          // Lương thủ công của tháng đang chọn
          const myManualInMonth = (manualEntries[selectedMonth] ?? []).filter(e => e.empId === currentEmployee?.id);

          const JobCard = ({ job, theme }: { job: Job; theme: "amber" | "blue" | "green" }) => {
            const isMini = job.jobType === "mini";
            const categoryLabel = getJobCategoryLabel(job);
            const categoryBadgeClass = getJobCategoryBadgeClass(categoryLabel);
            const categorySurfaceClass = getJobCategorySurfaceClass(categoryLabel);
            const totalClaimed = isMini
              ? job.assignments.reduce((s, a) => s + (a.units ?? 1), 0)
              : job.assignments.reduce((a, b) => a + b.percentage, 0);
            const progressPct = isMini
              ? (totalClaimed / (job.totalUnits ?? 1)) * 100
              : totalClaimed;
            const myAssignment = job.assignments.find(
              (a) => a.employeeId === currentEmployee?.id && (a.status === "WORKING" || a.status === "PENDING_APPROVAL")
            ) ?? job.assignments.find((a) => a.employeeId === currentEmployee?.id);
            const myAssignments_job = job.assignments.filter((a) => a.employeeId === currentEmployee?.id);
            const myTotalUnits = myAssignments_job.reduce((s, a) => s + (a.units ?? 1), 0);
            const myApprovedAssignments = job.assignments.filter(
              (a) => a.employeeId === currentEmployee?.id && a.status === "APPROVED"
            );
            const myApprovedPct = isMini
              ? myApprovedAssignments.reduce((s, a) => s + (a.units ?? 1), 0)
              : myApprovedAssignments.reduce((s, a) => s + a.percentage, 0);

            const { cardBg, accentText, barBg, barFill, btnClass } = categorySurfaceClass;

            const badgeBg = theme === "amber"
              ? isMini ? "bg-violet-100 text-violet-700" : "bg-orange-100 text-orange-700"
              : theme === "blue"
              ? isMini ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"
              : isMini ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700";

            const badgeLabel: React.ReactNode = theme === "green"
              ? <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Xong</>
              : theme === "blue"
                ? isMini ? `${myTotalUnits} clip` : `${myAssignment?.percentage ?? 0}%`
                : isMini ? `Còn ${(job.totalUnits ?? 0) - totalClaimed}` : `Còn ${100 - totalClaimed}%`;

            const jobMeta = !isMini
              ? [
                  job.projectName,
                  job.episodeLabel ? `Tập ${job.episodeLabel.replace(/^tập\s*/i, "")}` : null,
                  job.dayLabel ? `Ngày ${job.dayLabel.replace(/^ngày\s*/i, "")}` : null,
                  job.workUnits ? `${job.workUnits} ${getWorkUnitLabel(job.workUnit as StandardWorkUnit | undefined, job.workUnits)}` : null,
                ].filter(Boolean).join(" · ")
              : [job.projectName, job.totalUnits ? `${job.totalUnits} clip` : null].filter(Boolean).join(" · ");

            return (
              <div className={`relative flex flex-col rounded-2xl p-4 min-h-[160px] overflow-hidden ${cardBg}`}>
                {/* Subtle decorative circle */}
                <div className={`absolute -top-5 -right-5 w-20 h-20 rounded-full opacity-20 ${barFill}`} />

                {/* Top row: type icon + badge */}
                <div className="flex items-start justify-between gap-1 mb-2 relative z-10">
                  <span className="text-base leading-none">{isMini ? <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/></svg> : theme === "amber" && job.expiresAt ? <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> : <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg>}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeBg}`}>
                    {badgeLabel}
                  </span>
                </div>

                {/* Title */}
                <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 relative z-10 flex-1">
                  {job.title}
                </h3>

                <div className="relative z-10 mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${categoryBadgeClass}`}>
                    {categoryLabel}
                  </span>
                  {jobMeta && <span className="text-[11px] text-gray-500 line-clamp-1">{jobMeta}</span>}
                </div>

                {/* Date for onsite */}
                {theme === "amber" && job.expiresAt && (
                  <p className={`text-[11px] mt-1 relative z-10 font-medium ${accentText}`}>
                    <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> {new Date(job.expiresAt).getDate()}/{new Date(job.expiresAt).getMonth() + 1}/{new Date(job.expiresAt).getFullYear()}
                  </p>
                )}

                {/* Salary */}
                <p className={`font-extrabold text-base mt-2 relative z-10 leading-tight ${accentText}`}>
                  {isMini
                    ? `${new Intl.NumberFormat("vi-VN").format(job.unitPrice ?? 0)}đ/clip`
                    : formatCurrency(job.totalSalary)}
                </p>

                {/* My earning / clip info */}
                {myAssignment && !isMini && (
                  <p className="text-gray-500 text-[11px] font-medium relative z-10">
                    → {formatCurrency(myAssignment.salaryEarned)} của tôi
                  </p>
                )}
                {isMini && myTotalUnits > 0 && (
                  <p className="text-gray-500 text-[11px] font-medium relative z-10">
                    → {myTotalUnits} clip · {formatCurrency(myTotalUnits * (job.unitPrice ?? 0))}
                  </p>
                )}
                {isMini && (
                  <p className="text-gray-400 text-[11px] relative z-10">
                    {totalClaimed}/{job.totalUnits} clip đã nhận
                  </p>
                )}

                {/* Progress bar */}
                <div className={`w-full rounded-full h-1.5 mt-2 relative z-10 ${barBg}`}>
                  <div className={`h-1.5 rounded-full transition-all ${barFill}`} style={{ width: `${Math.min(progressPct, 100)}%` }} />
                </div>

                {/* Action row */}
                <div className="flex items-center justify-between mt-3 gap-1.5 relative z-10">
                  {/* Bulk checkbox — claim mode (amber, non-mini only) */}
                  {bulkMode === "claim" && theme === "amber" && !isMini && (
                    <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-amber-500 cursor-pointer"
                        checked={bulkSelected.has(job.id)}
                        onChange={(e) => {
                          const next = new Set(bulkSelected);
                          e.target.checked ? next.add(job.id) : next.delete(job.id);
                          setBulkSelected(next);
                        }}
                      />
                      <span className="text-xs font-medium text-gray-700">Chọn</span>
                    </label>
                  )}
                  {/* Bulk checkbox — done mode (blue, WORKING non-mini only) */}
                  {bulkMode === "done" && theme === "blue" && !isMini && myAssignment?.status === "WORKING" && (
                    <label className="flex items-center gap-1.5 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-blue-500 cursor-pointer"
                        checked={bulkSelected.has(`${job.id}:${myAssignment.id}`)}
                        onChange={(e) => {
                          const key = `${job.id}:${myAssignment.id}`;
                          const next = new Set(bulkSelected);
                          e.target.checked ? next.add(key) : next.delete(key);
                          setBulkSelected(next);
                        }}
                      />
                      <span className="text-xs font-medium text-gray-700">Chọn</span>
                    </label>
                  )}
                  <div className="flex items-center gap-1">
                    {theme === "amber" && myApprovedPct > 0 && (
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${badgeBg}`}>
                        <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> {isMini ? `${myApprovedPct} clip` : `${myApprovedPct}%`}
                      </span>
                    )}
                    {theme === "green" && myApprovedAssignments[0]?.note && (
                      <span className="text-[11px] text-gray-500 flex items-center gap-0.5 max-w-[100px] truncate" title={myApprovedAssignments[0].note}>
                        <MessageSquare className="w-3 h-3 shrink-0" />{myApprovedAssignments[0].note}
                      </span>
                    )}
                    {theme === "blue" && myAssignment?.status === "PENDING_APPROVAL" && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M5 2h14M5 22h14"/><path d="M5 2l7 10 7-10M5 22l7-10 7 10"/></svg> Chờ duyệt</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto">
                    {theme === "amber" && (
                      isMini ? (
                        <button
                          onClick={() => { setMiniClaimJob(job); setMiniClaimUnits("1"); }}
                          className={`flex items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm ${btnClass}`}>
                          Nhận <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => setSelectedJob(job)}
                          className={`flex items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm ${btnClass}`}>
                          {myApprovedPct > 0 ? "Thêm" : "Nhận"} <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                    {theme === "blue" && myAssignment?.status === "WORKING" && (
                      <button onClick={() => {
                        if (isMini) {
                          setMiniDoneModal({ job, assignment: myAssignment });
                          setMiniDoneUnits(String(myAssignment.units ?? 1));
                        } else {
                          handleMarkDone(job.id, myAssignment.id);
                        }
                      }} disabled={submitting}
                        className={`flex items-center gap-0.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors shadow-sm disabled:opacity-60 ${btnClass}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" /> Xong
                      </button>
                    )}
                    {theme === "blue" && myAssignment?.status === "WORKING" && !isMini && (
                      <button
                        onClick={() => { setSharingItem({ jobId: job.id, assignmentId: myAssignment.id, jobTitle: job.title, currentPct: myAssignment.percentage }); setSharePercInput(""); }}
                        disabled={submitting}
                        className="flex items-center gap-0.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors">
                        <Share2 className="w-3 h-3" /> Nhường
                      </button>
                    )}
                    {theme === "blue" && isMini && myAssignment?.status === "WORKING" && (
                      <button
                        onClick={() => { setSharingItem({ jobId: job.id, assignmentId: myAssignment.id, jobTitle: job.title, currentPct: 0, isMini: true, currentUnits: myAssignment.units ?? 1 }); setSharePercInput(""); }}
                        disabled={submitting}
                        className="flex items-center gap-0.5 bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors">
                        <Share2 className="w-3 h-3" /> Nhường
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-8">
              {/* Đang làm */}
              {myActiveJobs.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-base font-bold text-blue-700 flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                      Đang làm ({myActiveJobs.length})
                    </h2>
                    <button
                      onClick={() => {
                        if (bulkMode === "done") { setBulkMode(null); setBulkSelected(new Set()); }
                        else { setBulkMode("done"); setBulkSelected(new Set()); }
                      }}
                      className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                        bulkMode === "done"
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-blue-600 border-blue-300 hover:border-blue-500"
                      }`}
                    >
                      {bulkMode === "done" ? "Huỷ chọn" : "Chọn nhiều"}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {myActiveJobs.map((job) => <JobCard key={job.id} job={job} theme="blue" />)}
                  </div>
                </div>
              )}

              {/* Chợ việc — nhóm theo ngày quay */}
              <div>
                <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                  <h2 className="text-base font-bold text-amber-600 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                    Chợ Việc Làm ({openJobs.length})
                  </h2>
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <button
                      onClick={() => {
                        if (bulkMode === "claim") { setBulkMode(null); setBulkSelected(new Set()); }
                        else { setBulkMode("claim"); setBulkSelected(new Set()); }
                      }}
                      className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors ${
                        bulkMode === "claim"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "bg-white text-amber-600 border-amber-300 hover:border-amber-500"
                      }`}
                    >
                      {bulkMode === "claim" ? "Huỷ chọn" : "Chọn nhiều"}
                    </button>
                    {(["all", "onsite", "postprod", "mini"] as const).map((f) => (
                      <button key={f} onClick={() => setMarketFilter(f)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          marketFilter === f
                            ? f === "onsite" ? "bg-orange-500 text-white border-orange-500"
                              : f === "postprod" ? "bg-blue-600 text-white border-blue-600"
                              : f === "mini" ? "bg-purple-600 text-white border-purple-600"
                              : "bg-gray-800 text-white border-gray-800"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                        }`}>
                        {f === "all" ? "Tất cả" : f === "onsite" ? <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Đi quay</> : f === "postprod" ? <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M7 6V2M12 6V2M17 6V2"/></svg> Hậu kỳ</> : <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/></svg> Mini</>}
                      </button>
                    ))}
                  </div>
                </div>
                {(() => {
                  const filteredJobs = openJobs.filter(job =>
                    marketFilter === "all" ? true
                    : marketFilter === "onsite" ? !!job.expiresAt && job.jobType !== "mini"
                    : marketFilter === "postprod" ? !job.expiresAt && job.jobType !== "mini"
                    : job.jobType === "mini"
                  );
                  if (filteredJobs.length === 0) return <EmptyBlock text="Không có job nào phù hợp." />;
                  // Nhóm job theo groupId; job lẻ (không có groupId) vào nhóm "standalone"
                  const groups = new Map<string, { label: string; date?: string; jobs: Job[] }>();
                  for (const job of filteredJobs) {
                    if (job.groupId) {
                      if (!groups.has(job.groupId)) {
                        // Lấy ngày từ expiresAt của job tại chỗ trong nhóm (tìm trong toàn bộ openJobs)
                        const onSiteJob = openJobs.find(j => j.groupId === job.groupId && j.expiresAt);
                        let dateLabel = "";
                        if (onSiteJob?.expiresAt) {
                          const d = new Date(onSiteJob.expiresAt);
                          dateLabel = `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
                        }
                        groups.set(job.groupId, { label: job.groupName ?? job.groupId, date: dateLabel, jobs: [] });
                      }
                      groups.get(job.groupId)!.jobs.push(job);
                    } else {
                      const key = "__standalone__";
                      if (!groups.has(key)) groups.set(key, { label: "", jobs: [] });
                      groups.get(key)!.jobs.push(job);
                    }
                  }

                  return (
                    <div className="space-y-6">
                      {Array.from(groups.entries()).map(([groupId, group]) => (
                        <div key={groupId}>
                          {groupId !== "__standalone__" && (
                            <div className="flex items-center gap-2 mb-3">
                              <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-3 py-2 flex-1">
                                <CalendarDays className="w-4 h-4 text-orange-500 shrink-0" />
                                <div>
                                  <p className="text-sm font-bold text-orange-700 leading-none">{group.label}</p>
                                  {group.date && (
                                    <p className="text-xs text-orange-500 mt-0.5"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg> Ngày quay: {group.date}</p>
                                  )}
                                </div>
                                <span className="ml-auto text-xs text-orange-500 font-medium shrink-0">{group.jobs.length} job</span>
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {group.jobs.map((job) => <JobCard key={job.id} job={job} theme="amber" />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Đã hoàn thành */}
              {(myDoneJobs.length > 0 || myManualInMonth.length > 0) && (
                <div>
                  <h2 className="text-base font-bold text-green-700 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                    Đã hoàn thành ({myDoneJobs.length + myManualInMonth.length})
                  </h2>
                  {myDoneJobs.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                      {myDoneJobs.map((job) => <JobCard key={job.id} job={job} theme="green" />)}
                    </div>
                  )}
                  {myManualInMonth.length > 0 && (
                    <div className="space-y-2">
                      {myManualInMonth.map((entry) => (
                        <div key={entry.id} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                          <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center text-sm shrink-0"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4.5"/></svg></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800 truncate">{entry.title}</p>
                            {entry.note && <p className="text-xs text-gray-400 truncate">{entry.note}</p>}
                          </div>
                          <p className="text-sm font-bold text-emerald-700 shrink-0">+{new Intl.NumberFormat("vi-VN").format(entry.amount)}đ</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        </> /* end market view */
        )} {/* end employeeView === "market" */}

        {/* ── Floating Bulk Action Bar ── */}
        {bulkMode && bulkSelected.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-4 px-4 pointer-events-none">
            <div className="pointer-events-auto bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 max-w-sm w-full">
              <span className="text-sm font-semibold flex-1">
                {bulkSelected.size} job đã chọn
              </span>
              {bulkMode === "claim" && (
                <button
                  onClick={handleBulkClaim}
                  disabled={submitting}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  {submitting ? "Đang nhận..." : `Nhận ${bulkSelected.size} job`}
                </button>
              )}
              {bulkMode === "done" && (
                <button
                  onClick={handleBulkDone}
                  disabled={submitting}
                  className="flex items-center gap-1.5 bg-blue-500 hover:bg-blue-400 disabled:opacity-60 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {submitting ? "Đang xong..." : `Xong ${bulkSelected.size} job`}
                </button>
              )}
              <button
                onClick={() => { setBulkMode(null); setBulkSelected(new Set()); }}
                className="text-gray-400 hover:text-white p-1 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        )}

      </main>

      {/* Claim Modal */}
      {selectedJob && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full max-w-md sm:m-4 shadow-xl">
            {/* drag handle mobile */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-5 pb-6 pt-3 sm:p-6">
              <h3 className="text-lg font-bold mb-0.5 leading-snug">{selectedJob.title}</h3>
              <p className="text-gray-500 text-sm mb-5">Ngân sách: <span className="font-semibold text-gray-900">{formatCurrency(selectedJob.totalSalary)}</span></p>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chọn % công việc bạn đảm nhận:</label>
              <div className="grid grid-cols-4 gap-2 mb-4">
                {[25, 50, 75, 100].map((pct) => {
                  const claimed = selectedJob.assignments.reduce((a, b) => a + b.percentage, 0);
                  const disabled = claimed + pct > 100;
                  return (
                    <button key={pct} disabled={disabled} onClick={() => setClaimPercentage(pct)}
                      className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                        claimPercentage === pct ? "bg-blue-600 text-white border-blue-600"
                        : disabled ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                        : "bg-white text-gray-700 border-gray-200 hover:border-blue-400 active:bg-blue-50"
                      }`}>
                      {pct}%
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 rounded-xl">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer shrink-0">
                  <input type="radio" checked={claimPercentage === -1} onChange={() => setClaimPercentage(-1)} className="accent-blue-600 w-4 h-4" />
                  Tự nhập:
                </label>
                <input type="number" inputMode="numeric" min="1" max="100" value={customPercentage}
                  onChange={(e) => { setClaimPercentage(-1); setCustomPercentage(e.target.value); }}
                  onFocus={() => setClaimPercentage(-1)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  placeholder="Nhập % (VD: 30)" />
              </div>
              <div className="bg-blue-50 p-3 rounded-xl mb-5 flex justify-between items-center">
                <span className="text-sm text-blue-700">Dự kiến thu nhập</span>
                <span className="text-lg font-black text-blue-600">
                  {formatCurrency((selectedJob.totalSalary * (claimPercentage === -1 ? Number(customPercentage) || 0 : claimPercentage)) / 100)}
                </span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => { setSelectedJob(null); setClaimPercentage(100); setCustomPercentage(""); }}
                  className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-medium border border-gray-200 transition-colors">Hủy</button>
                <button onClick={handleClaimJob} disabled={submitting}
                  className="flex-2 px-5 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-60 text-white rounded-xl font-semibold transition-colors">
                  {submitting ? "Đang xử lý..." : "Xác nhận"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Mini Claim modal ── */}
      {miniClaimJob && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl">
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-5 pb-6 pt-3 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/></svg></div>
                <div>
                  <h3 className="font-bold text-gray-900">Nhận clip</h3>
                  <p className="text-xs text-gray-500 truncate max-w-[200px]">{miniClaimJob.title}</p>
                </div>
              </div>
              {(() => {
                const remaining = (miniClaimJob.totalUnits ?? 0) - miniClaimJob.assignments.reduce((s, a) => s + (a.units ?? 1), 0);
                return (
                  <>
                    <p className="text-sm text-gray-600 mb-1">
                      Còn <span className="font-bold text-purple-600">{remaining} clip</span> · {new Intl.NumberFormat("vi-VN").format(miniClaimJob.unitPrice ?? 0)}đ/clip
                    </p>
                    {Number(miniClaimUnits) > 0 && (
                      <p className="text-xs text-green-600 mb-3 font-medium">
                        → Nhận {miniClaimUnits} clip · {formatCurrency(Number(miniClaimUnits) * (miniClaimJob.unitPrice ?? 0))}
                      </p>
                    )}
                    <div className="grid grid-cols-4 gap-2 mb-3">
                      {[1, 2, 3, Math.min(5, remaining), Math.min(10, remaining), remaining]
                        .filter((v, i, a) => v > 0 && v <= remaining && a.indexOf(v) === i)
                        .map((n) => (
                          <button key={n}
                            onClick={() => setMiniClaimUnits(String(n))}
                            className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                              Number(miniClaimUnits) === n ? "bg-purple-600 text-white border-purple-600"
                              : "bg-white text-gray-700 border-gray-200 hover:border-purple-400"
                            }`}>
                            {n}
                          </button>
                        ))}
                    </div>
                    <input type="number" min={1} max={remaining}
                      value={miniClaimUnits} onChange={(e) => setMiniClaimUnits(e.target.value)}
                      placeholder={`Hoặc nhập 1–${remaining}`}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-purple-400 text-sm mb-4" />
                  </>
                );
              })()}
              <div className="flex gap-3">
                <button onClick={() => { setMiniClaimJob(null); setMiniClaimUnits("1"); }}
                  className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">
                  Huỷ
                </button>
                <button onClick={handleMiniClaim} disabled={submitting}
                  className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white text-sm font-bold transition-colors">
                  {submitting ? "Đang nhận…" : <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Nhận</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Share / Nhường job modal ── */}
      {sharingItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl">
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1 bg-gray-300 rounded-full" />
            </div>
            <div className="px-5 pb-6 pt-3 sm:p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center shrink-0">
                  <Share2 className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 leading-snug">Nhường việc ra chợ</h3>
                  <p className="text-sm text-gray-500 line-clamp-1">{sharingItem.jobTitle}</p>
                </div>
              </div>
              {sharingItem.isMini ? (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    Bạn đang giữ <span className="font-bold text-purple-600">{sharingItem.currentUnits} clip</span>. Nhập số clip muốn nhường lại:
                  </p>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[1, Math.ceil((sharingItem.currentUnits ?? 1) / 2), sharingItem.currentUnits ?? 1]
                      .filter((v, i, a) => v > 0 && a.indexOf(v) === i)
                      .map((n) => (
                        <button key={n}
                          onClick={() => setSharePercInput(String(n))}
                          className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                            Number(sharePercInput) === n ? "bg-orange-500 text-white border-orange-500"
                            : "bg-white text-gray-700 border-gray-200 hover:border-orange-400"
                          }`}>
                          {n}
                        </button>
                      ))}
                  </div>
                  <input type="number" min={1} max={sharingItem.currentUnits ?? 1}
                    value={sharePercInput} onChange={(e) => setSharePercInput(e.target.value)}
                    placeholder={`Hoặc nhập 1–${sharingItem.currentUnits}`}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 text-sm mb-4" />
                  {Number(sharePercInput) === (sharingItem.currentUnits ?? 1) && (
                    <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-3">
                      <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Nhường hết {sharingItem.currentUnits} clip — bạn sẽ rời khỏi job này.
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-600 mb-4">
                    Bạn đang giữ <span className="font-bold text-blue-600">{sharingItem.currentPct}%</span>. Nhập % muốn nhường lại để người khác nhận:
                  </p>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[25, 50, 75, sharingItem.currentPct].filter((v, i, a) => a.indexOf(v) === i).map((pct) => {
                      const disabled = pct > sharingItem.currentPct;
                      return (
                        <button key={pct} disabled={disabled}
                          onClick={() => setSharePercInput(String(pct))}
                          className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                            Number(sharePercInput) === pct ? "bg-orange-500 text-white border-orange-500"
                            : disabled ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                            : "bg-white text-gray-700 border-gray-200 hover:border-orange-400"
                          }`}>
                          {pct}%
                        </button>
                      );
                    })}
                  </div>
                  <input type="number" min={1} max={sharingItem.currentPct}
                    value={sharePercInput} onChange={(e) => setSharePercInput(e.target.value)}
                    placeholder={`Hoặc nhập 1–${sharingItem.currentPct}`}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 text-sm mb-4" />
                  {Number(sharePercInput) === sharingItem.currentPct && (
                    <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-3">
                      <svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Nhường hết {sharingItem.currentPct}% — bạn sẽ rời khỏi job này.
                    </p>
                  )}
                </>
              )}
              <div className="flex gap-3">
                <button onClick={() => { setSharingItem(null); setSharePercInput(""); }}
                  className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-xl font-medium border border-gray-200 transition-colors">Hủy</button>
                <button onClick={handleShareJob} disabled={submitting || !sharePercInput}
                  className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white rounded-xl font-semibold transition-colors">
                  {submitting ? "Đang xử lý..." : "Nhường"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
      {/* ── Modal báo xong clip mini ── */}
      {miniDoneModal && (() => {
        const maxUnits = miniDoneModal.assignment.units ?? 1;
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setMiniDoneModal(null)}>
            <div className="bg-white w-full sm:max-w-sm sm:rounded-2xl rounded-t-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 bg-gray-300 rounded-full" /></div>
              <div className="px-5 pb-6 pt-3 sm:p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center text-xl"><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 4v16M18 4v16M2 8h4M18 8h4M2 12h4M18 12h4M2 16h4M18 16h4"/></svg></div>
                  <div>
                    <h3 className="font-bold text-gray-900">Báo xong clip</h3>
                    <p className="text-xs text-gray-500 line-clamp-1">{miniDoneModal.job.title}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-1">Bạn đang giữ <span className="font-bold text-violet-700">{maxUnits} clip</span>. Nhập số clip đã xong:</p>
                {Number(miniDoneUnits) > 0 && (
                  <p className="text-xs text-green-600 mb-3 font-medium">
                    → {miniDoneUnits} clip · {formatCurrency(Number(miniDoneUnits) * (miniDoneModal.job.unitPrice ?? 0))}
                    {maxUnits - Number(miniDoneUnits) > 0 ? ` · còn ${maxUnits - Number(miniDoneUnits)} clip tiếp tục` : " · xong hết"}
                  </p>
                )}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {[1, Math.ceil(maxUnits / 2), maxUnits]
                    .filter((v, i, a) => v > 0 && v <= maxUnits && a.indexOf(v) === i)
                    .map((n) => (
                      <button key={n} onClick={() => setMiniDoneUnits(String(n))}
                        className={`py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${
                          Number(miniDoneUnits) === n ? "bg-violet-600 text-white border-violet-600" : "bg-white text-gray-700 border-gray-200 hover:border-violet-400"
                        }`}>{n}</button>
                    ))}
                </div>
                <input type="number" min={1} max={maxUnits}
                  value={miniDoneUnits} onChange={(e) => setMiniDoneUnits(e.target.value)}
                  placeholder={`Hoặc nhập 1–${maxUnits}`}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-violet-400 text-sm mb-4" />
                <div className="flex gap-3">
                  <button onClick={() => setMiniDoneModal(null)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors">Huỷ</button>
                  <button
                    onClick={async () => {
                      const units = Number(miniDoneUnits);
                      if (!units || units < 1 || units > maxUnits) { alert(`Nhập số clip hợp lệ (1–${maxUnits})`); return; }
                      await handleMarkDone(miniDoneModal.job.id, miniDoneModal.assignment.id, units);
                      setMiniDoneModal(null);
                    }}
                    disabled={submitting}
                    className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white text-sm font-bold transition-colors">
                    {submitting ? "Đang gửi…" : <><svg className="inline w-[1em] h-[1em] align-[-0.15em] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Gửi duyệt</>}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function EmployeeList({ onLogin, onMounted }: { onLogin: (emp: Employee) => void; onMounted: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/employees")
      .then(async (r) => {
        const payload = await r.json().catch(() => null);
        if (!r.ok) {
          throw new Error(payload?.error || "Không tải được danh sách nhân viên.");
        }
        return Array.isArray(payload) ? payload : [];
      })
      .then((list: Employee[]) => {
        setEmployees(list.filter(e => e.isActive !== false));
        setLoadError(null);
      })
      .catch((error) => {
        setEmployees([]);
        setLoadError(error instanceof Error ? error.message : "Không tải được danh sách nhân viên.");
      })
      .finally(() => setLoading(false));
    onMounted();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingBlock />;
  if (loadError)
    return <p className="text-sm text-red-500 italic">{loadError}</p>;
  if (employees.length === 0)
    return <p className="text-sm text-gray-400 italic">Chưa có nhân viên nào. Giám đốc hãy thêm trước.</p>;

  return (
    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
      {employees.map((emp) => (
        <button key={emp.id} onClick={() => onLogin(emp)}
          className="w-full flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:border-green-400 hover:bg-green-50 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-700 font-bold text-sm">
              {emp.name.charAt(0).toUpperCase()}
            </div>
            <span className="font-medium text-gray-800">{emp.name}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-green-600" />
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "WORKING") return <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Đang làm</span>;
  if (status === "PENDING_APPROVAL") return <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Chờ duyệt</span>;
  if (status === "APPROVED") return <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Đã duyệt</span>;
  return null;
}

function LoadingBlock() {
  return (
    <div className="text-center py-10 bg-white rounded-xl border border-gray-100">
      <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
      <p className="text-gray-400 mt-2 text-sm">Đang tải...</p>
    </div>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return (
    <div className="text-center py-10 bg-white rounded-xl border border-gray-100 border-dashed">
      <p className="text-gray-500">{text}</p>
    </div>
  );
}
