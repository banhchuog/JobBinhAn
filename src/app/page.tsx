"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Job, Employee } from "@/types";
import {
  Briefcase, Users, PlusCircle, CheckCircle2, Clock,
  DollarSign, RefreshCw, LogOut, UserPlus, ChevronRight,
  Wallet, BadgeCheck, AlertCircle, CalendarDays, Trash2, Pencil,
  Search, Download, Copy, MessageSquare, X, Sparkles, Timer, Share2,
} from "lucide-react";

type View = "LOGIN" | "DIRECTOR" | "EMPLOYEE";

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

// ── AI Job Group Parser ─────────────────────────────────
interface PreviewJob {
  title: string;
  description: string;
  totalSalary: number;
  month: string;
  expiresAt?: string;
  isOnSite: boolean;
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
    // Nếu tháng đã qua nhiều tháng → sang năm sau
    const year = (month < now.getMonth() + 1 - 3) ? currentYear + 1 : currentYear;
    const ym = `${year}-${String(month).padStart(2, "0")}`;
    const expiresAt = new Date(year, month - 1, day, 23, 59, 59, 999).toISOString();

    // Parse tập: "1 2" → [1, 2]
    const episodeStr = (match[4] || "").trim();
    const episodes = episodeStr.match(/\d+/g)?.map(Number) ?? [1];

    const jobs: PreviewJob[] = [];

    // Hậu kỳ — 1 job dựng / tập (không hết hạn)
    for (const ep of episodes) {
      jobs.push({
        title: `Dựng tập ${ep} ${filmName}`,
        description: `Hậu kỳ tập ${ep} — ${filmName}`,
        totalSalary: 3_000_000,
        month: ym,
        isOnSite: false,
      });
    }

    // Tại chỗ — hết hạn cuối ngày quay
    for (let i = 1; i <= 2; i++) {
      jobs.push({ title: `Quay phim ${filmName} (Máy ${i})`, description: `Ngày quay ${day}/${month} — ${filmName}`, totalSalary: 1_200_000, month: ym, expiresAt, isOnSite: true });
      jobs.push({ title: `Ánh sáng ${filmName} (${i})`, description: `Ngày quay ${day}/${month} — ${filmName}`, totalSalary: 700_000, month: ym, expiresAt, isOnSite: true });
    }
    jobs.push({ title: `Âm thanh ${filmName}`, description: `Ngày quay ${day}/${month} — ${filmName}`, totalSalary: 1_000_000, month: ym, expiresAt, isOnSite: true });

    return { groupName: `Ngày quay ${filmName} ${day}/${month}`, jobs };
  }

  // Fallback
  return {
    groupName: input.trim() || "Nhóm job mới",
    jobs: [{ title: input.trim(), description: "", totalSalary: 1_000_000, month: currentYM(), isOnSite: false }],
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
  const [newJobTitle, setNewJobTitle] = useState("");
  const [newJobDesc, setNewJobDesc] = useState("");
  const [newJobSalary, setNewJobSalary] = useState("");
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [directorTab, setDirectorTab] = useState<"jobs" | "employees" | "approvals" | "salary">("jobs");

  // ── Employee State ───────────────────────────────────
  const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [claimPercentage, setClaimPercentage] = useState<number>(100);
  const [customPercentage, setCustomPercentage] = useState<string>("");
  const [selectedMonth, setSelectedMonth] = useState<string>(currentYM());
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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
  const [approvingItem, setApprovingItem] = useState<{ jobId: string; assignmentId: string; jobTitle: string; empName: string; salary: number } | null>(null);
  const [approveNote, setApproveNote] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

  // ── Share job state ──────────────────────────────────
  const [sharingItem, setSharingItem] = useState<{ jobId: string; assignmentId: string; jobTitle: string; currentPct: number } | null>(null);
  const [sharePercInput, setSharePercInput] = useState("");

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

  // Auto-refresh mọi 30s khi đang đăng nhập
  useEffect(() => {
    if (view === "LOGIN") return;
    const id = setInterval(() => fetchAll(), 30_000);
    return () => clearInterval(id);
  }, [view, fetchAll]);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(amount);

  // ─── Auth ────────────────────────────────────────────
  const handleDirectorLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (directorPassInput === DIRECTOR_PASS) {
      setView("DIRECTOR");
      setPassError(false);
      setDirectorPassInput("");
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
  };

  // ─── Director: Create Job ────────────────────────────
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
    const percentage = claimPercentage === -1 ? Number(customPercentage) : claimPercentage;
    if (percentage <= 0 || percentage > 100) { alert("Phần trăm không hợp lệ!"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: currentEmployee.id, employeeName: currentEmployee.name, percentage }),
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

  // ─── Employee: Share Job ─────────────────────────────
  const handleShareJob = async () => {
    if (!sharingItem) return;
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
            <h1 className="text-3xl font-bold text-gray-900">Chợ Job Bình An</h1>
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
              <h1 className="text-lg font-bold hidden sm:block">Chợ Job Bình An</h1>
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
            {(["jobs", "employees", "approvals", "salary"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setDirectorTab(tab)}
                className={`shrink-0 flex-1 sm:flex-none px-3 py-1.5 rounded-md text-sm font-medium transition-colors relative ${directorTab === tab ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {tab === "jobs" && "Jobs"}
                {tab === "employees" && <span><span className="sm:hidden">NV</span><span className="hidden sm:inline">Nhân viên</span></span>}
                {tab === "salary" && <span><span className="sm:hidden">Lương</span><span className="hidden sm:inline">Bảng lương</span></span>}
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
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <PlusCircle className="w-5 h-5 text-blue-500" /> Tạo Job Mới
                  </h2>
                  <button onClick={() => { setGroupModalOpen(true); setGroupInput(""); setPreviewJobs(null); }}
                    className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                    <Sparkles className="w-4 h-4" /> Tạo nhóm AI
                  </button>
                </div>
                <form onSubmit={handleCreateJob} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Tên công việc</label>
                      <input type="text" required value={newJobTitle} onChange={(e) => setNewJobTitle(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="VD: Dựng tập 1 phim ngắn..." />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Ngân sách (VNĐ)</label>
                      <input type="number" inputMode="numeric" required value={newJobSalary} onChange={(e) => setNewJobSalary(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                        placeholder="VD: 5000000" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả chi tiết</label>
                    <textarea value={newJobDesc} onChange={(e) => setNewJobDesc(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none h-20 resize-none"
                      placeholder="Mô tả các khâu cần làm..." />
                  </div>
                  <button type="submit" disabled={submitting}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    {submitting ? "Đang đăng..." : "Đăng Job"}
                  </button>
                </form>
              </div>

              <div>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-lg font-semibold">Danh sách Job</h2>
                  <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input type="text" value={jobSearch} onChange={(e) => setJobSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      placeholder="Tìm job..." />
                    {jobSearch && <button onClick={() => setJobSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
                {loading ? <LoadingBlock /> : jobs.length === 0 ? <EmptyBlock text="Chưa có job nào." /> : (() => {
                  const filtered = jobs.filter((j) => j.title.toLowerCase().includes(jobSearch.toLowerCase()) || j.description?.toLowerCase().includes(jobSearch.toLowerCase()));
                  if (filtered.length === 0) return <EmptyBlock text={`Không tìm thấy job nào cho “${jobSearch}”.`} />;
                  return (
                    <div className="grid gap-4">
                      {filtered.map((job) => {
                        const pct = job.assignments.reduce((a, b) => a + b.percentage, 0);
                        return (
                          <div key={job.id} className="bg-white p-4 sm:p-5 rounded-xl shadow-sm border border-gray-100">
                            <div className="flex justify-between items-start mb-3 gap-2">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <h3 className="font-semibold text-base leading-snug">{job.title}</h3>
                                  {job.expiresAt && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full flex items-center gap-1 shrink-0"><Timer className="w-2.5 h-2.5" />HH {new Date(job.expiresAt).toLocaleDateString("vi-VN")}</span>}
                                  {job.groupName && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full shrink-0">{job.groupName}</span>}
                                </div>
                                {job.description && <p className="text-gray-500 text-sm mt-0.5 line-clamp-1">{job.description}</p>}
                                <p className="text-xs text-gray-400 mt-0.5">{monthLabel(job.month || job.createdAt.slice(0, 7))}</p>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="bg-green-100 text-green-800 text-sm font-medium px-2.5 py-1 rounded-full flex items-center gap-1">
                                  <DollarSign className="w-3.5 h-3.5" />{formatCurrency(job.totalSalary)}
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
                                      <span className="text-blue-600">{a.percentage}%</span>
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
              const totalApproved = approved.reduce((s, x) => s + x.assignment.salaryEarned, 0);
              const totalPending = pending.reduce((s, x) => s + x.assignment.salaryEarned, 0);
              return { emp, approved, pending, totalApproved, totalPending };
            }).filter((r) => r.approved.length > 0 || r.pending.length > 0);

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

                {/* Tổng chi */}
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
                          lines.push(`  - ${job.title} (${assignment.percentage}%): ${assignment.salaryEarned.toLocaleString("vi-VN")} đ${assignment.note ? ` [${assignment.note}]` : ""}`);
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
                    {rows.map(({ emp, approved, pending, totalApproved, totalPending }) => (
                      <div key={emp.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm">
                        <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                              {emp.name.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold">{emp.name}</span>
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
                                    {assignment.percentage}% · Duyệt {assignment.approvedAt ? new Date(assignment.approvedAt).toLocaleDateString("vi-VN") : "—"}
                                  </p>
                                  {assignment.note && <p className="text-blue-600 text-xs mt-0.5 flex items-center gap-1"><MessageSquare className="w-3 h-3" />{assignment.note}</p>}
                                </div>
                                <span className="text-green-600 font-semibold ml-3 shrink-0">{formatCurrency(assignment.salaryEarned)}</span>
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
        </main>

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
                  rows={3} placeholder={"Ví dụ:\nNgày quay Sát Giới 27/2 Tập 1 2"}
                  className="w-full border border-gray-300 rounded-xl p-3 text-sm resize-none focus:ring-2 focus:ring-purple-500 outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Mô tả bằng tiếng Việt, AI sẽ tự sinh danh sách job phù hợp.</p>
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

          // Đang làm / chờ duyệt: job thuộc tháng đang xem (không lọc theo approvedAt)
          const inProgress = myAssignments
            .filter(({ job, assignment }) => {
              if (assignment.status !== "WORKING" && assignment.status !== "PENDING_APPROVAL") return false;
              const jm = job.month || job.createdAt.slice(0, 7);
              return jm === selectedMonth;
            })
            .reduce((sum, { assignment }) => sum + assignment.salaryEarned, 0);

          const availableJobs = jobs.filter((job) => {
            const claimed = job.assignments.reduce((a, b) => a + b.percentage, 0);
            return claimed < 100 && !job.assignments.some((a) => a.employeeId === currentEmployee?.id);
          });

          const availableValue = availableJobs.reduce((sum, job) => {
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
            const claimed = job.assignments.reduce((a, b) => a + b.percentage, 0);
            const hasActiveAssignment = job.assignments.some(
              (a) => a.employeeId === currentEmployee?.id &&
                (a.status === "WORKING" || a.status === "PENDING_APPROVAL")
            );
            return claimed < 100 && !hasActiveAssignment;
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
            const totalClaimed = job.assignments.reduce((a, b) => a + b.percentage, 0);
            const myAssignment = job.assignments.find((a) => a.employeeId === currentEmployee?.id);
            const myApprovedAssignments = job.assignments.filter(
              (a) => a.employeeId === currentEmployee?.id && a.status === "APPROVED"
            );
            const myApprovedPct = myApprovedAssignments.reduce((s, a) => s + a.percentage, 0);

            const borderClass = theme === "amber"
              ? "border-amber-300 bg-amber-50/40"
              : theme === "blue"
              ? "border-blue-300 bg-blue-50/40"
              : "border-green-300 bg-green-50/40";

            const barClass = theme === "amber"
              ? "bg-amber-400"
              : theme === "blue"
              ? "bg-blue-500"
              : "bg-green-500";

            const badgeClass = theme === "amber"
              ? "text-amber-600 bg-amber-100"
              : theme === "blue"
              ? "text-blue-600 bg-blue-100"
              : "text-green-700 bg-green-100";

            return (
              <div className={`p-4 sm:p-5 rounded-xl border-2 transition-colors ${borderClass}`}>
                <div className="flex justify-between items-start mb-2 gap-2">
                  <h3 className="font-semibold text-gray-900 leading-snug">{job.title}</h3>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeClass}`}>
                    {theme === "green" ? "✓ Xong" : theme === "blue" ? `${myAssignment?.percentage ?? 0}%` : `Còn ${100 - totalClaimed}%`}
                  </span>
                </div>
                {job.description && <p className="text-gray-500 text-sm mb-3 line-clamp-2">{job.description}</p>}
                <div className="w-full bg-gray-200 rounded-full h-1.5 mb-3">
                  <div className={`${barClass} h-1.5 rounded-full`} style={{ width: `${totalClaimed}%` }} />
                </div>
                <div className="flex flex-wrap justify-between items-center gap-2">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-900 text-sm">{formatCurrency(job.totalSalary)}</span>
                    {myAssignment && (
                      <span className={`text-xs font-medium ${theme === "green" ? "text-green-600" : "text-blue-600"}`}>
                        → {formatCurrency(myAssignment.salaryEarned)} của tôi
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {theme === "amber" && myApprovedPct > 0 && (
                      <span className="text-xs text-green-600 font-medium">✓ {myApprovedPct}%</span>
                    )}
                    {theme === "amber" && (
                      <button onClick={() => setSelectedJob(job)}
                        className="flex items-center gap-1 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                        {myApprovedPct > 0 ? `Nhận thêm` : `Nhận việc`} <ChevronRight className="w-4 h-4" />
                      </button>
                    )}
                    {theme === "blue" && myAssignment?.status === "WORKING" && (
                      <button onClick={() => handleMarkDone(job.id, myAssignment.id)} disabled={submitting}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                        <CheckCircle2 className="w-4 h-4" /> Xong
                      </button>
                    )}
                    {theme === "blue" && myAssignment?.status === "WORKING" && (
                      <button
                        onClick={() => { setSharingItem({ jobId: job.id, assignmentId: myAssignment.id, jobTitle: job.title, currentPct: myAssignment.percentage }); setSharePercInput(""); }}
                        disabled={submitting}
                        className="flex items-center gap-1.5 bg-gray-100 hover:bg-orange-50 hover:text-orange-600 text-gray-500 border border-gray-200 hover:border-orange-300 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors">
                        <Share2 className="w-3.5 h-3.5" /> Nhường
                      </button>
                    )}
                    {theme === "blue" && myAssignment?.status === "PENDING_APPROVAL" && (
                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full font-medium">Chờ duyệt</span>
                    )}
                    {theme === "green" && myApprovedAssignments[0]?.note && (
                      <span className="text-xs text-gray-500 flex items-center gap-1 max-w-[160px] truncate" title={myApprovedAssignments[0].note}>
                        <MessageSquare className="w-3 h-3 shrink-0" />{myApprovedAssignments[0].note}
                      </span>
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
                  <div className="grid gap-4 md:grid-cols-2">
                    {myActiveJobs.map((job) => <JobCard key={job.id} job={job} theme="blue" />)}
                  </div>
                </div>
              )}

              {/* Chợ việc */}
              <div>
                <h2 className="text-base font-bold text-amber-600 mb-3 flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  Chợ Việc Làm ({openJobs.length})
                </h2>
                {openJobs.length === 0
                  ? <EmptyBlock text="Không còn job nào để nhận." />
                  : (
                    <div className="grid gap-4 md:grid-cols-2">
                      {openJobs.map((job) => <JobCard key={job.id} job={job} theme="amber" />)}
                    </div>
                  )
                }
              </div>

              {/* Đã hoàn thành */}
              {myDoneJobs.length > 0 && (
                <div>
                  <h2 className="text-base font-bold text-green-700 mb-3 flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-green-500 inline-block" />
                    Đã hoàn thành ({myDoneJobs.length})
                  </h2>
                  <div className="grid gap-4 md:grid-cols-2">
                    {myDoneJobs.map((job) => <JobCard key={job.id} job={job} theme="green" />)}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
              <input
                type="number"
                min={1}
                max={sharingItem.currentPct}
                value={sharePercInput}
                onChange={(e) => setSharePercInput(e.target.value)}
                placeholder={`Hoặc nhập 1–${sharingItem.currentPct}`}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl outline-none focus:ring-2 focus:ring-orange-400 text-sm mb-4"
              />
              {Number(sharePercInput) === sharingItem.currentPct && (
                <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 mb-3">
                  ⚠️ Nhường hết {sharingItem.currentPct}% — bạn sẽ rời khỏi job này.
                </p>
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
