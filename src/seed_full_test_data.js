const Database = require('better-sqlite3');
const path = require('path');

function seedFullTestData() {
  const dbPath = path.join(__dirname, '..', 'worklog.db');
  const db = new Database(dbPath);

  const users = db.prepare('SELECT id, username, full_name, role, department FROM users').all();
  const projects = db.prepare('SELECT id, code, name FROM projects ORDER BY code ASC').all();

  if (users.length === 0 || projects.length === 0) {
    console.error('Không tìm thấy danh sách nhân viên hoặc dự án.');
    return;
  }

  console.log(`Bắt đầu tạo dữ liệu giả định: ${users.length} nhân viên x ${projects.length} dự án...`);

  // Xóa sạch nhật ký cũ để nạp mới dữ liệu đồng bộ
  db.exec('DELETE FROM work_logs');
  db.exec("DELETE FROM sqlite_sequence WHERE name = 'work_logs'");

  const insertStmt = db.prepare(`
    INSERT INTO work_logs (
      user_id, project_id, log_date, hours, description, 
      work_role, ot_hours, ot_from_time, ot_to_time, ot_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const workRoles = ['Chủ nhiệm dự án', 'Chủ trì thiết kế', 'Thiết kế', 'Hỗ trợ'];
  const sampleDescriptions = [
    'Triển khai bản vẽ kiến trúc chi tiết tầng điển hình',
    'Phối hợp mô hình BIM Revit và rà soát va chạm kết cấu',
    'Hoàn thiện hồ sơ thiết kế kỹ thuật thi công giai đoạn 1',
    'Kiểm tra hiện trạng và cập nhật phương án mặt bằng',
    'Họp điều phối kỹ thuật với các bộ môn kết cấu, MEP',
    'Thiết kế cảnh quan sân vườn và chi tiết chiếu sáng ngoài trời',
    'Chỉnh sửa và hoàn thiện bản vẽ theo ý kiến phản hồi',
    'Triển khai chi tiết nội thất phòng sinh hoạt cộng đồng',
    '' // Mô tả rỗng để kiểm tra tính năng tùy chọn
  ];

  const otReasons = [
    'Chạy tiến độ bàn giao hồ sơ thiết kế theo mốc hợp đồng',
    'Xử lý gấp va chạm hệ thống đường ống và dầm sàn',
    'Hoàn thành phương án phối cảnh kịp buổi họp sáng hôm sau',
    ''
  ];

  // Các ngày làm việc trong tháng 10/2026 (từ 01 đến 10/10) và tháng 09/2026
  const octoberDates = [
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06',
    '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'
  ];

  const septemberDates = [
    '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'
  ];

  let totalInserted = 0;
  const projectCovered = new Set();
  const userCovered = new Set();

  const runTransaction = db.transaction(() => {
    // 1. Đảm bảo toàn bộ 52 dự án đều có ít nhất 1-3 bản ghi trong tháng 10/2026
    projects.forEach((proj, pIdx) => {
      // Phân bổ 2 nhân viên khác nhau cho dự án này
      const u1 = users[pIdx % users.length];
      const u2 = users[(pIdx + 7) % users.length];

      // Bản ghi cho nhân viên 1
      const date1 = octoberDates[pIdx % octoberDates.length];
      const role1 = workRoles[pIdx % workRoles.length];
      const hours1 = (pIdx % 3 === 0) ? 8 : (pIdx % 3 === 1 ? 4 : 6);
      const hasOt1 = (pIdx % 4 === 0);
      const desc1 = sampleDescriptions[pIdx % sampleDescriptions.length];

      insertStmt.run(
        u1.id, proj.id, date1, hours1, desc1,
        role1,
        hasOt1 ? 2 : 0,
        hasOt1 ? '18:00' : '',
        hasOt1 ? '20:00' : '',
        hasOt1 ? otReasons[0] : ''
      );
      totalInserted++;
      projectCovered.add(proj.id);
      userCovered.add(u1.id);

      // Bản ghi cho nhân viên 2
      const date2 = octoberDates[(pIdx + 3) % octoberDates.length];
      const role2 = workRoles[(pIdx + 2) % workRoles.length];
      const hours2 = (pIdx % 2 === 0) ? 4 : 8;
      const hasOt2 = (pIdx % 5 === 0);
      const desc2 = sampleDescriptions[(pIdx + 2) % sampleDescriptions.length];

      insertStmt.run(
        u2.id, proj.id, date2, hours2, desc2,
        role2,
        hasOt2 ? 1.5 : 0,
        hasOt2 ? '18:00' : '',
        hasOt2 ? '19:30' : '',
        hasOt2 ? otReasons[1] : ''
      );
      totalInserted++;
      projectCovered.add(proj.id);
      userCovered.add(u2.id);
    });

    // 2. Bổ sung nhật ký làm việc cho các nhân viên còn thiếu ngày công trong tháng 10
    users.forEach((user, uIdx) => {
      octoberDates.forEach((dateStr, dIdx) => {
        // Mỗi ngày nhân viên làm 1 hoặc 2 đầu việc
        if ((uIdx + dIdx) % 2 === 0) {
          const proj = projects[(uIdx * 3 + dIdx) % projects.length];
          const role = workRoles[(uIdx + dIdx) % workRoles.length];
          const hours = ((uIdx + dIdx) % 3 === 0) ? 8 : 4;
          const hasOt = (dIdx === 2 && uIdx % 3 === 0);
          const desc = sampleDescriptions[(uIdx + dIdx) % sampleDescriptions.length];

          insertStmt.run(
            user.id, proj.id, dateStr, hours, desc,
            role,
            hasOt ? 2 : 0,
            hasOt ? '18:00' : '',
            hasOt ? '20:00' : '',
            hasOt ? otReasons[2] : ''
          );
          totalInserted++;
          projectCovered.add(proj.id);
          userCovered.add(user.id);
        }
      });

      // 3. Bổ sung một số ngày trong tháng 09/2026 để kiểm tra chuyển đổi tháng
      septemberDates.forEach((dateStr, sIdx) => {
        if ((uIdx + sIdx) % 3 === 0) {
          const proj = projects[(uIdx * 2 + sIdx) % projects.length];
          const role = workRoles[(uIdx + sIdx) % workRoles.length];
          insertStmt.run(
            user.id, proj.id, dateStr, 8,
            `Triển khai hồ sơ tháng 9 dự án ${proj.name}`,
            role, 0, '', '', ''
          );
          totalInserted++;
        }
      });
    });
  });

  runTransaction();

  console.log(`\n===============================================================`);
  console.log(`-> ĐÃ TẠO THÀNH CÔNG ${totalInserted} BẢN GHI NHẬT KÝ MẪU!`);
  console.log(`-> Bao phủ: ${userCovered.size}/${users.length} nhân viên (100%)`);
  console.log(`-> Bao phủ: ${projectCovered.size}/${projects.length} dự án (100%)`);
  console.log(`===============================================================\n`);
}

seedFullTestData();
