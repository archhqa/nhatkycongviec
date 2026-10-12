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

// Lấy dữ liệu Bảng Ma trận Timesheet đầy đủ (Dự án x Nhân viên theo phòng ban)
router.get('/timesheet-matrix', (req, res) => {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const month = req.query.month || currentMonth;

  try {
    // 1. Thứ tự phòng ban chuẩn theo file C:\Danh sach nhan vien\HPA- Timesheet 2026.xlsx
    const deptOrder = ['Ban Giám Đốc', 'Design/3D', 'KTTK- CAD', 'KTTK- REVIT', 'Landscape', 'ID'];
    const deptColorMap = {
      'Ban Giám Đốc': { bg: 'bg-purple-100', text: 'text-purple-900', border: 'border-purple-200', badge: 'bg-purple-50 text-purple-700' },
      'Design/3D': { bg: 'bg-blue-100', text: 'text-blue-900', border: 'border-blue-200', badge: 'bg-blue-50 text-blue-700' },
      'KTTK- CAD': { bg: 'bg-teal-100', text: 'text-teal-900', border: 'border-teal-200', badge: 'bg-teal-50 text-teal-700' },
      'KTTK- REVIT': { bg: 'bg-indigo-100', text: 'text-indigo-900', border: 'border-indigo-200', badge: 'bg-indigo-50 text-indigo-700' },
      'Landscape': { bg: 'bg-emerald-100', text: 'text-emerald-900', border: 'border-emerald-200', badge: 'bg-emerald-50 text-emerald-700' },
      'ID': { bg: 'bg-amber-100', text: 'text-amber-900', border: 'border-amber-200', badge: 'bg-amber-50 text-amber-700' }
    };

    // 2. Lấy toàn bộ nhân viên và sắp xếp theo thứ tự phòng ban
    const allUsers = db.prepare('SELECT id, full_name, username, department FROM users WHERE is_active = 1 ORDER BY id ASC').all();
    
    // Gom nhóm nhân viên theo phòng ban
    const deptMap = {};
    deptOrder.forEach(dept => {
      deptMap[dept] = [];
    });

    allUsers.forEach(user => {
      const d = user.department || 'Khác';
      if (!deptMap[d]) deptMap[d] = [];
      deptMap[d].push(user);
    });

    const orderedDepartments = [];
    const orderedUsers = [];

    deptOrder.forEach(deptName => {
      const usersInDept = deptMap[deptName] || [];
      if (usersInDept.length > 0) {
        orderedDepartments.push({
          name: deptName,
          count: usersInDept.length,
          style: deptColorMap[deptName] || { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700' },
          users: usersInDept
        });
        orderedUsers.push(...usersInDept);
      }
    });

    // Thêm các phòng ban khác nếu có
    Object.keys(deptMap).forEach(d => {
      if (!deptOrder.includes(d) && deptMap[d].length > 0) {
        orderedDepartments.push({
          name: d,
          count: deptMap[d].length,
          style: { bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-200', badge: 'bg-slate-50 text-slate-700' },
          users: deptMap[d]
        });
        orderedUsers.push(...deptMap[d]);
      }
    });

    // 3. Lấy toàn bộ dự án và sắp xếp số tự nhiên theo mã (code)
    const projects = db.prepare('SELECT id, code, name, contract_no, status, manager, design_lead FROM projects ORDER BY code ASC').all();
    const numericSort = (a, b) => (a.code || '').localeCompare((b.code || ''), undefined, { numeric: true, sensitivity: 'base' });
    projects.sort(numericSort);

    // 4. Lấy dữ liệu nhật ký trong tháng
    const logRows = db.prepare(`
      SELECT 
        wl.project_id,
        wl.user_id,
        ROUND(SUM(wl.hours), 1) AS hours,
        ROUND(SUM(COALESCE(wl.ot_hours, 0)), 1) AS ot_hours
      FROM work_logs wl
      WHERE strftime('%Y-%m', wl.log_date) = ?
      GROUP BY wl.project_id, wl.user_id
    `).all(month);

    // Bản đồ [project_id][user_id] => { hours, ot_hours }
    const cellMap = {};
    const colTotals = {};
    orderedUsers.forEach(u => {
      colTotals[u.id] = { hours: 0, ot_hours: 0 };
    });

    logRows.forEach(row => {
      if (!cellMap[row.project_id]) cellMap[row.project_id] = {};
      cellMap[row.project_id][row.user_id] = {
        hours: row.hours,
        ot_hours: row.ot_hours
      };

      if (colTotals[row.user_id]) {
        colTotals[row.user_id].hours = Number((colTotals[row.user_id].hours + row.hours).toFixed(1));
        colTotals[row.user_id].ot_hours = Number((colTotals[row.user_id].ot_hours + row.ot_hours).toFixed(1));
      }
    });

    let grandTotalHours = 0;
    let grandTotalOtHours = 0;

    const projectRows = projects.map(p => {
      const pCells = cellMap[p.id] || {};
      let rowTotalHours = 0;
      let rowTotalOtHours = 0;

      orderedUsers.forEach(u => {
        const c = pCells[u.id];
        if (c) {
          rowTotalHours = Number((rowTotalHours + c.hours).toFixed(1));
          rowTotalOtHours = Number((rowTotalOtHours + c.ot_hours).toFixed(1));
        }
      });

      grandTotalHours = Number((grandTotalHours + rowTotalHours).toFixed(1));
      grandTotalOtHours = Number((grandTotalOtHours + rowTotalOtHours).toFixed(1));

      return {
        id: p.id,
        code: p.code,
        name: p.name,
        contract_no: p.contract_no,
        status: p.status,
        manager: p.manager,
        design_lead: p.design_lead,
        cells: pCells,
        total_hours: rowTotalHours,
        total_ot_hours: rowTotalOtHours
      };
    });

    res.json({
      month,
      departments: orderedDepartments,
      users: orderedUsers,
      projects: projectRows,
      col_totals: colTotals,
      grand_total_hours: grandTotalHours,
      grand_total_ot_hours: grandTotalOtHours
    });

  } catch (err) {
    console.error('Lỗi tính toán ma trận timesheet:', err);
    res.status(500).json({ error: 'Lỗi tải ma trận timesheet: ' + err.message });
  }
});

// Xuất báo cáo ra file Excel (.xlsx) theo đúng mẫu chuẩn HPA Timesheet
router.get('/export-excel', async (req, res) => {
  try {
    await exportHpaTimesheet(req, res);
  } catch (err) {
    console.error('Lỗi xuất Excel HPA Timesheet:', err);
    res.status(500).json({ error: 'Không thể xuất file Excel: ' + err.message });
  }
});

module.exports = router;
