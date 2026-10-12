const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware } = require('../auth');

router.use(authMiddleware);

// Lấy danh sách nhật ký theo bộ lọc
router.get('/', (req, res) => {
  const { date, month, project_id, user_id, limit = 100 } = req.query;

  let query = `
    SELECT 
      wl.id, wl.user_id, wl.project_id, wl.log_date, wl.hours, wl.description,
      COALESCE(wl.work_role, 'Thiết kế') AS work_role,
      COALESCE(wl.ot_hours, 0) AS ot_hours,
      COALESCE(wl.ot_from_time, '') AS ot_from_time,
      COALESCE(wl.ot_to_time, '') AS ot_to_time,
      COALESCE(wl.ot_reason, '') AS ot_reason,
      wl.created_at,
      u.full_name AS user_name, u.username, u.department,
      p.code AS project_code, p.name AS project_name
    FROM work_logs wl
    JOIN users u ON wl.user_id = u.id
    JOIN projects p ON wl.project_id = p.id
    WHERE 1=1
  `;
  const params = [];

  // Cho phép xem nhật ký của tất cả thành viên, hoặc lọc theo nhân viên cụ thể nếu có truyền user_id
  if (user_id) {
    query += ' AND wl.user_id = ?';
    params.push(user_id);
  }

  if (date) {
    query += ' AND wl.log_date = ?';
    params.push(date);
  } else if (month) {
    // Tháng định dạng YYYY-MM
    query += ' AND wl.log_date LIKE ?';
    params.push(`${month}%`);
  }

  if (project_id) {
    query += ' AND wl.project_id = ?';
    params.push(project_id);
  }

  query += ' ORDER BY wl.log_date DESC, wl.id DESC LIMIT ?';
  params.push(parseInt(limit));

  const logs = db.prepare(query).all(...params);
  res.json({ logs });
});

// Lấy tổng quan ngày của người dùng đang đăng nhập
router.get('/daily-summary', (req, res) => {
  const today = req.query.date || new Date().toISOString().split('T')[0];

  const logs = db.prepare(`
    SELECT 
      wl.id, wl.user_id, wl.project_id, wl.log_date, wl.hours, wl.description,
      COALESCE(wl.work_role, 'Thiết kế') AS work_role,
      COALESCE(wl.ot_hours, 0) AS ot_hours,
      COALESCE(wl.ot_from_time, '') AS ot_from_time,
      COALESCE(wl.ot_to_time, '') AS ot_to_time,
      COALESCE(wl.ot_reason, '') AS ot_reason,
      p.code AS project_code, p.name AS project_name
    FROM work_logs wl
    JOIN projects p ON wl.project_id = p.id
    WHERE wl.user_id = ? AND wl.log_date = ?
    ORDER BY wl.id DESC
  `).all(req.user.id, today);

  const totalHours = logs.reduce((sum, item) => sum + item.hours, 0);
  const totalOtHours = logs.reduce((sum, item) => sum + (item.ot_hours || 0), 0);

  res.json({
    date: today,
    total_hours: totalHours,
    total_ot_hours: totalOtHours,
    logs
  });
});

// Lấy danh sách các mã dự án mà người dùng đã từng ghi gần đây (để chọn nhanh)
router.get('/recent-projects', (req, res) => {
  const targetUserId = (req.user.role === 'admin' && req.query.user_id) ? parseInt(req.query.user_id) : req.user.id;
  try {
    const recentProjects = db.prepare(`
      SELECT p.id, p.code, p.name, p.contract_no, MAX(wl.id) as max_id
      FROM work_logs wl
      JOIN projects p ON wl.project_id = p.id
      WHERE wl.user_id = ?
      GROUP BY p.id
      ORDER BY max_id DESC
      LIMIT 8
    `).all(targetUserId);

    res.json({ recent_projects: recentProjects });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi tải dự án gần đây: ' + err.message });
  }
});

// Thêm nhật ký công việc mới
router.post('/', (req, res) => {
  const { project_id, log_date, hours, description, ot_hours, ot_from_time, ot_to_time, ot_reason, user_id, work_role } = req.body;

  // "Nội dung công việc đã làm" không nhất thiết cần điền (tùy chọn)
  if (!project_id || !log_date || hours === undefined) {
    return res.status(400).json({ error: 'Vui lòng chọn Dự án, Ngày làm việc và Số giờ làm việc.' });
  }

  const numHours = parseFloat(hours);
  if (isNaN(numHours) || numHours <= 0 || numHours > 24) {
    return res.status(400).json({ error: 'Số giờ làm việc phải là số dương hợp lệ (từ 0.1 đến 24 giờ).' });
  }

  const numOtHours = ot_hours !== undefined && ot_hours !== '' ? parseFloat(ot_hours) : 0;
  if (isNaN(numOtHours) || numOtHours < 0 || numOtHours > 24) {
    return res.status(400).json({ error: 'Số giờ làm thêm (OT) không hợp lệ (từ 0 đến 24 giờ).' });
  }

  // 4 thể loại công việc cố định
  const validRoles = ['Chủ nhiệm dự án', 'Chủ trì thiết kế', 'Thiết kế', 'Hỗ trợ'];
  const cleanWorkRole = validRoles.includes(work_role) ? work_role : 'Thiết kế';

  // Xác định nhân viên thực hiện (Admin có quyền chọn nhân viên khác)
  const targetUserId = (req.user.role === 'admin' && user_id) ? parseInt(user_id) : req.user.id;

  // Kiểm tra nhân viên tồn tại
  const targetUser = db.prepare('SELECT id FROM users WHERE id = ?').get(targetUserId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Nhân viên đã chọn không tồn tại.' });
  }

  // Kiểm tra dự án tồn tại và còn hoạt động
  const project = db.prepare('SELECT id, name, status FROM projects WHERE id = ?').get(project_id);
  if (!project) {
    return res.status(404).json({ error: 'Dự án đã chọn không tồn tại.' });
  }

  if (project.status !== 'active' && req.user.role !== 'admin') {
    return res.status(400).json({ error: 'Dự án này đã đóng hoặc tạm dừng, không thể ghi nhận nhật ký.' });
  }

  // Kiểm tra định dạng ngày YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(log_date)) {
    return res.status(400).json({ error: 'Định dạng ngày không hợp lệ (cần YYYY-MM-DD).' });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO work_logs (user_id, project_id, log_date, hours, description, ot_hours, ot_from_time, ot_to_time, ot_reason, work_role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      targetUserId,
      project_id,
      log_date,
      numHours,
      (description || '').trim(),
      numOtHours,
      (ot_from_time || '').trim(),
      (ot_to_time || '').trim(),
      (ot_reason || '').trim(),
      cleanWorkRole
    );

    const createdLog = db.prepare(`
      SELECT 
        wl.*,
        p.code AS project_code, p.name AS project_name,
        u.full_name AS user_name, u.username, u.department
      FROM work_logs wl
      JOIN projects p ON wl.project_id = p.id
      JOIN users u ON wl.user_id = u.id
      WHERE wl.id = ?
    `).get(info.lastInsertRowid);

    return res.status(201).json({
      message: 'Ghi nhật ký thành công!',
      log: createdLog
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi lưu nhật ký: ' + err.message });
  }
});

// Sửa nhật ký công việc
router.put('/:id', (req, res) => {
  const { id } = req.params;
  const { project_id, log_date, hours, description, ot_hours, ot_from_time, ot_to_time, ot_reason, user_id, work_role } = req.body;

  const log = db.prepare('SELECT * FROM work_logs WHERE id = ?').get(id);
  if (!log) {
    return res.status(404).json({ error: 'Không tìm thấy bản ghi nhật ký.' });
  }

  // Chỉ người tạo hoặc admin mới được sửa
  if (log.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bạn không có quyền chỉnh sửa nhật ký của người khác.' });
  }

  const numHours = hours !== undefined ? parseFloat(hours) : log.hours;
  if (isNaN(numHours) || numHours <= 0 || numHours > 24) {
    return res.status(400).json({ error: 'Số giờ làm việc không hợp lệ (từ 0.1 đến 24 giờ).' });
  }

  const numOtHours = ot_hours !== undefined && ot_hours !== '' ? parseFloat(ot_hours) : (log.ot_hours || 0);
  if (isNaN(numOtHours) || numOtHours < 0 || numOtHours > 24) {
    return res.status(400).json({ error: 'Số giờ làm thêm (OT) không hợp lệ (từ 0 đến 24 giờ).' });
  }

  const validRoles = ['Chủ nhiệm dự án', 'Chủ trì thiết kế', 'Thiết kế', 'Hỗ trợ'];
  const targetWorkRole = work_role && validRoles.includes(work_role) ? work_role : (log.work_role || 'Thiết kế');

  const targetProjectId = project_id || log.project_id;
  const project = db.prepare('SELECT id, status FROM projects WHERE id = ?').get(targetProjectId);
  if (!project) {
    return res.status(404).json({ error: 'Dự án không tồn tại.' });
  }

  const targetUserId = (req.user.role === 'admin' && user_id) ? parseInt(user_id) : log.user_id;
  const targetDate = log_date || log.log_date;
  const targetDesc = description !== undefined ? description.trim() : log.description;
  const targetOtFrom = ot_from_time !== undefined ? ot_from_time.trim() : (log.ot_from_time || '');
  const targetOtTo = ot_to_time !== undefined ? ot_to_time.trim() : (log.ot_to_time || '');
  const targetOtReason = ot_reason !== undefined ? ot_reason.trim() : (log.ot_reason || '');

  try {
    db.prepare(`
      UPDATE work_logs 
      SET user_id = ?, project_id = ?, log_date = ?, hours = ?, description = ?, 
          ot_hours = ?, ot_from_time = ?, ot_to_time = ?, ot_reason = ?, work_role = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(targetUserId, targetProjectId, targetDate, numHours, targetDesc, numOtHours, targetOtFrom, targetOtTo, targetOtReason, targetWorkRole, id);

    const updatedLog = db.prepare(`
      SELECT 
        wl.*,
        p.code AS project_code, p.name AS project_name,
        u.full_name AS user_name, u.username, u.department
      FROM work_logs wl
      JOIN projects p ON wl.project_id = p.id
      JOIN users u ON wl.user_id = u.id
      WHERE wl.id = ?
    `).get(id);

    return res.json({
      message: 'Cập nhật nhật ký thành công!',
      log: updatedLog
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi cập nhật nhật ký: ' + err.message });
  }
});

// Xóa nhật ký công việc
router.delete('/:id', (req, res) => {
  const { id } = req.params;

  const log = db.prepare('SELECT * FROM work_logs WHERE id = ?').get(id);
  if (!log) {
    return res.status(404).json({ error: 'Không tìm thấy bản ghi nhật ký.' });
  }

  // Chỉ người tạo hoặc admin mới được xóa
  if (log.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Bạn không có quyền xóa nhật ký của người khác.' });
  }

  try {
    db.prepare('DELETE FROM work_logs WHERE id = ?').run(id);
    return res.json({ message: 'Đã xóa bản ghi nhật ký thành công!' });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi xóa: ' + err.message });
  }
});

module.exports = router;
