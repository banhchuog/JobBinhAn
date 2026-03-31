import sys

with open("src/app/page.tsx", "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add state
state_match = "const [showSalaryPreview, setShowSalaryPreview] = useState(false);"
if state_match in content:
    content = content.replace(state_match, state_match + "\n  const [showContractModal, setShowContractModal] = useState(false);\n  const [selectedContractEmps, setSelectedContractEmps] = useState<string[]>([]);")

# 2. Modify button
button_old = """                    <button onClick={() => {
                      type ContractItem =
                        | { kind: "job"; emp: Employee; job: Job; assignment: JobAssignment }
                        | { kind: "manual"; emp: Employee; entry: ManualEntry };
                      const contracts: ContractItem[] = [
                        ...rows.flatMap(({ emp, approved }) =>
                          approved.map(({ job, assignment }) => ({ kind: "job" as const, emp, job, assignment }))
                        ),
                        ...rows.flatMap(({ emp, manual }) =>
                          manual.map((entry) => ({ kind: "manual" as const, emp, entry }))
                        ),
                      ];
                      if (contracts.length === 0) return;
                      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
                      const empOf = (c: ContractItem) => c.emp;
                      const amountOf = (c: ContractItem) => c.kind === "job" ? String(c.assignment.salaryEarned) : String(c.entry.amount);
                      const contentOf = (c: ContractItem) => c.kind === "job" ? (c.job.description || c.job.title) : c.entry.title + (c.entry.note ? ` — ${c.entry.note}` : "");
                      const dateOf = (c: ContractItem) => {
                        const d = c.kind === "job" ? new Date(c.job.createdAt) : new Date(c.entry.month + "-01");
                        return { dd: String(d.getDate()).padStart(2, "0"), mm: String(d.getMonth() + 1).padStart(2, "0"), yyyy: String(d.getFullYear()) };
                      };
                      const varRows: string[][] = [
                        ["MÃ BIÊN (Dùng trong file Word) / (Không sửa cột này)", "DIỄN GIẢI (Hướng dẫn nhập liệu)", ...contracts.map(() => "")],
                        ["HO_TEN_BEN_B", "Họ và tên người ký (Bắt buộc)", ...contracts.map(c => empOf(c).profile?.hoTen || empOf(c).name)],
                        ["{CCCD_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.cccd || "")],
                        ["{NGAY_CAP_CCCD_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.ngayCapCccd || "")],
                        ["{NOI_CAP_CCCD_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.noiCapCccd || "")],
                        ["", "", ...contracts.map(() => "")],
                        ["{DIA_CHI_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.diaChi || "")],
                        ["{MST_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.mst || "")],
                        ["{DIEN_THOAI_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.dienThoai || "")],
                        ["{STK_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.stk || "")],
                        ["{NGAN_HANG_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.nganHang || "")],
                        ["SO_TIEN_DOI_TAC_THUC_NHAN", "Số tiền thực nhận", ...contracts.map(amountOf)],
                        ["NOI_DUNG_CONG_VIEC", "Nội dung công việc", ...contracts.map(contentOf)],
                        ["NGAY_KY_KET", "Ngày ký", ...contracts.map(c => dateOf(c).dd)],
                        ["THANG_KY_KET", "Tháng ký", ...contracts.map(c => dateOf(c).mm)],
                        ["NAM_KY_KET", "Năm ký", ...contracts.map(c => dateOf(c).yyyy)],
                      ];
                      const csv = varRows.map(row => row.map(esc).join(",")).join("\\n");
                      const blob = new Blob(["\\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a"); a.href = url;
                      a.download = `hop-dong-${directorMonth}.csv`;
                      a.click(); URL.revokeObjectURL(url);
                    }} className="p-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors" title="Xuất hợp đồng (mail merge Word)">"""

button_new = """                    <button onClick={() => {
                      setShowContractModal(true);
                      setSelectedContractEmps(rows.map(r => r.emp.id));
                    }} className="p-2 bg-blue-500 hover:bg-blue-400 rounded-lg transition-colors" title="Xuất hợp đồng (mail merge Word)">"""

if button_old in content:
    content = content.replace(button_old, button_new)
else:
    print("Warning: Button old string not found.")

# 3. Add Modal
modal_marker = """                  );
                })()}

                {/* Chọn tháng */}"""

modal_new = """                  );
                })()}
                
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
                           <button onClick={() => {
                              const filteredRows = rows.filter(r => selectedContractEmps.includes(r.emp.id));
                              type ContractItem =
                                | { kind: "job"; emp: Employee; job: Job; assignment: JobAssignment }
                                | { kind: "manual"; emp: Employee; entry: ManualEntry };
                              const contracts: ContractItem[] = [
                                ...filteredRows.flatMap(({ emp, approved }) =>
                                  approved.map(({ job, assignment }) => ({ kind: "job" as const, emp, job, assignment }))
                                ),
                                ...filteredRows.flatMap(({ emp, manual }) =>
                                  manual.map((entry) => ({ kind: "manual" as const, emp, entry }))
                                ),
                              ];
                              if (contracts.length === 0) {
                                  alert("Không có dữ liệu hợp đồng cho nhân viên đã chọn.");
                                  return;
                              }
                              const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
                              const empOf = (c: ContractItem) => c.emp;
                              const amountOf = (c: ContractItem) => c.kind === "job" ? String(c.assignment.salaryEarned) : String(c.entry.amount);
                              const contentOf = (c: ContractItem) => c.kind === "job" ? (c.job.description || c.job.title) : c.entry.title + (c.entry.note ? ` — ${c.entry.note}` : "");
                              const dateOf = (c: ContractItem) => {
                                const d = c.kind === "job" ? new Date(c.job.createdAt) : new Date(c.entry.month + "-01");
                                return { dd: String(d.getDate()).padStart(2, "0"), mm: String(d.getMonth() + 1).padStart(2, "0"), yyyy: String(d.getFullYear()) };
                              };
                              const varRows: string[][] = [
                                ["MÃ BIÊN (Dùng trong file Word) / (Không sửa cột này)", "DIỄN GIẢI (Hướng dẫn nhập liệu)", ...contracts.map(() => "")],
                                ["HO_TEN_BEN_B", "Họ và tên người ký (Bắt buộc)", ...contracts.map(c => empOf(c).profile?.hoTen || empOf(c).name)],
                                ["{CCCD_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.cccd || "")],
                                ["{NGAY_CAP_CCCD_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.ngayCapCccd || "")],
                                ["{NOI_CAP_CCCD_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.noiCapCccd || "")],
                                ["", "", ...contracts.map(() => "")],
                                ["{DIA_CHI_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.diaChi || "")],
                                ["{MST_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.mst || "")],
                                ["{DIEN_THOAI_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.dienThoai || "")],
                                ["{STK_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.stk || "")],
                                ["{NGAN_HANG_BEN_B}", "Nhập thông tin này", ...contracts.map(c => empOf(c).profile?.nganHang || "")],
                                ["SO_TIEN_DOI_TAC_THUC_NHAN", "Số tiền thực nhận", ...contracts.map(amountOf)],
                                ["NOI_DUNG_CONG_VIEC", "Nội dung công việc", ...contracts.map(contentOf)],
                                ["NGAY_KY_KET", "Ngày ký", ...contracts.map(c => dateOf(c).dd)],
                                ["THANG_KY_KET", "Tháng ký", ...contracts.map(c => dateOf(c).mm)],
                                ["NAM_KY_KET", "Năm ký", ...contracts.map(c => dateOf(c).yyyy)],
                              ];
                              const csv = varRows.map(row => row.map(esc).join(",")).join("\\n");
                              const blob = new Blob(["\\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a"); a.href = url;
                              a.download = `hop-dong-${directorMonth}.csv`;
                              a.click(); URL.revokeObjectURL(url);
                              setShowContractModal(false);
                           }} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-sm">
                             Xuất Hợp Đồng
                           </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Chọn tháng */}"""

if modal_marker in content:
    content = content.replace(modal_marker, modal_new)
else:
    print("Warning: Modal marker not found.")

with open("src/app/page.tsx", "w", encoding="utf-8") as f:
    f.write(content)

print("Done")
