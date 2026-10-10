const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

// Toàn bộ route dưới đây yêu cầu quyền Admin
router.use(authMiddleware, requireAdmin);

// Lấy danh sách người dùng kèm danh sách dự án và số giờ công đã thực hiện
router.get('/', (req, res) => {
  const users = db.prepare(`
    SELECT 
      u.id, u.username, u.full_name, u.role, u.department, u.is_active, u.created_at,
      COALESCE(SUM(wl.hours), 0) AS total_logged_hours,
      COALESCE(SUM(wl.ot_hours), 0) AS total_ot_hours,
      COUNT(DISTINCT wl.project_id) AS total_projects_joined,
      COUNT(wl.id) AS total_logs_count
    FROM users u
    LEFT JOIN work_logs wl ON u.id = wl.user_id
    GROUP BY u.id
    ORDER BY u.role ASC, u.full_name ASC
  `).all();

  // Truy vấn danh sách dự án và số giờ công của từng nhân viên cho mỗi dự án
  const userProjectRows = db.prepare(`
    SELECT 
      wl.user_id,
      p.id AS project_id,
      p.code AS project_code,
      p.name AS project_name,
      COALESCE(p.contract_no, '') AS contract_no,
      p.status AS project_status,
      SUM(wl.hours) AS project_hours,
      SUM(COALESCE(wl.ot_hours, 0)) AS project_ot_hours,
      COUNT(wl.id) AS log_count,
      MIN(wl.log_date) AS first_log_date,
      MAX(wl.log_date) AS last_log_date
    FROM work_logs wl
    JOIN projects p ON wl.project_id = p.id
    GROUP BY wl.user_id, p.id
    ORDER BY project_hours DESC, p.code ASC
  `).all();

  const userProjectsMap = new Map();
  userProjectRows.forEach(row => {
    if (!userProjectsMap.has(row.user_id)) {
      userProjectsMap.set(row.user_id, []);
    }
    userProjectsMap.get(row.user_id).push({
      id: row.project_id,
      code: row.project_code,
      name: row.project_name,
      contract_no: row.contract_no,
      status: row.project_status,
      hours: row.project_hours,
      ot_hours: row.project_ot_hours,
      regular_hours: Math.max(0, row.project_hours - row.project_ot_hours),
      log_count: row.log_count,
      first_log_date: row.first_log_date,
      last_log_date: row.last_log_date
    });
  });

  users.forEach(u => {
    u.projects = userProjectsMap.get(u.id) || [];
  });

  res.json({ users });
});

// Tạo tài khoản mới
router.post('/', (req, res) => {
  const { username, password, full_name, role, department } = req.body;

  if (!username || !password || !full_name) {
    return res.status(400).json({ error: 'Tên đăng nhập, Mật khẩu và Họ tên là bắt buộc.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanFullName = full_name.trim();
  const cleanRole = role === 'admin' ? 'admin' : 'employee';
  const cleanDept = department?.trim() || '';

  // Kiểm tra trùng username
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  if (existing) {
    return res.status(400).json({ error: `Tên đăng nhập '${cleanUsername}' đã được sử dụng.` });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, department, is_active)
      VALUES (?, ?, ?, ?, ?, 1)
    `).run(cleanUsername, hash, cleanFullName, cleanRole, cleanDept);

    const newUser = db.prepare(`
      SELECT id, username, full_name, role, department, is_active, created_at 
      FROM users WHERE id = ?
    `).get(info.lastInsertRowid);

    return res.status(201).json({
      message: 'Tạo tài khoản nhân viên thành công!',
      user: newUser
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi tạo tài khoản: ' + err.message });
  }
});

// Sửa thông tin tài khoản
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { full_name, role, department, is_active } = req.body;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  }

  // Không cho tự hủy quyền admin của chính mình nếu là admin duy nhất
  if (req.user.id === parseInt(id) && role && role !== 'admin') {
    return res.status(400).json({ error: 'Bạn không thể tự hạ quyền Admin của chính mình.' });
  }

  const cleanFullName = full_name ? full_name.trim() : user.full_name;
  const cleanRole = role ? (role === 'admin' ? 'admin' : 'employee') : user.role;
  const cleanDept = department !== undefined ? department.trim() : user.department;
  const cleanActive = is_active !== undefined ? (is_active ? 1 : 0) : user.is_active;

  try {
    db.prepare(`
      UPDATE users 
      SET full_name = ?, role = ?, department = ?, is_active = ?
      WHERE id = ?
    `).run(cleanFullName, cleanRole, cleanDept, cleanActive, id);

    const updated = db.prepare('SELECT id, username, full_name, role, department, is_active FROM users WHERE id = ?').get(id);
    return res.json({ message: 'Cập nhật tài khoản thành công!', user: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi cập nhật tài khoản: ' + err.message });
  }
});

// Reset mật khẩu cho nhân viên (Admin)
router.post('/:id/reset-password', (req, res) => {
  const { id } = req.params;
  const { new_password } = req.body;

  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
  }

  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);

  res.json({ message: `Đã đặt lại mật khẩu cho tài khoản '${user.username}' thành công!` });
});

// Xóa hoặc khóa tài khoản
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  if (req.user.id === parseInt(id)) {
    return res.status(400).json({ error: 'Bạn không thể tự xóa tài khoản của chính mình đang đăng nhập.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) {
    return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
  }

  // Kiểm tra xem đã có nhật ký nào chưa
  const logsCount = db.prepare('SELECT COUNT(*) as count FROM work_logs WHERE user_id = ?').get(id).count;
  if (logsCount > 0) {
    // Khóa tài khoản thay vì xóa vật lý để tránh mất dữ liệu nhật ký lịch sử
    db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(id);
    return res.json({
      message: `Tài khoản '${user.username}' đã có ${logsCount} bản ghi nhật ký nên hệ thống đã chuyển sang trạng thái KHÓA (vô hiệu hóa) để bảo toàn dữ liệu.`
    });
  }

  try {
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    return res.json({ message: `Đã xóa tài khoản '${user.username}' thành công!` });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi xóa tài khoản: ' + err.message });
  }
});

module.exports = router;
