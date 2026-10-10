const db = require('../src/db');

function seedDemoLogs() {
  const currentCount = db.prepare('SELECT COUNT(*) as count FROM work_logs').get().count;
  if (currentCount > 0) {
    console.log('Đã có dữ liệu nhật ký trong database.');
    return;
  }

  const users = db.prepare("SELECT id, username FROM users WHERE role = 'employee'").all();
  const projects = db.prepare('SELECT id, code FROM projects').all();

  if (users.length === 0 || projects.length === 0) return;

  const insertLog = db.prepare(`
    INSERT INTO work_logs (user_id, project_id, log_date, hours, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Tạo mẫu nhật ký cho một số ngày gần đây trong tháng 10/2026
  const logs = [
    // Nhân viên Nam (Kỹ thuật)
    { user: 'nv_nam', proj: 'DA-ECOMMERCE', date: '2026-10-05', hours: 4, desc: 'Thiết kế cơ sở dữ liệu và xây dựng API giỏ hàng' },
    { user: 'nv_nam', proj: 'DA-ECOMMERCE', date: '2026-10-05', hours: 4, desc: 'Tích hợp cổng thanh toán VNPay và Momo' },
    { user: 'nv_nam', proj: 'DA-ECOMMERCE', date: '2026-10-06', hours: 5, desc: 'Tối ưu tốc độ tải trang sản phẩm và xử lý caching' },
    { user: 'nv_nam', proj: 'DA-SUPPORT',    date: '2026-10-06', hours: 3, desc: 'Hỗ trợ khách hàng khắc phục sự cố đồng bộ đơn hàng' },
    { user: 'nv_nam', proj: 'DA-ECOMMERCE', date: '2026-10-07', hours: 8, desc: 'Hoàn thiện luồng checkout và kiểm thử đơn hàng' },
    { user: 'nv_nam', proj: 'DA-APP-KHO',   date: '2026-10-08', hours: 4, desc: 'Hỗ trợ team mobile cấu hình webhook kiểm kê kho' },

    // Nhân viên Lan (Thiết kế UI/UX)
    { user: 'nv_lan', proj: 'DA-ECOMMERCE', date: '2026-10-05', hours: 8, desc: 'Thiết kế giao diện trang chủ và chi tiết sản phẩm trên Figma' },
    { user: 'nv_lan', proj: 'DA-APP-KHO',   date: '2026-10-06', hours: 6, desc: 'Thiết kế giao diện màn hình quét mã vạch và kiểm kho' },
    { user: 'nv_lan', proj: 'DA-ERP-PRO',   date: '2026-10-06', hours: 2, desc: 'Thống nhất bảng màu và icon phân hệ nhân sự' },
    { user: 'nv_lan', proj: 'DA-ERP-PRO',   date: '2026-10-07', hours: 7.5, desc: 'Thiết kế mockup báo cáo tài chính và dashboard quản trị' },

    // Nhân viên Tuấn (Kiểm thử & Triển khai)
    { user: 'nv_tuan', proj: 'DA-ERP-PRO',   date: '2026-10-05', hours: 8, desc: 'Cài đặt môi trường staging và kiểm thử luồng tạo hóa đơn' },
    { user: 'nv_tuan', proj: 'DA-APP-KHO',   date: '2026-10-06', hours: 8, desc: 'Kiểm thử ứng dụng mobile trên thiết bị Android và iOS' },
    { user: 'nv_tuan', proj: 'DA-SUPPORT',   date: '2026-10-07', hours: 4, desc: 'Cập nhật tài liệu hướng dẫn vận hành cho đối tác' },
    { user: 'nv_tuan', proj: 'DA-ECOMMERCE', date: '2026-10-07', hours: 4, desc: 'Viết kịch bản test tự động chức năng thanh toán' }
  ];

  const userMap = Object.fromEntries(users.map(u => [u.username, u.id]));
  const projMap = Object.fromEntries(projects.map(p => [p.code, p.id]));

  for (const item of logs) {
    const uid = userMap[item.user];
    const pid = projMap[item.proj];
    if (uid && pid) {
      insertLog.run(uid, pid, item.date, item.hours, item.desc);
    }
  }

  console.log(`-> Đã nạp thành công ${logs.length} bản ghi nhật ký mẫu sinh động.`);
}

seedDemoLogs();
