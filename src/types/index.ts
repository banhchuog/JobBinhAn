export type Role = 'DIRECTOR' | 'EMPLOYEE';

export interface EmployeeProfile {
  /** Trạng thái lao động: chính thức (mặc định) hoặc thử việc */
  employmentStatus?: 'official' | 'probation';
  hoTen?: string;         // Họ và tên đầy đủ (cập nhật display name)
  cccd?: string;          // Số CCCD/CMND
  ngayCapCccd?: string;   // YYYY-MM-DD
  noiCapCccd?: string;    // Nơi cấp CCCD
  diaChi?: string;        // Địa chỉ thường trú
  mst?: string;           // Mã số thuế cá nhân
  dienThoai?: string;     // Số điện thoại
  stk?: string;           // Số tài khoản ngân hàng
  nganHang?: string;      // Tên ngân hàng
}

export interface Employee {
  id: string;
  name: string;
  balance: number;
  profile?: EmployeeProfile;
  isActive?: boolean;
}

export interface Job {
  id: string;
  title: string;
  description: string;
  totalSalary: number;
  status: 'OPEN' | 'IN_PROGRESS' | 'COMPLETED';
  createdAt: string;
  /** YYYY-MM — tháng job được tạo, dùng để tính lương tháng */
  month: string;
  assignments: JobAssignment[];
  /** ISO — job tại chỗ sẽ tự ẩn sau ngày này nếu chưa ai nhận */
  expiresAt?: string;
  /** ID nhóm job (khi tạo hàng loạt bằng AI) */
  groupId?: string;
  /** Tên nhóm job */
  groupName?: string;
  /** Loại job: "standard" (mặc định) hoặc "mini" (theo đơn vị clip) */
  jobType?: 'standard' | 'mini';
  /** Nhóm nghiệp vụ của job: hậu kỳ, kịch bản, đạo diễn... */
  jobCategory?: string;
  /** Tên dự án / phim / campaign */
  projectName?: string;
  /** Loại đơn vị tính công */
  workUnit?: 'episode' | 'day';
  /** Danh sách tên/số tập, ví dụ: "14 15 16 17 18" */
  episodeLabel?: string;
  /** Danh sách ngày trong tháng, ví dụ: "14 15 16" */
  dayLabel?: string;
  /** Số tập / số ngày */
  workUnits?: number;
  /** Đơn giá trên mỗi tập / ngày */
  ratePerUnit?: number;
  /** [mini] Thù lao mỗi clip/đơn vị */
  unitPrice?: number;
  /** [mini] Tổng số clip/đơn vị */
  totalUnits?: number;
}

export interface JobAssignment {
  id: string;
  employeeId: string;
  employeeName: string;
  percentage: number;
  salaryEarned: number;
  assignedAt: string;
  status: 'WORKING' | 'PENDING_APPROVAL' | 'APPROVED';
  /** ISO timestamp lúc Director bấm Duyệt */
  approvedAt?: string;
  /** Ghi chú của Director khi duyệt */
  note?: string;
  /** [mini] Số clip/đơn vị trong assignment này */
  units?: number;
}

export interface ManualEntry {
  id: string;
  empId: string;
  month: string;   // YYYY-MM
  title: string;
  amount: number;
  note: string;
}

export interface CassoTransactionRecord {
  transactionId: string;
  bookingDate: string;
  amount: number;
  isIncoming: boolean;
  isAep: boolean;
  description: string;
  counterAccountName: string;
  raw: Record<string, unknown>;
  transactionAt?: string;
  receivedAt?: string;
  updatedAt?: string;
}
