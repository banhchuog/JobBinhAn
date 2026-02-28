"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Job, Employee } from "@/types";
import {
  Briefcase, Users, PlusCircle, CheckCircle2, Clock,
  DollarSign, RefreshCw, LogOut, UserPlus, ChevronRight, Trophy,
  Wallet, BadgeCheck, AlertCircle, CalendarDays, Trash2, Pencil,
  Search, Download, Copy, MessageSquare, X, Sparkles, Timer, Share2, ArrowUpDown,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart, ReferenceLine,
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

const DIRECTOR_PASS = "123";

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

// ── Default shooting positions ──────────────────────────
interface ShootPosition {
  role: string;
  qty: number;
  salary: number;
}

const DEFAULT_SHOOT_POSITIONS: ShootPosition[] = [
  { role: "Đạo diễn", qty: 2, salary: 3_000_000 },
  { role: "Quay phim", qty: 2, salary: 1_200_000 },
  { role: "Ánh sáng", qty: 2, salary: 800_000 },
  { role: "Thu âm hiện trường", qty: 1, salary: 1_000_000 },
];

const DEFAULT_EDIT_SALARY = 3_000_000; // per episode

// ── AI Job Group Parser ─────────────────────────────────
interface PreviewJob {
  title: string;
  description: string;
  totalSalary: number;
  month: string;
  expiresAt?: string;
  isOnSite: boolean;
  jobType?: "standard" | "mini";
  unitPrice?: number;
  totalUnits?: number;
}

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


export default function Home() {
  const [view, setView] = useState<View>(() => {
    if (typeof window !== "undefined" && localStorage.getItem("director_session") === "1") {
      return "DIRECTOR";
    }
    return "LOGIN";
  });
  const [directorPassInput, setDirectorPassInput] = useState("");
  const [passError, setPassError] = useState(false);

  // ── Shared Data ──────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Director State ───────────────────────────────────
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobDesc, setNewJobDesc] = useState("");
  const [newJobSalary, setNewJobSalary] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [directorTab, setDirectorTab] = useState<"jobs" | "employees" | "approvals" | "salary" | "finance">("finance");

  // ── Employee State ───────────────────────────────────
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [claimPercentage, setClaimPercentage] = useState<number>(100);
  const [customPercentage, setCustomPercentage] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYM());
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [employeeView, setEmployeeView] = useState<"market" | "leaderboard">("market");

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
  const [directorMonth, setDirectorMonth] = useState<string>(currentYM());
  const [jobSearch, setJobSearch] = useState("");
  const [jobSort, setJobSort] = useState<"newest" | "oldest">("newest");
  const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set());
  const [marketFilter, setMarketFilter] = useState<"all" | "onsite" | "postprod" | "mini">("all");

  // ── Create mode: "none" | "postprod" | "mini" | "shooting" ──
  const [createMode, setCreateMode] = useState<"none" | "postprod" | "mini" | "shooting">("none");

  // mini (hậu kỳ mini)
  const [newJobType, setNewJobType] = useState<"standard" | "mini">("standard");
  const [newJobUnitPrice, setNewJobUnitPrice] = useState("");
  const [newJobTotalUnits, setNewJobTotalUnits] = useState("");
  const [miniTitle, setMiniTitle] = useState("");
  const [miniDesc, setMiniDesc] = useState("");

  // shooting day
  interface EpisodeDef { name: string; editSalary: number }
  const [shootFilmName, setShootFilmName] = useState("");
  const [shootDay, setShootDay] = useState("");
  const [shootMonth, setShootMonth] = useState("");
  const [shootPositions, setShootPositions] = useState<ShootPosition[]>(
    DEFAULT_SHOOT_POSITIONS.map(p => ({ ...p }))
  );
  // sub-type within shooting: "large" | "mini_clips"
  const [shootSubType, setShootSubType] = useState<"large" | "mini_clips">("large");
  // large: episodes
  const [shootEpisodes, setShootEpisodes] = useState<EpisodeDef[]>([{ name: "Tập 1", editSalary: DEFAULT_EDIT_SALARY }]);
  // mini_clips
  const [shootClipPrice, setShootClipPrice] = useState(String(100_000));
  const [shootClipCount, setShootClipCount] = useState("20");
  const [shootClipTitle, setShootClipTitle] = useState("");

  const [approvingItem, setApprovingItem] = useState<{ jobId: string; assignmentId: string; jobTitle: string; empName: string; salary: number } | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  // ── Manual salary entries ────────────────────────────
  type ManualEntry = { id: string; empId: string; title: string; amount: number; note: string };
  const [manualEntries, setManualEntries] = useState<Record<string, ManualEntry[]>>(() => {
    if (typeof window !== "undefined") {
      try { return JSON.parse(localStorage.getItem("manual_salary") || "{}"); } catch { return {}; }
    }
    return {};
  });
  const [manualModal, setManualModal] = useState<{ emp: Employee } | null>(null);
  const [manualTitle, setManualTitle] = useState("");
  const [manualAmount, setManualAmount] = useState("");
  const [manualNote, setManualNote] = useState("");

  // ── Thu Chi integration ──────────────────────────────
  const [thuChiData, setThuChiData] = useState<ThuChiTransaction[] | null>(null);
  const [thuChiLoading, setThuChiLoading] = useState(false);
  const [thuChiError, setThuChiError] = useState<string | null>(null);
  const [financeView, setFinanceView] = useState<"overview" | "month" | "report">("overview");
  const [chartRefMonth, setChartRefMonth] = useState<"prev" | "curr">("prev");
  const [overviewFilter, setOverviewFilter] = useState<string>(() => {
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  }); // "all" hoặc ym string, mặc định tháng trước

  // ── Revenue (anhemphim.vn) ─────────────────────────────
  const [revenueData, setRevenueData] = useState<Record<string, number> | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState<string | null>(null);

  // ── Share job state ──────────────────────────────────
  const [sharingItem, setSharingItem] = useState<{ jobId: string; assignmentId: string; jobTitle: string; currentPct: number; isMini?: boolean; currentUnits?: number } | null>(null);
  const [sharePercInput, setSharePercInput] = useState("");
  const [miniClaimJob, setMiniClaimJob] = useState<Job | null>(null);
  const [miniClaimUnits, setMiniClaimUnits] = useState("1");

  // ── Group AI modal ───────────────────────────────────
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [groupInput, setGroupInput] = useState("");
  const [previewJobs, setPreviewJobs] = useState<PreviewJob[] | null>(null);
  const [previewGroupName, setPreviewGroupName] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────
  const fetchAll = useCallback(async (autoLoginCheck = false) => {
    setLoading(true);
    try {
      const [jobsRes, empRes] = await Promise.all([
        fetch("/api/jobs"),
        fetch("/api/employees"),
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
    } catch {
      // ignore network errors, keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  // Lần đầu load trang: tự kiểm tra đăng nhập đã lưu
  useEffect(() => {
    fetchAll(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view !== "LOGIN") fetchAll();
  }, [view, fetchAll]);

  // Tự load dữ liệu khi mở trang
  useEffect(() => {
    fetchThuChi();
    fetchRevenue();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tự load lại khi vào tab Finance nếu chưa có data
  useEffect(() => {
    if (directorTab === "finance" && !thuChiData && !thuChiLoading) {
      fetchThuChi();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directorTab]);

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

  // ─── Director: Create Job (postprod lẻ) ─────────────
  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newJobTitle || !newJobSalary) return;
    setSubmitting(true);
    try {
      await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newJobTitle, description: newJobDesc, totalSalary: Number(newJobSalary) }),
      });
      setNewJobTitle(""); setNewJobDesc(""); setNewJobSalary("");
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
  const handleCreateShootingDay = async () => {
    if (!shootFilmName || !shootDay || !shootMonth) return;
    setSubmitting(true);
    try {
      const now = new Date();
      const year = Number(shootMonth) < now.getMonth() + 1 - 3 ? now.getFullYear() + 1 : now.getFullYear();
      const ym = `${year}-${String(Number(shootMonth)).padStart(2, "0")}`;
      const expiresAt = new Date(year, Number(shootMonth) - 1, Number(shootDay), 23, 59, 59, 999).toISOString();
      const groupId = Math.random().toString(36).substring(7);
      const groupName = `Ngày quay ${shootFilmName} ${shootDay}/${shootMonth}`;

      const jobsToCreate = [];

      if (shootSubType === "large") {
        // Tại chỗ: positions
        for (const pos of shootPositions) {
          for (let i = 1; i <= pos.qty; i++) {
            const title = pos.qty > 1
              ? `${pos.role} ${shootFilmName} (${i})`
              : `${pos.role} ${shootFilmName}`;
            jobsToCreate.push({
              title,
              description: `Ngày quay ${shootDay}/${shootMonth} — ${shootFilmName}`,
              totalSalary: pos.salary,
              month: ym,
              expiresAt,
              groupId,
              groupName,
              isOnSite: true,
            });
          }
        }
        // Hậu kỳ: tập phim
        for (const ep of shootEpisodes) {
          jobsToCreate.push({
            title: `${ep.name} — ${shootFilmName}`,
            description: `Hậu kỳ ${ep.name} — ${shootFilmName}`,
            totalSalary: ep.editSalary,
            month: ym,
            groupId,
            groupName,
            isOnSite: false,
          });
        }
      } else {
        // Tại chỗ: positions
        for (const pos of shootPositions) {
          for (let i = 1; i <= pos.qty; i++) {
            const title = pos.qty > 1
              ? `${pos.role} ${shootFilmName} (${i})`
              : `${pos.role} ${shootFilmName}`;
            jobsToCreate.push({
              title,
              description: `Ngày quay ${shootDay}/${shootMonth} — ${shootFilmName}`,
              totalSalary: pos.salary,
              month: ym,
              expiresAt,
              groupId,
              groupName,
              isOnSite: true,
            });
          }
        }
        // Mini clips
        jobsToCreate.push({
          title: shootClipTitle || `Clip ${shootFilmName}`,
          description: `Hậu kỳ clip ngắn — ${shootFilmName}`,
          totalSalary: Number(shootClipPrice) * Number(shootClipCount),
          month: ym,
          groupId,
          groupName,
          isOnSite: false,
          jobType: "mini",
          unitPrice: Number(shootClipPrice),
          totalUnits: Number(shootClipCount),
        });
      }

      await fetch("/api/jobs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobs: jobsToCreate.map(j => ({ ...j, jobType: j.jobType ?? "standard" })) }),
      });

      // Reset shooting form
      setShootFilmName("");
      setShootDay(""); setShootMonth("");
      setShootPositions(DEFAULT_SHOOT_POSITIONS.map(p => ({ ...p })));
      setShootSubType("large");
      setShootEpisodes([{ name: "Tập 1", editSalary: DEFAULT_EDIT_SALARY }]);
      setShootClipPrice(String(100_000)); setShootClipCount("20"); setShootClipTitle("");
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

  // ─── Director: Delete / Rename Employee ─────────────
  const handleDeleteEmployee = async (empId: string) => {
    if (!confirm("Xoá nhân viên này?")) return;
    setSubmitting(true);
    try {
      await fetch(`/api/employees/${empId}`, { method: "DELETE" });
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
  const handleMarkDone = async (jobId: string, assignmentId: string) => {
    setSubmitting(true);
    try {
      await fetch(`/api/jobs/${jobId}/assignments/${assignmentId}/done`, { method: "POST" });
      await fetchAll();
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Director: Fetch Revenue (anhemphim.vn) ──────────────
  const fetchRevenue = async () => {
    setRevenueLoading(true);
    setRevenueError(null);
    try {
      const res = await fetch("/api/revenue");
      const data = await res.json();
      if (!res.ok) { setRevenueError(data.error || "Lỗi API doanh thu"); return; }
      setRevenueData(data);
    } catch {
      setRevenueError("Không lấy được dữ liệu doanh thu");
    } finally {
      setRevenueLoading(false);
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

          {/* Employee Login */}
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
                      <span className="text-3xl">🎬</span>
                      <span className="font-bold text-blue-700 text-sm text-center leading-snug">Hậu kỳ lẻ</span>
                      <span className="text-xs text-blue-500 text-center">Tạo 1 job dựng / edit đơn lẻ</span>
                    </button>
                    <button
                      onClick={() => setCreateMode("mini")}
                      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-purple-200 bg-purple-50 hover:bg-purple-100 hover:border-purple-400 transition-all">
                      <span className="text-3xl">🎞️</span>
                      <span className="font-bold text-purple-700 text-sm text-center leading-snug">Hậu kỳ Mini</span>
                      <span className="text-xs text-purple-500 text-center">Loạt clip ngắn, nhận từng clip</span>
                    </button>
                    <button
                      onClick={() => setCreateMode("shooting")}
                      className="flex flex-col items-center justify-center gap-2 p-5 rounded-2xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 hover:border-orange-400 transition-all">
                      <span className="text-3xl">📅</span>
                      <span className="font-bold text-orange-700 text-sm text-center leading-snug">Tạo Ngày Quay</span>
                      <span className="text-xs text-orange-500 text-center">Tất cả jobs cho 1 ngày quay</span>
                    </button>
                  </div>
                )}

                {/* ── Form: Hậu kỳ lẻ ── */}
                {createMode === "postprod" && (
                  <form onSubmit={handleCreateJob} className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🎬</span>
                      <span className="font-bold text-blue-700">Hậu kỳ lẻ</span>
                      <button type="button" onClick={() => setCreateMode("none")} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Tên công việc</label>
                        <input type="text" required value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="VD: Dựng tập 3 phim ngắn..." />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ngân sách (VNĐ)</label>
                        <input type="number" inputMode="numeric" required value={newJobSalary} onChange={(e) => setNewJobSalary(e.target.value)}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                          placeholder="VD: 3000000" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả chi tiết (tuỳ chọn)</label>
                      <textarea value={newJobDesc} onChange={(e) => setNewJobDesc(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-16 resize-none"
                        placeholder="Ghi chú thêm..." />
                    </div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setCreateMode("none")} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Huỷ</button>
                      <button type="submit" disabled={submitting} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                        {submitting ? "Đang đăng..." : "Đăng Job"}
                      </button>
                    </div>
                  </form>
                )}

                {/* ── Form: Hậu kỳ Mini ── */}
                {createMode === "mini" && (
                  <form onSubmit={handleCreateMiniJob} className="space-y-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xl">🎞️</span>
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

                {/* ── Form: Ngày Quay ── */}
                {createMode === "shooting" && (
                  <div className="space-y-5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl">📅</span>
                      <span className="font-bold text-orange-700">Tạo Ngày Quay</span>
                      <button type="button" onClick={() => setCreateMode("none")} className="ml-auto text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>

                    {/* Thông tin ngày quay */}
                    <div className="p-4 bg-orange-50 border border-orange-200 rounded-xl space-y-3">
                      <p className="text-sm font-semibold text-orange-700">📋 Thông tin ngày quay</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="sm:col-span-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tên phim / dự án</label>
                          <input type="text" value={shootFilmName} onChange={(e) => setShootFilmName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-sm"
                            placeholder="VD: Sát Giới" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Ngày quay</label>
                          <input type="number" inputMode="numeric" min="1" max="31" value={shootDay} onChange={(e) => setShootDay(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-sm"
                            placeholder="VD: 5" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tháng</label>
                          <input type="number" inputMode="numeric" min="1" max="12" value={shootMonth} onChange={(e) => setShootMonth(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-400 outline-none text-sm"
                            placeholder="VD: 3" />
                        </div>
                      </div>
                    </div>

                    {/* Chọn loại hậu kỳ */}
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-3">
                      <p className="text-sm font-semibold text-gray-700">🎬 Loại hậu kỳ cho ngày quay này</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setShootSubType("large")}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${shootSubType === "large" ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"}`}>
                          🎬 Job lớn (theo tập)
                        </button>
                        <button type="button" onClick={() => setShootSubType("mini_clips")}
                          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border-2 transition-colors ${shootSubType === "mini_clips" ? "bg-purple-600 text-white border-purple-600" : "bg-white text-gray-600 border-gray-200 hover:border-purple-300"}`}>
                          🎞️ Mini clip
                        </button>
                      </div>
                    </div>

                    {/* Hạng mục tại chỗ */}
                    <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-3">
                      <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Timer className="w-4 h-4 text-orange-500" /> Hạng mục tại chỗ</p>
                      <div className="grid grid-cols-12 gap-2 mb-1">
                        <div className="col-span-4 text-xs text-gray-400 font-medium">Vai trò</div>
                        <div className="col-span-2 text-xs text-gray-400 font-medium text-center">SL</div>
                        <div className="col-span-5 text-xs text-gray-400 font-medium">Lương/người</div>
                      </div>
                      <div className="space-y-2">
                        {shootPositions.map((pos, idx) => (
                          <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                            <div className="col-span-4">
                              <input type="text" value={pos.role}
                                onChange={(e) => setShootPositions(prev => prev.map((p, i) => i === idx ? { ...p, role: e.target.value } : p))}
                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-orange-400 outline-none" />
                            </div>
                            <div className="col-span-2">
                              <input type="number" min="1" max="10" value={pos.qty}
                                onChange={(e) => setShootPositions(prev => prev.map((p, i) => i === idx ? { ...p, qty: Number(e.target.value) } : p))}
                                className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-sm text-center focus:ring-1 focus:ring-orange-400 outline-none" />
                            </div>
                            <div className="col-span-5">
                              <input type="number" inputMode="numeric" value={pos.salary}
                                onChange={(e) => setShootPositions(prev => prev.map((p, i) => i === idx ? { ...p, salary: Number(e.target.value) } : p))}
                                className="w-full px-2.5 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-orange-400 outline-none" />
                            </div>
                            <div className="col-span-1 flex justify-end">
                              <button type="button" onClick={() => setShootPositions(prev => prev.filter((_, i) => i !== idx))}
                                className="text-gray-300 hover:text-red-400"><X className="w-4 h-4" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button type="button"
                        onClick={() => setShootPositions(prev => [...prev, { role: "", qty: 1, salary: 0 }])}
                        className="text-xs text-orange-600 hover:text-orange-700 flex items-center gap-1 font-medium mt-1">
                        <PlusCircle className="w-3.5 h-3.5" /> Thêm hạng mục
                      </button>
                      <div className="text-xs text-gray-400 bg-orange-50 rounded-lg px-3 py-2 flex justify-between mt-2">
                        <span>Tổng tại chỗ:</span>
                        <span className="font-semibold text-orange-700">
                          {new Intl.NumberFormat("vi-VN").format(shootPositions.reduce((s, p) => s + p.salary * p.qty, 0))}đ
                        </span>
                      </div>
                    </div>

                    {/* Hậu kỳ: job lớn theo tập */}
                    {shootSubType === "large" && (
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                        <p className="text-sm font-semibold text-blue-700">🎬 Tập dựng phim</p>
                        <div className="grid grid-cols-12 gap-2 mb-1">
                          <div className="col-span-6 text-xs text-gray-400 font-medium">Tên tập</div>
                          <div className="col-span-5 text-xs text-gray-400 font-medium">Thù lao dựng</div>
                        </div>
                        <div className="space-y-2">
                          {shootEpisodes.map((ep, idx) => (
                            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                              <div className="col-span-6">
                                <input type="text" value={ep.name}
                                  onChange={(e) => setShootEpisodes(prev => prev.map((x, i) => i === idx ? { ...x, name: e.target.value } : x))}
                                  className="w-full px-2.5 py-1.5 border border-blue-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-400 outline-none" />
                              </div>
                              <div className="col-span-5">
                                <input type="number" inputMode="numeric" value={ep.editSalary}
                                  onChange={(e) => setShootEpisodes(prev => prev.map((x, i) => i === idx ? { ...x, editSalary: Number(e.target.value) } : x))}
                                  className="w-full px-2.5 py-1.5 border border-blue-200 rounded-lg text-sm focus:ring-1 focus:ring-blue-400 outline-none" />
                              </div>
                              <div className="col-span-1 flex justify-end">
                                <button type="button" onClick={() => setShootEpisodes(prev => prev.filter((_, i) => i !== idx))}
                                  className="text-gray-300 hover:text-red-400"><X className="w-4 h-4" /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                        <button type="button"
                          onClick={() => setShootEpisodes(prev => [...prev, { name: `Tập ${prev.length + 1}`, editSalary: DEFAULT_EDIT_SALARY }])}
                          className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium mt-1">
                          <PlusCircle className="w-3.5 h-3.5" /> Thêm tập
                        </button>
                        <div className="text-xs text-gray-400 bg-blue-100/70 rounded-lg px-3 py-2 flex justify-between">
                          <span>Tổng hậu kỳ:</span>
                          <span className="font-semibold text-blue-700">
                            {new Intl.NumberFormat("vi-VN").format(shootEpisodes.reduce((s, e) => s + e.editSalary, 0))}đ
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Hậu kỳ: mini clips */}
                    {shootSubType === "mini_clips" && (
                      <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl space-y-3">
                        <p className="text-sm font-semibold text-purple-700">🎞️ Clip ngắn hậu kỳ</p>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tên loạt clip</label>
                          <input type="text" value={shootClipTitle} onChange={(e) => setShootClipTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:ring-1 focus:ring-purple-400 outline-none"
                            placeholder={`VD: Clip ${shootFilmName || "phim"} ngắn`} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Giá / clip (đ)</label>
                            <input type="number" inputMode="numeric" min="1000" value={shootClipPrice} onChange={(e) => setShootClipPrice(e.target.value)}
                              className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:ring-1 focus:ring-purple-400 outline-none" />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Số clip</label>
                            <input type="number" inputMode="numeric" min="1" value={shootClipCount} onChange={(e) => setShootClipCount(e.target.value)}
                              className="w-full px-3 py-2 border border-purple-200 rounded-lg text-sm focus:ring-1 focus:ring-purple-400 outline-none" />
                          </div>
                        </div>
                        {shootClipPrice && shootClipCount && (
                          <div className="text-xs text-gray-400 bg-purple-100/70 rounded-lg px-3 py-2 flex justify-between">
                            <span>Tổng mini:</span>
                            <span className="font-semibold text-purple-600">
                              {new Intl.NumberFormat("vi-VN").format(Number(shootClipPrice) * Number(shootClipCount))}đ
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Preview tổng chi phí */}
                    {shootFilmName && shootDay && shootMonth && (
                      <div className="bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl p-4">
                        <p className="text-sm font-bold mb-2">📅 {shootFilmName} — {shootDay}/{shootMonth}</p>
                        <div className="text-xs space-y-1 opacity-90">
                          <p>• {shootPositions.reduce((s, p) => s + p.qty, 0)} vị trí tại chỗ ({shootPositions.length} hạng mục) — {new Intl.NumberFormat("vi-VN").format(shootPositions.reduce((s, p) => s + p.salary * p.qty, 0))}đ</p>
                          {shootSubType === "large"
                            ? <p>• {shootEpisodes.length} job dựng tập — {new Intl.NumberFormat("vi-VN").format(shootEpisodes.reduce((s, e) => s + e.editSalary, 0))}đ</p>
                            : <p>• 1 job mini ({shootClipCount} clip × {new Intl.NumberFormat("vi-VN").format(Number(shootClipPrice))}đ) — {new Intl.NumberFormat("vi-VN").format(Number(shootClipPrice) * Number(shootClipCount))}đ</p>
                          }
                        </div>
                        <p className="font-black text-lg mt-2">
                          Tổng: {new Intl.NumberFormat("vi-VN").format(
                            shootPositions.reduce((s, p) => s + p.salary * p.qty, 0) +
                            (shootSubType === "large"
                              ? shootEpisodes.reduce((s, e) => s + e.editSalary, 0)
                              : Number(shootClipPrice) * Number(shootClipCount))
                          )}đ
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button type="button" onClick={() => setCreateMode("none")} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Huỷ</button>
                      <button
                        type="button"
                        disabled={submitting || !shootFilmName || !shootDay || !shootMonth}
                        onClick={handleCreateShootingDay}
                        className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white py-2.5 rounded-xl font-bold text-sm transition-colors flex items-center justify-center gap-2">
                        {submitting ? <><RefreshCw className="w-4 h-4 animate-spin" /> Đang tạo...</> : <><CheckCircle2 className="w-4 h-4" /> Tạo tất cả jobs</>}
                      </button>
                    </div>
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
                </div>

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
                  const filtered = jobs
                    .filter((j) => j.title.toLowerCase().includes(jobSearch.toLowerCase()) || j.description?.toLowerCase().includes(jobSearch.toLowerCase()))
                    .sort((a, b) => {
                      const ta = new Date(a.createdAt).getTime();
                      const tb = new Date(b.createdAt).getTime();
                      return jobSort === "newest" ? tb - ta : ta - tb;
                    });
                  const allFilteredIds = filtered.map(j => j.id);
                  const allSelected = allFilteredIds.length > 0 && allFilteredIds.every(id => selectedJobIds.has(id));
                  if (filtered.length === 0) return <EmptyBlock text={`Không tìm thấy job nào cho "${jobSearch}".`} />;
                  return (
                    <div className="grid gap-4">
                      {/* ── Select-all row ── */}
                      <div className="flex items-center gap-2 px-1">
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
                        const pct = isMini
                          ? (job.assignments.reduce((s, a) => s + (a.units ?? 1), 0) / (job.totalUnits ?? 1)) * 100
                          : job.assignments.reduce((a, b) => a + b.percentage, 0);
                        const isSelected = selectedJobIds.has(job.id);
                        return (
                          <div key={job.id} className={`bg-white p-4 sm:p-5 rounded-xl shadow-sm border transition-colors ${isSelected ? "border-red-300 bg-red-50/30" : "border-gray-100"}`}>
                            <div className="flex justify-between items-start mb-3 gap-2">
                              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                <input type="checkbox" checked={isSelected}
                                  onChange={() => setSelectedJobIds(prev => {
                                    const n = new Set(prev);
                                    isSelected ? n.delete(job.id) : n.add(job.id);
                                    return n;
                                  })}
                                  className="mt-1 w-4 h-4 rounded accent-red-500 cursor-pointer shrink-0" />
                                <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-base leading-snug">{job.title}</h3>
                                  {isMini && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0">🎞️ Mini · {job.assignments.reduce((s, a) => s + (a.units ?? 1), 0)}/{job.totalUnits} clip</span>}
                                  {job.expiresAt && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0"><Timer className="w-2.5 h-2.5" />HH {new Date(job.expiresAt).toLocaleDateString("vi-VN")}</span>}
                                  {job.groupName && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full shrink-0">{job.groupName}</span>}
                                </div>
                                {job.description && <p className="text-gray-500 text-sm mt-0.5 line-clamp-1">{job.description}</p>}
                                <p className="text-xs text-gray-400 mt-0.5">{monthLabel(job.month || job.createdAt.slice(0, 7))}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                                  <DollarSign className="w-3.5 h-3.5" />{isMini ? `${new Intl.NumberFormat("vi-VN").format(job.unitPrice ?? 0)}/clip` : formatCurrency(job.totalSalary)}
                                </span>
                                <button onClick={() => handleDeleteJob(job.id)} disabled={submitting}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Xoá job">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
                              <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            {job.assignments.length > 0 && (
                              <div className="space-y-1.5">
                                {job.assignments.map((a) => (
                                  <div key={a.id} className="flex flex-wrap justify-between items-center gap-1 text-sm bg-gray-50 px-3 py-2 rounded-lg">
                                    <span className="font-medium">{a.employeeName}</span>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {isMini
                                        ? <span className="text-purple-600">{a.units ?? 1} clip</span>
                                        : <span className="text-blue-600">{a.percentage}%</span>}
                                      <span className="text-green-600 font-medium">{formatCurrency(a.salaryEarned)}</span>
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
                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                                {emp.name.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <p className="font-medium">{emp.name}</p>
                                <p className="text-xs text-green-600 flex items-center gap-0.5">
                                  <Wallet className="w-3 h-3" />{formatCurrency(emp.balance)}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              <button onClick={() => setEditingEmployee({ id: emp.id, name: emp.name })}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Đổi tên">
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDeleteEmployee(emp.id)} disabled={submitting}
                                className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Xoá">
                                <Trash2 className="w-4 h-4" />
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
              <h2 className="text-lg font-semibold mb-4">Chờ Duyệt</h2>
              {loading ? <LoadingBlock /> : pendingApprovals.length === 0 ? (
                <EmptyBlock text="Không có phần việc nào chờ duyệt." />
              ) : (
                <div className="grid gap-4">
                  {pendingApprovals.map(({ job, assignment }) => (
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
                        <button
                          onClick={() => {
                            setApprovingItem({ jobId: job.id, assignmentId: assignment.id, jobTitle: job.title, empName: assignment.employeeName, salary: assignment.salaryEarned });
                            setApproveNote("");
                          }}
                          disabled={submitting}
                          className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto shrink-0"
                        >
                          <CheckCircle2 className="w-4 h-4" /> Duyệt
                        </button>
                      </div>
                    </div>
                  ))}
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
                    }} className="p-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors" title="Copy văn bản">
                      {copySuccess ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    </button>
                    <button onClick={() => {
                      const header = "Nhân viên,Job,Phần trăm,Số tiền,Ngày duyệt,Ghi chú";
                      const csvRows = rows.flatMap(({ emp, approved }) =>
                        approved.map(({ job, assignment }) =>
                          `"${emp.name}","${job.title}",${assignment.percentage},${assignment.salaryEarned},"${assignment.approvedAt ? new Date(assignment.approvedAt).toLocaleDateString("vi-VN") : ""}","${assignment.note || ""}"`
                        )
                      );
                      const csv = [header, ...csvRows].join("\n");
                      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url;
                      a.download = `bang-luong-${directorMonth}.csv`;
                      a.click(); URL.revokeObjectURL(url);
                    }} className="p-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors" title="Tải CSV">
                      <Download className="w-5 h-5" />
                    </button>
                  </div>
                </div>

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
                                <span className="text-green-600 font-semibold ml-3 shrink-0">{formatCurrency(assignment.salaryEarned)}</span>
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
                                    onClick={() => {
                                      const updated = { ...manualEntries };
                                      updated[directorMonth] = (updated[directorMonth] ?? []).filter((e) => e.id !== entry.id);
                                      setManualEntries(updated);
                                      localStorage.setItem("manual_salary", JSON.stringify(updated));
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

            const grandTotalSalary = salaryRows.reduce((s, r) => s + r.totalApproved, 0);

            // Thu Chi data cho tháng đang chọn
            const thuChiMonth = thuChiData
              ? thuChiData.filter((t) => t.date?.startsWith(directorMonth))
              : null;
            const thuChiThu = thuChiMonth?.filter((t) => t.type === "Thu").reduce((s, t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0) ?? 0;
            const thuChiChi = thuChiMonth?.filter((t) => t.type === "Chi").reduce((s, t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0) ?? 0;

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
            ])].sort().reverse();

            const reportRows = allReportMonths.map((ym) => {
              const txs = thuChiData?.filter((t) => t.date?.startsWith(ym)) ?? [];
              const thuChiThuYm = txs.filter((t) => t.type === "Thu").reduce((s, t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0);
              const chiYm = txs.filter((t) => t.type === "Chi").reduce((s, t) => s + (t.currency === "VND" ? Number(t.amount) : Number(t.amount) * 25000), 0);
              const revYm = revenueData?.[ym] ?? 0;
              const thuYm = thuChiThuYm + revYm;
              const salary = employees.map((emp) =>
                jobs.flatMap((job) => job.assignments.filter((a) => {
                  if (a.employeeId !== emp.id || a.status !== "APPROVED") return false;
                  return getSalaryMonth(job.month || job.createdAt.slice(0, 7), a.approvedAt) === ym;
                }).map((a) => a.salaryEarned))
              ).flat().reduce((s, x) => s + x, 0);
              const tongChi = chiYm + salary;
              const loiNhuanYm = thuYm - tongChi;
              return { ym, thu: thuYm, thuChiThu: thuChiThuYm, revYm, chi: chiYm, salary, tongChi, loiNhuan: loiNhuanYm };
            });

            return (
              <div className="space-y-5">
                {/* Sub-tab toggle + export */}
                <div className="flex gap-2 items-center">
                  <div className="flex gap-1 bg-gray-100 rounded-xl p-1 flex-1">
                    <button onClick={() => setFinanceView("overview")}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${financeView === "overview" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                      🏠 Tổng quan
                    </button>
                    <button onClick={() => setFinanceView("month")}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${financeView === "month" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                      📅 Chi tiết
                    </button>
                    <button onClick={() => setFinanceView("report")}
                      className={`flex-1 py-1.5 rounded-lg text-sm font-semibold transition-colors ${financeView === "report" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500"}`}>
                      📊 Báo cáo
                    </button>
                  </div>
                  {/* Nút xuất CSV */}
                  {(thuChiData || revenueData) && financeView !== "overview" && (
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
                          const header = "Tháng,AEP (VND),Thu khác (VND),Chi khác (VND),Lương (VND),Lợi nhuận (VND),VAT 8% (VND),TNCN 3% (VND),TNDN 18% (VND)";
                          const rows = reportRows.map((r) => {
                            const totalThu = r.revYm + r.thuChiThu;
                            const totalChi = r.chi + r.salary;
                            return [
                              r.ym,
                              r.revYm,
                              r.thuChiThu,
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
                            reportRows.reduce((s, r) => s + r.thuChiThu, 0),
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
                  <p className="text-xs text-amber-600 flex items-center gap-1.5 px-1">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" /> anhemphim.vn: {revenueError}
                    <button onClick={fetchRevenue} className="underline ml-1">Thử lại</button>
                  </p>
                )}

                {/* ── View: Tổng quan ── */}
                {(thuChiData || revenueData) && !thuChiLoading && !revenueLoading && financeView === "overview" && (() => {
                  const filteredRows = overviewFilter === "all" ? reportRows : reportRows.filter(r => r.ym === overviewFilter);

                  const totalAEP     = filteredRows.reduce((s, r) => s + r.revYm, 0);
                  const totalThuKhac = filteredRows.reduce((s, r) => s + r.thuChiThu, 0);
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
                      ThuKhac: Math.round(r.thuChiThu / 1e6 * 10) / 10,
                      TongThu: Math.round((r.revYm + r.thuChiThu) / 1e6 * 10) / 10,
                      TongChi: Math.round((r.chi + r.salary) / 1e6 * 10) / 10,
                      LoiNhuan: Math.round(r.loiNhuan / 1e6 * 10) / 10,
                      Delta: profitDelta !== null ? Math.round(profitDelta / 1e6 * 10) / 10 : null,
                    };
                  });

                  const refIdx = chartRefMonth === "prev"
                    ? Math.max(0, chartData.length - 2)
                    : chartData.length - 1;
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
                          <p className="text-[10px] text-green-600 font-semibold mb-1">💰 Tổng doanh thu</p>
                          <p className="font-black text-green-700 text-base leading-tight">{formatCurrency(totalThu)}</p>
                          {totalAEP > 0 && <p className="text-[10px] text-green-500 mt-1">🎬 {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalAEP)}</p>}
                          {totalThuKhac > 0 && <p className="text-[10px] text-green-400">+ {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalThuKhac)} khác</p>}
                        </div>
                        <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                          <p className="text-[10px] text-red-500 font-semibold mb-1">🧾 Tổng chi phí</p>
                          <p className="font-black text-red-600 text-base leading-tight">{formatCurrency(totalChiAll)}</p>
                          {totalChi > 0 && <p className="text-[10px] text-red-400 mt-1">Chi: {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalChi)}</p>}
                          {totalSalary > 0 && <p className="text-[10px] text-red-300">Lương: {new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(totalSalary)}</p>}
                        </div>
                        <div className={`${totalProfit >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"} border rounded-2xl p-3`}>
                          <p className={`text-[10px] font-semibold mb-1 ${totalProfit >= 0 ? "text-emerald-600" : "text-orange-500"}`}>📈 Lợi nhuận</p>
                          <p className={`font-black text-base leading-tight ${totalProfit >= 0 ? "text-emerald-700" : "text-orange-600"}`}>{formatCurrency(totalProfit)}</p>
                          {totalThu > 0 && <p className={`text-[10px] mt-1 ${totalProfit >= 0 ? "text-emerald-400" : "text-orange-400"}`}>
                            {Math.round(totalProfit / totalThu * 100)}% biên lợi nhuận
                          </p>}
                        </div>
                      </div>

                      {/* Card chỉ báo lời/lỗ + toggle */}
                      {refRow && (
                        <div className={`rounded-2xl border overflow-hidden ${
                          refRow.LoiNhuan >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"
                        }`}>
                          <div className="flex gap-1 p-2 border-b border-black/5">
                            <button
                              onClick={() => setChartRefMonth("prev")}
                              className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                chartRefMonth === "prev" ? "bg-white shadow-sm text-gray-800" : "text-gray-400"
                              }`}>
                              Tháng trước
                            </button>
                            <button
                              onClick={() => setChartRefMonth("curr")}
                              className={`flex-1 py-1 rounded-lg text-xs font-semibold transition-colors ${
                                chartRefMonth === "curr" ? "bg-white shadow-sm text-gray-800" : "text-gray-400"
                              }`}>
                              Tháng hiện tại
                            </button>
                          </div>
                          <div className="p-4 flex items-center justify-between gap-4">
                            <div>
                              <p className={`text-xs font-semibold mb-0.5 ${
                                refRow.LoiNhuan >= 0 ? "text-emerald-600" : "text-red-500"
                              }`}>
                                {refRow.LoiNhuan >= 0 ? "📈" : "📉"} {refRow.name} — {refRow.LoiNhuan >= 0 ? "Có lời" : "Lỗ"}
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
                            <Bar dataKey="AEP" name="🎬 Anh Em Phim" stackId="thu" fill="#34d399" radius={[0,0,0,0]} />
                            <Bar dataKey="ThuKhac" name="💼 Thu khác" stackId="thu" fill="#6ee7b7" radius={[4,4,0,0]} />
                            <Bar dataKey="TongChi" name="🧧 Tổng chi" fill="#fb923c" radius={[4,4,0,0]} />
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
                        <p className="text-xs text-green-600 font-medium mb-1">💰 Doanh thu</p>
                        <p className="font-black text-green-700 text-base leading-tight">{formatCurrency(tongThu)}</p>
                        {anhEmPhimThu > 0 && thuChiThu > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            <p className="text-[10px] text-green-500">🎬 AEP: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(anhEmPhimThu)}</p>
                            <p className="text-[10px] text-green-500">📊 TC: +{new Intl.NumberFormat("vi-VN",{notation:"compact"}).format(thuChiThu)}</p>
                          </div>
                        )}
                        {anhEmPhimThu > 0 && thuChiThu === 0 && (
                          <p className="text-[10px] text-green-500 mt-1">🎬 anhemphim.vn</p>
                        )}
                      </div>
                      <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                        <p className="text-xs text-red-500 font-medium mb-1">🧾 Chi phí khác</p>
                        <p className="font-black text-red-600 text-base leading-tight">{formatCurrency(thuChiChi)}</p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
                        <p className="text-xs text-blue-600 font-medium mb-1">👥 Lương nhân viên</p>
                        <p className="font-black text-blue-700 text-base leading-tight">{formatCurrency(grandTotalSalary)}</p>
                      </div>
                      <div className={`rounded-2xl p-3 border ${loiNhuan >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-orange-50 border-orange-200"}`}>
                        <p className={`text-xs font-medium mb-1 ${loiNhuan >= 0 ? "text-emerald-600" : "text-orange-600"}`}>
                          {loiNhuan >= 0 ? "📈 Lợi nhuận" : "📉 Lỗ"}
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
                          <span className="text-sm">📋</span>
                          <p className="text-xs font-semibold text-amber-700">Dự báo thuế</p>
                          <span className="text-[10px] bg-amber-100 text-amber-500 px-2 py-0.5 rounded-full font-medium ml-auto">Chỉ báo — không tính vào chi phí</span>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className="text-[10px] text-amber-500 font-semibold mb-0.5">🏷 VAT (8%)</p>
                            <p className="text-sm font-black text-amber-700">{formatCurrency(tongThu * 0.08)}</p>
                            <p className="text-[10px] text-amber-400">8% × Tổng thu</p>
                          </div>
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className="text-[10px] text-amber-500 font-semibold mb-0.5">👤 TNCN (~3%)</p>
                            <p className="text-sm font-black text-amber-700">{formatCurrency(tongChiTat * 0.03)}</p>
                            <p className="text-[10px] text-amber-400">3% × Tổng chi</p>
                          </div>
                          <div className="bg-white/70 rounded-xl p-2">
                            <p className="text-[10px] text-amber-500 font-semibold mb-0.5">🏢 TNDN (18%)</p>
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
                          <p className="font-semibold text-sm text-gray-800">📋 Giao dịch {monthLabel(directorMonth)}</p>
                          <span className="text-xs text-gray-400">{(thuChiMonth?.length ?? 0) + (anhEmPhimThu > 0 ? 1 : 0) + (grandTotalSalary > 0 ? 1 : 0)} mục</span>
                        </div>
                        <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                          {/* Doanh thu anhemphim.vn */}
                          {anhEmPhimThu > 0 && (
                            <div className="flex items-center justify-between px-4 py-2.5 gap-2 bg-green-50/30">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-green-700">🎬 anhemphim.vn</p>
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
                                <p className="text-sm font-medium text-blue-700">👥 Lương nhân viên ({salaryRows.length} người)</p>
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
                          <p className="font-semibold text-sm text-gray-800">📊 Tổng hợp {reportRows.length} tháng</p>
                          {revenueLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400" />}
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b border-gray-100 text-xs text-gray-400 font-medium">
                                <th className="px-4 py-2 text-left">Tháng</th>
                                <th className="px-3 py-2 text-right">🎬 AEP</th>
                                <th className="px-3 py-2 text-right">📊 Thu khác</th>
                                <th className="px-3 py-2 text-right">🧾 Chi khác</th>
                                <th className="px-3 py-2 text-right">👥 Lương</th>
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
                                  <td className="px-3 py-2.5 text-right text-green-500 whitespace-nowrap">
                                    {r.thuChiThu > 0 ? `+${new Intl.NumberFormat("vi-VN", { notation: "compact" }).format(r.thuChiThu)}` : "—"}
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
                                <td className="px-3 py-2.5 text-right text-green-500">
                                  {formatCurrency(reportRows.reduce((s, r) => s + r.thuChiThu, 0))}
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
                                <span className="text-xs">📋</span>
                                <p className="text-xs font-semibold text-amber-700">Dự báo thuế tổng hợp</p>
                                <span className="text-[10px] bg-amber-100 text-amber-500 px-2 py-0.5 rounded-full font-medium ml-auto">Chỉ báo</span>
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <div>
                                  <p className="text-[10px] text-amber-500 font-medium">🏷 VAT (8%)</p>
                                  <p className="text-sm font-black text-amber-700">{formatCurrency(totalThu * 0.08)}</p>
                                  <p className="text-[10px] text-amber-400">8% × Tổng thu</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-amber-500 font-medium">👤 TNCN (~3%)</p>
                                  <p className="text-sm font-black text-amber-700">{formatCurrency(totalChi * 0.03)}</p>
                                  <p className="text-[10px] text-amber-400">3% × Tổng chi</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-amber-500 font-medium">🏢 TNDN (18%)</p>
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
              </div>
            );
          })()}
        </main>

      {/* Modal thêm lương thủ công */}
      {manualModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setManualModal(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-base">➕ Thêm lương thủ công</h3>
                <p className="text-xs text-gray-400 mt-0.5">{manualModal.emp.name} · {monthLabel(directorMonth)}</p>
              </div>
              <button onClick={() => setManualModal(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            <form
              className="p-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(manualAmount.replace(/[^0-9]/g, ""));
                if (!manualTitle.trim() || !amt) return;
                const entry: { id: string; empId: string; title: string; amount: number; note: string } = {
                  id: Date.now().toString(),
                  empId: manualModal.emp.id,
                  title: manualTitle.trim(),
                  amount: amt,
                  note: manualNote.trim(),
                };
                const updated = { ...manualEntries };
                updated[directorMonth] = [...(updated[directorMonth] ?? []), entry];
                setManualEntries(updated);
                localStorage.setItem("manual_salary", JSON.stringify(updated));
                setManualModal(null);
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
            <p className="font-semibold text-gray-900 text-sm">{currentEmployee?.name}</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
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

          const medals = ["🥇", "🥈", "🥉"];
          const topEarned = ranked[0]?.earned ?? 1;

          return (
            <div>
              {/* Header */}
              <div className="relative overflow-hidden rounded-2xl mb-6 bg-gradient-to-br from-yellow-400 via-amber-400 to-orange-400 p-5 shadow-lg">
                <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10" />
                <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/10" />
                <div className="relative z-10 flex items-center gap-3">
                  <div className="text-4xl">🏆</div>
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
          const earnedInMonth = myAssignments
            .filter(({ job, assignment }) => {
              if (assignment.status !== "APPROVED") return false;
              const jm = job.month || job.createdAt.slice(0, 7);
              return getSalaryMonth(jm, assignment.approvedAt) === selectedMonth;
            })
            .reduce((sum, { assignment }) => sum + assignment.salaryEarned, 0);

          // Đang làm / chờ duyệt: tất cả assignment chưa được duyệt (không lọc theo tháng)
          const inProgress = myAssignments
            .filter(({ assignment }) =>
              assignment.status === "WORKING" || assignment.status === "PENDING_APPROVAL"
            )
            .reduce((sum, { assignment }) => sum + assignment.salaryEarned, 0);

          const availableJobs = jobs.filter((job) => {
            if (job.jobType === "mini") {
              return (
                job.assignments.length < (job.totalUnits ?? 0) &&
                !job.assignments.some((a) => a.employeeId === currentEmployee?.id)
              );
            }
            const claimed = job.assignments.reduce((a, b) => a + b.percentage, 0);
            return claimed < 100 && !job.assignments.some((a) => a.employeeId === currentEmployee?.id);
          });

          const availableValue = availableJobs.reduce((sum, job) => {
            if (job.jobType === "mini") {
              const remaining = (job.totalUnits ?? 0) - job.assignments.length;
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
              // Mini: still open if claimed clips < totalUnits
              return job.assignments.length < (job.totalUnits ?? 0);
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

          const JobCard = ({ job, theme }: { job: Job; theme: "amber" | "blue" | "green" }) => {
            const isMini = job.jobType === "mini";
            const totalClaimed = isMini
              ? job.assignments.reduce((s, a) => s + (a.units ?? 1), 0)
              : job.assignments.reduce((a, b) => a + b.percentage, 0);
            const progressPct = isMini
              ? (totalClaimed / (job.totalUnits ?? 1)) * 100
              : totalClaimed;
            const myAssignment = job.assignments.find((a) => a.employeeId === currentEmployee?.id);
            const myAssignments_job = job.assignments.filter((a) => a.employeeId === currentEmployee?.id);
            const myTotalUnits = myAssignments_job.reduce((s, a) => s + (a.units ?? 1), 0);
            const myApprovedAssignments = job.assignments.filter(
              (a) => a.employeeId === currentEmployee?.id && a.status === "APPROVED"
            );
            const myApprovedPct = isMini
              ? myApprovedAssignments.reduce((s, a) => s + (a.units ?? 1), 0)
              : myApprovedAssignments.reduce((s, a) => s + a.percentage, 0);

            // Pastel palette per theme
            const cardBg = theme === "amber"
              ? isMini ? "bg-violet-50 border border-violet-200" : "bg-orange-50 border border-orange-200"
              : theme === "blue"
              ? isMini ? "bg-violet-50 border border-violet-200" : "bg-sky-50 border border-sky-200"
              : isMini ? "bg-violet-50 border border-violet-200" : "bg-emerald-50 border border-emerald-200";

            const accentText = theme === "amber"
              ? isMini ? "text-violet-700" : "text-orange-600"
              : theme === "blue"
              ? isMini ? "text-violet-700" : "text-sky-700"
              : isMini ? "text-violet-700" : "text-emerald-700";

            const barBg = theme === "amber"
              ? isMini ? "bg-violet-200" : "bg-orange-200"
              : theme === "blue"
              ? isMini ? "bg-violet-200" : "bg-sky-200"
              : isMini ? "bg-violet-200" : "bg-emerald-200";

            const barFill = theme === "amber"
              ? isMini ? "bg-violet-400" : "bg-orange-400"
              : theme === "blue"
              ? isMini ? "bg-violet-400" : "bg-sky-500"
              : isMini ? "bg-violet-400" : "bg-emerald-500";

            const badgeBg = theme === "amber"
              ? isMini ? "bg-violet-100 text-violet-700" : "bg-orange-100 text-orange-700"
              : theme === "blue"
              ? isMini ? "bg-violet-100 text-violet-700" : "bg-sky-100 text-sky-700"
              : isMini ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700";

            const btnClass = theme === "amber"
              ? isMini ? "bg-violet-500 hover:bg-violet-600 text-white" : "bg-orange-500 hover:bg-orange-600 text-white"
              : theme === "blue"
              ? isMini ? "bg-violet-500 hover:bg-violet-600 text-white" : "bg-sky-600 hover:bg-sky-700 text-white"
              : isMini ? "bg-violet-500 hover:bg-violet-600 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white";

            const badgeLabel = theme === "green"
              ? "✓ Xong"
              : theme === "blue"
                ? isMini ? `${myTotalUnits} clip` : `${myAssignment?.percentage ?? 0}%`
                : isMini ? `Còn ${(job.totalUnits ?? 0) - totalClaimed}` : `Còn ${100 - totalClaimed}%`;

            return (
              <div className={`relative flex flex-col rounded-2xl p-4 min-h-[160px] overflow-hidden ${cardBg}`}>
                {/* Subtle decorative circle */}
                <div className={`absolute -top-5 -right-5 w-20 h-20 rounded-full opacity-20 ${barFill}`} />

                {/* Top row: type icon + badge */}
                <div className="flex items-start justify-between gap-1 mb-2 relative z-10">
                  <span className="text-base leading-none">{isMini ? "🎞️" : theme === "amber" && job.expiresAt ? "📅" : "🎬"}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${badgeBg}`}>
                    {badgeLabel}
                  </span>
                </div>

                {/* Title */}
                <h3 className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 relative z-10 flex-1">
                  {job.title}
                </h3>

                {/* Date for onsite */}
                {theme === "amber" && job.expiresAt && (
                  <p className={`text-[11px] mt-1 relative z-10 font-medium ${accentText}`}>
                    📅 {new Date(job.expiresAt).getDate()}/{new Date(job.expiresAt).getMonth() + 1}/{new Date(job.expiresAt).getFullYear()}
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
                  <div className="flex items-center gap-1">
                    {theme === "amber" && myApprovedPct > 0 && (
                      <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${badgeBg}`}>
                        ✓ {isMini ? `${myApprovedPct} clip` : `${myApprovedPct}%`}
                      </span>
                    )}
                    {theme === "green" && myApprovedAssignments[0]?.note && (
                      <span className="text-[11px] text-gray-500 flex items-center gap-0.5 max-w-[100px] truncate" title={myApprovedAssignments[0].note}>
                        <MessageSquare className="w-3 h-3 shrink-0" />{myApprovedAssignments[0].note}
                      </span>
                    )}
                    {theme === "blue" && myAssignment?.status === "PENDING_APPROVAL" && (
                      <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">⏳ Chờ duyệt</span>
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
                      <button onClick={() => handleMarkDone(job.id, myAssignment.id)} disabled={submitting}
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
                  <h2 className="text-base font-bold text-blue-700 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" />
                    Đang làm ({myActiveJobs.length})
                  </h2>
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
                  <div className="flex gap-1.5 flex-wrap">
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
                        {f === "all" ? "Tất cả" : f === "onsite" ? "📅 Đi quay" : f === "postprod" ? "🎬 Hậu kỳ" : "🎞️ Mini"}
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
                                    <p className="text-xs text-orange-500 mt-0.5">📅 Ngày quay: {group.date}</p>
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
              {myDoneJobs.length > 0 && (
                <div>
                  <h2 className="text-base font-bold text-green-700 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                    Đã hoàn thành ({myDoneJobs.length})
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {myDoneJobs.map((job) => <JobCard key={job.id} job={job} theme="green" />)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        </> /* end market view */
        )} {/* end employeeView === "market" */}

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
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center text-xl">🎞️</div>
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
                  {submitting ? "Đang nhận…" : "✓ Nhận"}
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
                      ⚠️ Nhường hết {sharingItem.currentUnits} clip — bạn sẽ rời khỏi job này.
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
                      ⚠️ Nhường hết {sharingItem.currentPct}% — bạn sẽ rời khỏi job này.
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
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────

function EmployeeList({ onLogin, onMounted }: { onLogin: (emp: Employee) => void; onMounted: () => void }) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/employees")
      .then((r) => r.json())
      .then(setEmployees)
      .finally(() => setLoading(false));
    onMounted();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) return <LoadingBlock />;
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
