const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

// Lấy danh sách dự án
// Nếu là employee: chỉ lấy dự án có status = 'active'
// Nếu là admin: lấy tất cả + thống kê tổng giờ đã thực hiện
router.get('/', authMiddleware, (req, res) => {
  if (req.user.role === 'admin') {
    const projects = db.prepare(`
      SELECT 
        p.*,
        COALESCE(SUM(wl.hours), 0) AS total_hours,
        COUNT(DISTINCT wl.user_id) AS total_members
      FROM projects p
      LEFT JOIN work_logs wl ON p.id = wl.project_id
      GROUP BY p.id
      ORDER BY 
        CASE p.status 
          WHEN 'active' THEN 1 
          WHEN 'paused' THEN 2 
          ELSE 3 
        END,
        p.created_at DESC
    `).all();
    return res.json({ projects });
  } else {
    const projects = db.prepare(`
      SELECT id, code, name, contract_no, description, status 
      FROM projects 
      WHERE status = 'active'
      ORDER BY name ASC
    `).all();
    return res.json({ projects });
  }
});

// Thêm dự án mới (Chỉ Admin)
router.post('/', authMiddleware, requireAdmin, (req, res) => {
  const { code, name, contract_no, description, status } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: 'Mã dự án và Tên dự án là bắt buộc.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const cleanName = name.trim();
  const cleanContract = contract_no ? contract_no.trim() : '';
  const cleanStatus = ['active', 'paused', 'completed'].includes(status) ? status : 'active';

  // Kiểm tra trùng mã
  const existing = db.prepare('SELECT id FROM projects WHERE code = ?').get(cleanCode);
  if (existing) {
    return res.status(400).json({ error: `Mã dự án '${cleanCode}' đã tồn tại trong hệ thống.` });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO projects (code, name, contract_no, description, status)
      VALUES (?, ?, ?, ?, ?)
    `);
    const info = stmt.run(cleanCode, cleanName, cleanContract, description?.trim() || '', cleanStatus);

    const newProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(info.lastInsertRowid);
    return res.status(201).json({
      message: 'Tạo dự án thành công!',
      project: newProject
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi tạo dự án: ' + err.message });
  }
});

// Chỉnh sửa dự án (Chỉ Admin)
router.put('/:id', authMiddleware, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { code, name, contract_no, description, status } = req.body;

  if (!code || !name) {
    return res.status(400).json({ error: 'Mã dự án và Tên dự án là bắt buộc.' });
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) {
    return res.status(404).json({ error: 'Không tìm thấy dự án.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const cleanName = name.trim();
  const cleanContract = contract_no !== undefined ? contract_no.trim() : (project.contract_no || '');
  const cleanStatus = ['active', 'paused', 'completed'].includes(status) ? status : project.status;

  // Kiểm tra trùng mã với dự án khác
  const existing = db.prepare('SELECT id FROM projects WHERE code = ? AND id != ?').get(cleanCode, id);
  if (existing) {
    return res.status(400).json({ error: `Mã dự án '${cleanCode}' đã được sử dụng bởi dự án khác.` });
  }

  try {
    db.prepare(`
      UPDATE projects 
      SET code = ?, name = ?, contract_no = ?, description = ?, status = ?
      WHERE id = ?
    `).run(cleanCode, cleanName, cleanContract, description?.trim() || '', cleanStatus, id);

    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    return res.json({ message: 'Cập nhật dự án thành công!', project: updated });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi cập nhật dự án: ' + err.message });
  }
});

// Xóa dự án (Chỉ Admin)
router.delete('/:id', authMiddleware, requireAdmin, (req, res) => {
  const { id } = req.params;

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) {
    return res.status(404).json({ error: 'Không tìm thấy dự án.' });
  }

  // Kiểm tra xem đã có nhật ký nào liên kết chưa
  const logsCount = db.prepare('SELECT COUNT(*) as count FROM work_logs WHERE project_id = ?').get(id).count;
  if (logsCount > 0) {
    return res.status(400).json({
      error: `Dự án này đã có ${logsCount} bản ghi nhật ký làm việc, không thể xóa vĩnh viễn. Bạn có thể chuyển trạng thái sang 'Hoàn thành' hoặc 'Tạm dừng'.`
    });
  }

  try {
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    return res.json({ message: 'Đã xóa dự án thành công!' });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi xóa dự án: ' + err.message });
  }
});

module.exports = router;
