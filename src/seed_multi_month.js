const Database = require('better-sqlite3');
const path = require('path');

function seedMultiMonthLogs() {
  const dbPath = path.join(__dirname, '..', 'worklog.db');
  const db = new Database(dbPath);

  const users = db.prepare("SELECT id, full_name, department FROM users WHERE role = 'employee'").all();
  const projects = db.prepare("SELECT id, code, name FROM projects WHERE code != '000000'").all();

  if (users.length === 0 || projects.length === 0) {
    console.log('Chưa có users hoặc projects.');
    return;
  }

  // Clear existing logs to reseed fresh realistic multi-month data
  db.exec('DELETE FROM work_logs');

  const insertLog = db.prepare(`
    INSERT INTO work_logs (user_id, project_id, log_date, hours, description)
    VALUES (?, ?, ?, ?, ?)
  `);

  console.log(`Đang tạo dữ liệu nhật ký cho ${users.length} nhân viên và ${projects.length} dự án...`);

  // We will seed logs for August, September, October 2026 (Months 08, 09, 10)
  // Let's create realistic distributions:
  // Each employee works 15-20 days per month across 2-4 projects
  const months = ['2026-08', '2026-09', '2026-10'];
  let totalLogs = 0;

  const insertMany = db.transaction(() => {
    users.forEach((user, uIdx) => {
      // Pick 2-4 preferred projects for this employee based on their team
      let userProjects = [];
      if (user.department.includes('CAD')) {
        userProjects = projects.filter(p => ['190809', '201035', '201238', '220705', '230901'].includes(p.code));
      } else if (user.department.includes('REVIT')) {
        userProjects = projects.filter(p => ['201035', '201238', '240101.1', '240402', '250102'].includes(p.code));
      } else if (user.department.includes('Design')) {
        userProjects = projects.filter(p => ['190809', '230602', '240101.1', '250201', '260101'].includes(p.code));
      } else if (user.department.includes('Landscape')) {
        userProjects = projects.filter(p => ['240101.2', '250102', '250801', '260401'].includes(p.code));
      } else if (user.department.includes('ID')) {
        userProjects = projects.filter(p => ['240101.3', '240402', '250201', '260201'].includes(p.code));
      } else {
        userProjects = projects.slice(0, 4);
      }

      if (userProjects.length === 0) userProjects = projects.slice(0, 3);

      months.forEach((mStr, mIdx) => {
        // Work on specific dates in month
        const days = [5, 8, 12, 15, 18, 22, 25, 28];
        days.forEach((day, dIdx) => {
          const dayStr = String(day).padStart(2, '0');
          const dateStr = `${mStr}-${dayStr}`;
          const proj = userProjects[(uIdx + dIdx) % userProjects.length];
          const hours = ((uIdx + dIdx) % 2 === 0) ? 8 : 4;
          const desc = `Thực hiện hồ sơ thiết kế và bản vẽ kỹ thuật dự án ${proj.name}`;

          insertLog.run(user.id, proj.id, dateStr, hours, desc);
          totalLogs++;
        });
      });
    });
  });

  insertMany();
  console.log(`-> Đã nạp thành công ${totalLogs} lượt ghi nhật ký cho các tháng 08, 09, 10/2026.`);
}

seedMultiMonthLogs();
