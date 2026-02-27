export type Role = 'DIRECTOR' | 'EMPLOYEE';

export interface Employee {
  id: string;
  name: string;
  balance: number;
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
