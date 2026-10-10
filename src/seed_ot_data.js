const db = require('./db');

const otReasons = [
  'Chạy tiến độ hồ sơ thiết kế kịp bàn giao cho chủ đầu tư',
  'Tăng ca hoàn thiện bản vẽ chi tiết kiến trúc',
  'Phối hợp xử lý xung đột mô hình Revit & CAD ngoài giờ',
  'Cập nhật chỉnh sửa phương án theo biên bản họp',
  'Rà soát kiểm tra hồ sơ kỹ thuật thi công giai đoạn 2',
  'Xuất bản vẽ và hoàn thiện thuyết minh kỹ thuật'
];

const timeSlots = [
  { from: '18:00', to: '20:00', hours: 2.0 },
  { from: '18:00', to: '21:00', hours: 3.0 },
  { from: '18:30', to: '20:30', hours: 2.0 },
  { from: '18:00', to: '19:30', hours: 1.5 },
  { from: '19:00', to: '21:30', hours: 2.5 }
];

// Lấy danh sách các bản ghi nhật ký
const allLogs = db.prepare('SELECT id, log_date, user_id FROM work_logs ORDER BY id ASC').all();

const updateStmt = db.prepare(`
  UPDATE work_logs 
  SET ot_hours = ?, ot_from_time = ?, ot_to_time = ?, ot_reason = ?
  WHERE id = ?
`);

let updatedCount = 0;
const updateTx = db.transaction(() => {
  allLogs.forEach((log, index) => {
    // Chọn khoảng 20% bản ghi để thêm OT (cứ 4-5 bản ghi thì có 1 bản ghi OT)
    if (index % 4 === 1) {
      const slot = timeSlots[index % timeSlots.length];
      const reason = otReasons[index % otReasons.length];
      updateStmt.run(slot.hours, slot.from, slot.to, reason, log.id);
      updatedCount++;
    }
  });
});

updateTx();
console.log(`-> Đã nạp thành công dữ liệu làm thêm giờ (OT) cho ${updatedCount} bản ghi nhật ký!`);
