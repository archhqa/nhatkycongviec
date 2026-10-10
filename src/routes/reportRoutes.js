const express = require('express');
const router = express.Router();
const db = require('../db');
const { authMiddleware, requireAdmin } = require('../auth');
const { exportHpaTimesheet } = require('../services/hpaExcelService');

// Toàn bộ báo cáo yêu cầu quyền Admin
router.use(authMiddleware, requireAdmin);

// Lấy dữ liệu tổng hợp theo tháng cho Dashboard và Biểu đồ
router.get('/monthly', (req, res) => {
  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
  const month = req.query.month || currentMonth;

  // 1. Tổng giờ công theo từng dự án trong tháng
  const projectSummary = db.prepare(`
    SELECT 
      p.id AS project_id,
      p.code AS project_code,
      p.name AS project_name,
      p.status AS project_status,
      COALESCE(SUM(wl.hours), 0) AS total_hours,
      COALESCE(SUM(wl.ot_hours), 0) AS total_ot_hours,
      COUNT(DISTINCT wl.user_id) AS user_count,
      COUNT(wl.id) AS log_count
    FROM projects p
    LEFT JOIN work_logs wl ON p.id = wl.project_id AND wl.log_date LIKE ?
    GROUP BY p.id
    ORDER BY total_hours DESC, p.name ASC
  `).all(`${month}%`);

  // Tính tổng số giờ toàn công ty trong tháng
  const grandTotalHours = projectSummary.reduce((sum, item) => sum + item.total_hours, 0);
  const grandTotalOtHours = projectSummary.reduce((sum, item) => sum + item.total_ot_hours, 0);

  // Thêm tỷ lệ % cho từng dự án
  const summaryWithPercentage = projectSummary.map(item => ({
    ...item,
    percentage: grandTotalHours > 0 ? Number(((item.total_hours / grandTotalHours) * 100).toFixed(1)) : 0
  }));

  // 2. Tổng giờ công theo từng nhân viên trong tháng
  const userSummary = db.prepare(`
    SELECT 
      u.id AS user_id,
      u.full_name,
      u.username,
      u.department,
      COALESCE(SUM(wl.hours), 0) AS total_hours,
      COALESCE(SUM(wl.ot_hours), 0) AS total_ot_hours,
      COUNT(DISTINCT wl.project_id) AS project_count,
      COUNT(DISTINCT wl.log_date) AS active_days
    FROM users u
    LEFT JOIN work_logs wl ON u.id = wl.user_id AND wl.log_date LIKE ?
    WHERE u.is_active = 1 OR wl.hours > 0
    GROUP BY u.id
    ORDER BY total_hours DESC, u.full_name ASC
  `).all(`${month}%`);

  // 3. Ma trận Nhân viên x Dự án (Ai làm dự án nào bao nhiêu giờ)
  const matrixData = db.prepare(`
    SELECT 
      wl.user_id,
      u.full_name,
      wl.project_id,
      p.code AS project_code,
      SUM(wl.hours) AS hours,
      COALESCE(SUM(wl.ot_hours), 0) AS ot_hours
    FROM work_logs wl
    JOIN users u ON wl.user_id = u.id
    JOIN projects p ON wl.project_id = p.id
    WHERE wl.log_date LIKE ?
    GROUP BY wl.user_id, wl.project_id
    ORDER BY u.full_name ASC, p.code ASC
  `).all(`${month}%`);

  // 4. Xu hướng giờ công theo từng ngày trong tháng
  const dailyTrend = db.prepare(`
    SELECT 
      log_date,
      SUM(hours) AS total_hours,
      COALESCE(SUM(ot_hours), 0) AS total_ot_hours,
      COUNT(DISTINCT user_id) AS user_count
    FROM work_logs
    WHERE log_date LIKE ?
    GROUP BY log_date
    ORDER BY log_date ASC
  `).all(`${month}%`);

  res.json({
    month,
    overall: {
      grand_total_hours: grandTotalHours,
      grand_total_ot_hours: grandTotalOtHours,
      active_projects_count: summaryWithPercentage.filter(p => p.total_hours > 0).length,
      active_users_count: userSummary.filter(u => u.total_hours > 0).length
    },
    projects: summaryWithPercentage,
    users: userSummary,
    matrix: matrixData,
    daily_trend: dailyTrend
  });
});

// Xuất báo cáo ra file Excel (.xlsx) theo đúng mẫu chuẩn HPA Timesheet (C:\Mau du lieu\HPA Timesheet theo Hợp đồng- T10.xlsx)
router.get('/export-excel', async (req, res) => {
  try {
    await exportHpaTimesheet(req, res);
  } catch (err) {
    console.error('Lỗi xuất Excel HPA Timesheet:', err);
    res.status(500).json({ error: 'Không thể xuất file Excel: ' + err.message });
  }
});

module.exports = router;
