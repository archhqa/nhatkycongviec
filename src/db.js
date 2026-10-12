const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'worklog.db');
const db = new Database(dbPath);

// Bật WAL mode để tăng tốc đọc/ghi đồng thời
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  // Tạo bảng người dùng
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      department TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Tạo bảng dự án
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      contract_no TEXT DEFAULT '',
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      manager TEXT DEFAULT '',
      design_lead TEXT DEFAULT '',
      designer TEXT DEFAULT '',
      supporter TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(code, name)
    );
  `);
  try { db.exec("ALTER TABLE projects ADD COLUMN contract_no TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE projects ADD COLUMN manager TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE projects ADD COLUMN design_lead TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE projects ADD COLUMN designer TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE projects ADD COLUMN supporter TEXT DEFAULT ''"); } catch (e) {}

  // Tạo bảng nhật ký làm việc
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE RESTRICT,
      log_date TEXT NOT NULL,
      hours REAL NOT NULL,
      description TEXT NOT NULL,
      work_role TEXT DEFAULT 'Thiết kế',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_work_logs_date ON work_logs(log_date);
    CREATE INDEX IF NOT EXISTS idx_work_logs_user ON work_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_work_logs_project ON work_logs(project_id);
  `);
  try { db.exec("ALTER TABLE work_logs ADD COLUMN ot_hours REAL DEFAULT 0"); } catch (e) {}
  try { db.exec("ALTER TABLE work_logs ADD COLUMN ot_from_time TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE work_logs ADD COLUMN ot_to_time TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE work_logs ADD COLUMN ot_reason TEXT DEFAULT ''"); } catch (e) {}
  try { db.exec("ALTER TABLE work_logs ADD COLUMN work_role TEXT DEFAULT 'Thiết kế'"); } catch (e) {}

  // Kiểm tra và seed tài khoản ban đầu nếu chưa có user nào
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync('admin123', salt);
    const empHash = bcrypt.hashSync('123456', salt);

    const insertUser = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, department, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `);

    insertUser.run('admin', adminHash, 'Quản Trị Viên', 'admin', 'Ban Giám Đốc');
    insertUser.run('nv_nam', empHash, 'Nguyễn Văn Nam', 'employee', 'Kỹ thuật phần mềm');
    insertUser.run('nv_lan', empHash, 'Trần Thị Lan', 'employee', 'Thiết kế UI/UX');
    insertUser.run('nv_tuan', empHash, 'Lê Hoàng Tuấn', 'employee', 'Triển khai & Kiểm thử');

    console.log('-> Đã tạo tài khoản mặc định: admin (pass: admin123) và 3 nhân viên mẫu (pass: 123456)');
  }

  // Kiểm tra và seed dự án mẫu nếu chưa có dự án nào
  const projectCount = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
  if (projectCount === 0) {
    const insertProj = db.prepare(`
      INSERT INTO projects (code, name, description, status)
      VALUES (?, ?, ?, ?)
    `);

    insertProj.run('DA-ECOMMERCE', 'Phát triển Nền tảng Bán hàng Online', 'Xây dựng website bán hàng đa kênh và thanh toán trực tuyến', 'active');
    insertProj.run('DA-ERP-PRO', 'Nâng cấp Hệ thống ERP Doanh nghiệp', 'Tích hợp phân hệ kế toán và quản trị nhân sự tổng thể', 'active');
    insertProj.run('DA-APP-KHO', 'Ứng dụng Quản lý Kho Di động', 'App quét mã vạch kiểm kê tồn kho thời gian thực trên Android/iOS', 'active');
    insertProj.run('DA-SUPPORT', 'Bảo trì & Hỗ trợ Kỹ thuật Khách hàng', 'Tiếp nhận xử lý sự cố và bảo dưỡng định kỳ các dịch vụ', 'active');

    console.log('-> Đã tạo 4 dự án mẫu ban đầu.');
  }
}

initDatabase();

module.exports = db;
