import sys

with open("src/app/page.tsx", "r", encoding="utf-8") as f:
    text = f.read()

target_old = """                           <button onClick={() => {
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
                           }} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-sm">"""


target_new = """                           <button onClick={() => {
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
                                          const partCount = Math.ceil(remaining / maxAmount);
                                          let currentPart = 1;
                                          while (remaining > 0) {
                                              const chunkAmt = Math.min(remaining, maxAmount);
                                              empChunks.push({
                                                  emp: empOfRaw(c),
                                                  amount: chunkAmt,
                                                  content: `${content} (Phần ${currentPart}/${partCount})`,
                                                  date: { dd: "01", mm: mmStr, yyyy: yyyyStr }
                                              });
                                              remaining -= chunkAmt;
                                              currentPart++;
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

                              const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;

                              const varRows: string[][] = [
                                ["MÃ BIÊN (Dùng trong file Word) / (Không sửa cột này)", "DIỄN GIẢI (Hướng dẫn nhập liệu)", ...splitContracts.map(() => "")],
                                ["HO_TEN_BEN_B", "Họ và tên người ký (Bắt buộc)", ...splitContracts.map(c => c.emp.profile?.hoTen || c.emp.name)],
                                ["{CCCD_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.cccd || "")],
                                ["{NGAY_CAP_CCCD_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.ngayCapCccd || "")],
                                ["{NOI_CAP_CCCD_BEN_B}", "Nhập thông tin này", ...splitContracts.map(c => c.emp.profile?.noiCapCccd || "")],
                                ["", "", ...splitContracts.map(() => "")],
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
                              const csv = varRows.map(row => row.map(esc).join(",")).join("\\n");
                              const blob = new Blob(["\\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement("a"); a.href = url;
                              a.download = `hop-dong-${directorMonth}.csv`;
                              a.click(); URL.revokeObjectURL(url);
                              setShowContractModal(false);
                           }} className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition-colors shadow-sm">"""


if target_old in text:
    text = text.replace(target_old, target_new)
    with open("src/app/page.tsx", "w", encoding="utf-8") as f:
        f.write(text)
    print("Replaced successfully")
else:
    print("Target not found")