const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');

// Lấy danh sách dự án
// Nếu là employee: chỉ lấy dự án có status = 'active', sắp xếp theo mã dự án tăng dần
// Nếu là admin: lấy tất cả + thống kê tổng giờ lũy kế + chi tiết giờ công từng nhân viên trong tháng
router.get('/', authMiddleware, (req, res) => {
  const month = req.query.month || new Date().toISOString().slice(0, 7);

  if (req.user.role === 'admin') {
    // 1. Lấy toàn bộ danh sách dự án kèm tổng giờ lũy kế (all-time)
    const projects = db.prepare(`
      SELECT 
        p.*,
        COALESCE(SUM(wl.hours), 0) AS total_hours,
        COUNT(DISTINCT wl.user_id) AS total_members
      FROM projects p
      LEFT JOIN work_logs wl ON p.id = wl.project_id
      GROUP BY p.id
      ORDER BY p.code ASC
    `).all();

    // 2. Thống kê chi tiết số giờ từng nhân viên đã thực hiện trong tháng được chọn cho mỗi dự án
    const userHoursRows = db.prepare(`
      SELECT 
        wl.project_id,
        u.id AS user_id,
        u.full_name,
        u.username,
        ROUND(SUM(wl.hours), 1) AS user_hours,
        ROUND(SUM(COALESCE(wl.ot_hours, 0)), 1) AS user_ot_hours
      FROM work_logs wl
      JOIN users u ON wl.user_id = u.id
      WHERE strftime('%Y-%m', wl.log_date) = ?
      GROUP BY wl.project_id, u.id
      ORDER BY user_hours DESC, u.full_name ASC
    `).all(month);

    const projectUserHoursMap = {};
    userHoursRows.forEach(row => {
      if (!projectUserHoursMap[row.project_id]) {
        projectUserHoursMap[row.project_id] = [];
      }
      projectUserHoursMap[row.project_id].push(row);
    });

    projects.forEach(p => {
      p.month_users = projectUserHoursMap[p.id] || [];
      p.month_total_hours = p.month_users.reduce((sum, u) => sum + u.user_hours, 0);
      p.month_total_ot_hours = p.month_users.reduce((sum, u) => sum + u.user_ot_hours, 0);
    });

    return res.json({ projects, selected_month: month });
  } else {
    const projects = db.prepare(`
      SELECT id, code, name, contract_no, description, status, manager, design_lead, designer, supporter 
      FROM projects 
      WHERE status = 'active'
      ORDER BY code ASC
    `).all();
    return res.json({ projects });
  }
});

// Thêm dự án mới (Chỉ Admin)
router.post('/', authMiddleware, requireAdmin, (req, res) => {
  const { code, name, contract_no, description, status, manager, design_lead, designer, supporter } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: 'Mã dự án và Tên dự án là bắt buộc.' });
  }

  const cleanCode = code.trim().toUpperCase();
  const cleanName = name.trim();
  const cleanContract = contract_no ? contract_no.trim() : '';
  const cleanStatus = ['active', 'paused', 'completed'].includes(status) ? status : 'active';
  const cleanManager = manager ? manager.trim() : '';
  const cleanDesignLead = design_lead ? design_lead.trim() : '';
  const cleanDesigner = designer ? designer.trim() : '';
  const cleanSupporter = supporter ? supporter.trim() : '';

  // Kiểm tra trùng mã và tên
  const existing = db.prepare('SELECT id FROM projects WHERE code = ? AND name = ?').get(cleanCode, cleanName);
  if (existing) {
    return res.status(400).json({ error: `Dự án với mã '${cleanCode}' và tên '${cleanName}' đã tồn tại trong hệ thống.` });
  }

  try {
    const stmt = db.prepare(`
      INSERT INTO projects (code, name, contract_no, description, status, manager, design_lead, designer, supporter)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(cleanCode, cleanName, cleanContract, description?.trim() || '', cleanStatus, cleanManager, cleanDesignLead, cleanDesigner, cleanSupporter);

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
  const { code, name, contract_no, description, status, manager, design_lead, designer, supporter } = req.body;

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
  const cleanManager = manager !== undefined ? manager.trim() : (project.manager || '');
  const cleanDesignLead = design_lead !== undefined ? design_lead.trim() : (project.design_lead || '');
  const cleanDesigner = designer !== undefined ? designer.trim() : (project.designer || '');
  const cleanSupporter = supporter !== undefined ? supporter.trim() : (project.supporter || '');

  // Kiểm tra trùng cả mã và tên với dự án khác
  const existing = db.prepare('SELECT id FROM projects WHERE code = ? AND name = ? AND id != ?').get(cleanCode, cleanName, id);
  if (existing) {
    return res.status(400).json({ error: `Dự án với mã '${cleanCode}' và tên '${cleanName}' đã tồn tại.` });
  }

  try {
    db.prepare(`
      UPDATE projects 
      SET code = ?, name = ?, contract_no = ?, description = ?, status = ?,
          manager = ?, design_lead = ?, designer = ?, supporter = ?
      WHERE id = ?
    `).run(cleanCode, cleanName, cleanContract, description?.trim() || '', cleanStatus, cleanManager, cleanDesignLead, cleanDesigner, cleanSupporter, id);

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
