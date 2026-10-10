const ExcelJS = require('exceljs');
const fs = require('fs');
const path = require('path');
const db = require('../db');

// Hàm chuẩn hóa chuỗi tiếng Việt không dấu để so khớp
function normalizeKey(str) {
  if (!str) return '';
  return String(str)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Xuất file Excel báo cáo ma trận giờ công:
 * Thể hiện số giờ làm việc của từng nhân viên cho từng dự án theo từng tháng
 * Và thống kê làm thêm giờ (OT) chi tiết theo mẫu HPA
 */
async function exportHpaTimesheet(req, res) {
  const { month, year, from_date } = req.query;

  // 1. Xác định Năm và Tháng báo cáo
  let targetMonth = month;
  if (!targetMonth) {
    if (from_date) {
      targetMonth = from_date.slice(0, 7);
    } else {
      targetMonth = new Date().toISOString().slice(0, 7);
    }
  }

  const [yearStr, monthStr] = targetMonth.split('-');
  const targetYear = year || yearStr || '2026';
  const selectedMonthNum = parseInt(monthStr || '10', 10);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Phần mềm Nhật ký Công việc';
  workbook.lastModifiedBy = req.user?.full_name || 'Admin';
  workbook.created = new Date();

  // Định dạng Style chuẩn doanh nghiệp
  const fontTitle = { name: 'Times New Roman', size: 14, bold: true, color: { argb: 'FF1E3A8A' } };
  const fontSub = { name: 'Times New Roman', size: 10, italic: true, color: { argb: 'FF475569' } };
  const fontHeader = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  const fontBody = { name: 'Times New Roman', size: 10 };
  const fontBold = { name: 'Times New Roman', size: 10, bold: true };
  const fillHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }; // Navy blue
  const fillMonthHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }; // Teal
  const fillOtHeader = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }; // Amber
  const fillSubtotal = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; // Light Slate
  const fillGrandTotal = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }; // Dark Slate
  const fontGrandTotal = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };

  const borderThin = {
    top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
    right: { style: 'thin', color: { argb: 'FFCBD5E1' } }
  };

  // 2. Truy vấn dữ liệu giờ công trong cả năm (nhóm theo Dự án x Nhân viên x Tháng)
  const yearLogs = db.prepare(`
    SELECT 
      wl.user_id,
      u.full_name AS user_name,
      u.username,
      u.department,
      wl.project_id,
      p.code AS project_code,
      p.name AS project_name,
      COALESCE(p.contract_no, '') AS contract_no,
      substr(wl.log_date, 6, 2) AS month_num,
      SUM(wl.hours) AS total_hours,
      SUM(COALESCE(wl.ot_hours, 0)) AS total_ot_hours
    FROM work_logs wl
    JOIN users u ON wl.user_id = u.id
    JOIN projects p ON wl.project_id = p.id
    WHERE wl.log_date LIKE ?
    GROUP BY wl.user_id, wl.project_id, substr(wl.log_date, 6, 2)
  `).all(`${targetYear}%`);

  // Truy vấn toàn bộ bản ghi làm thêm giờ (OT) trong năm
  const allYearOtLogs = db.prepare(`
    SELECT 
      wl.id,
      wl.log_date,
      u.full_name AS user_name,
      u.department,
      p.code AS project_code,
      COALESCE(p.contract_no, '') AS contract_no,
      p.name AS project_name,
      wl.hours,
      wl.ot_hours,
      COALESCE(wl.ot_from_time, '') AS ot_from_time,
      COALESCE(wl.ot_to_time, '') AS ot_to_time,
      COALESCE(wl.ot_reason, '') AS ot_reason,
      wl.description,
      substr(wl.log_date, 6, 2) AS month_num
    FROM work_logs wl
    JOIN users u ON wl.user_id = u.id
    JOIN projects p ON wl.project_id = p.id
    WHERE wl.log_date LIKE ? AND wl.ot_hours > 0
    ORDER BY wl.log_date ASC, u.full_name ASC
  `).all(`${targetYear}%`);

  const allProjects = db.prepare("SELECT id, code, name, COALESCE(contract_no, '') AS contract_no FROM projects WHERE code != '000000' ORDER BY code ASC").all();
  const allUsers = db.prepare("SELECT id, full_name, username, department FROM users WHERE role = 'employee' ORDER BY full_name ASC").all();

  // =========================================================================
  // SHEET 1: MA TRẬN THEO THÁNG (DỰ ÁN x NHÂN SỰ x 12 THÁNG + OT)
  // =========================================================================
  const sheet1 = workbook.addWorksheet('Ma Trận Dự Án - Nhân Sự');
  sheet1.columns = [
    { width: 6 },  // STT
    { width: 14 }, // Mã Dự Án
    { width: 28 }, // Số Hợp Đồng
    { width: 34 }, // Tên Dự Án
    { width: 24 }, // Họ Tên Nhân Sự
    { width: 16 }, // Phòng Ban
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 14 }, // Tổng Cả Năm
    { width: 14 }  // Trong Đó OT
  ];

  sheet1.mergeCells('A1:T1');
  const t1 = sheet1.getCell('A1');
  t1.value = `BÁO CÁO MA TRẬN GIỜ CÔNG: TỔNG HỢP DỰ ÁN & NHÂN VIÊN THEO TỪNG THÁNG - NĂM ${targetYear}`;
  t1.font = fontTitle;
  t1.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getRow(1).height = 30;

  sheet1.mergeCells('A2:T2');
  const sub1 = sheet1.getCell('A2');
  sub1.value = `Thời gian xuất: ${new Date().toLocaleString('vi-VN')} | Đơn vị tính: Giờ công | Người lập: ${req.user?.full_name || 'Admin'}`;
  sub1.font = fontSub;
  sub1.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet1.getRow(2).height = 20;

  const headers1 = [
    'STT', 'Mã Dự Án', 'Số Hợp Đồng', 'Tên Dự Án', 'Nhân Sự Thực Hiện', 'Phòng Ban',
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
    'Tổng Cả Năm', 'Trong Đó OT'
  ];
  const hRow1 = sheet1.addRow(headers1);
  hRow1.height = 28;
  hRow1.eachCell((cell, colNum) => {
    if (colNum >= 7 && colNum <= 18) {
      cell.fill = fillMonthHeader;
    } else if (colNum === 20) {
      cell.fill = fillOtHeader;
    } else {
      cell.fill = fillHeader;
    }
    cell.font = fontHeader;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borderThin;
  });

  // Nhóm theo Dự án -> Nhân sự
  const projMap = new Map();
  allProjects.forEach(p => {
    projMap.set(p.id, {
      id: p.id,
      code: p.code,
      name: p.name,
      contract_no: p.contract_no,
      users: new Map()
    });
  });

  yearLogs.forEach(log => {
    let pObj = projMap.get(log.project_id);
    if (!pObj) {
      pObj = {
        id: log.project_id,
        code: log.project_code,
        name: log.project_name,
        contract_no: log.contract_no,
        users: new Map()
      };
      projMap.set(log.project_id, pObj);
    }

    let uObj = pObj.users.get(log.user_id);
    if (!uObj) {
      uObj = {
        id: log.user_id,
        name: log.user_name,
        department: log.department,
        months: Array(12).fill(0),
        total_ot: 0
      };
      pObj.users.set(log.user_id, uObj);
    }
    const mIdx = parseInt(log.month_num, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      uObj.months[mIdx] += log.total_hours;
    }
    uObj.total_ot += (log.total_ot_hours || 0);
  });

  let sttProj = 1;
  const projectSubtotalRows = [];

  projMap.forEach(proj => {
    const userList = Array.from(proj.users.values());
    if (userList.length === 0) return;

    const startRowIdx = sheet1.rowCount + 1;

    userList.forEach(u => {
      const rowVals = [
        sttProj,
        proj.code,
        proj.contract_no,
        proj.name,
        u.name,
        u.department
      ];

      for (let m = 0; m < 12; m++) {
        rowVals.push(u.months[m] > 0 ? u.months[m] : null);
      }

      // Vị trí 19 (Tổng Cả Năm), vị trí 20 (Trong Đó OT)
      rowVals.push(null);
      rowVals.push(u.total_ot > 0 ? u.total_ot : null);

      const row = sheet1.addRow(rowVals);
      row.height = 20;

      const curRow = row.number;
      row.getCell(19).value = { formula: `SUM(G${curRow}:R${curRow})` };

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(2).alignment = { horizontal: 'center' };
      row.getCell(6).alignment = { horizontal: 'center' };
      for (let col = 7; col <= 20; col++) {
        row.getCell(col).alignment = { horizontal: 'right' };
        row.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
      }
      row.getCell(20).font = { name: 'Times New Roman', size: 10, color: { argb: 'FFB45309' }, bold: true };
      row.eachCell(c => {
        if (!c.font) c.font = fontBody;
        c.border = borderThin;
      });
    });

    const endRowIdx = sheet1.rowCount;

    // Subtotal cho Dự án
    const subtotalVals = [
      '',
      '',
      '',
      `CỘNG DỰ ÁN: ${proj.name}`,
      `(${userList.length} nhân sự)`,
      ''
    ];
    for (let m = 0; m < 12; m++) {
      const colLetter = sheet1.getColumn(7 + m).letter;
      subtotalVals.push({ formula: `SUM(${colLetter}${startRowIdx}:${colLetter}${endRowIdx})` });
    }
    // Cột 19 & 20
    subtotalVals.push(null);
    subtotalVals.push({ formula: `SUM(T${startRowIdx}:T${endRowIdx})` });

    const subRow = sheet1.addRow(subtotalVals);
    subRow.height = 22;
    const subRowNum = subRow.number;
    projectSubtotalRows.push(subRowNum);

    subRow.getCell(19).value = { formula: `SUM(G${subRowNum}:R${subRowNum})` };
    subRow.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
    subRow.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let col = 7; col <= 20; col++) {
      subRow.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
      subRow.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
    }

    subRow.eachCell(c => {
      c.fill = fillSubtotal;
      c.font = fontBold;
      c.border = borderThin;
    });

    sttProj++;
  });

  // Dòng Tổng Cộng Toàn Công Ty (Sheet 1)
  const grandTotalVals1 = ['', '', '', 'TỔNG CỘNG TOÀN CÔNG TY', '', ''];
  for (let m = 0; m < 12; m++) {
    const colLetter = sheet1.getColumn(7 + m).letter;
    if (projectSubtotalRows.length > 0) {
      const formulaStr = projectSubtotalRows.map(r => `${colLetter}${r}`).join('+');
      grandTotalVals1.push({ formula: formulaStr });
    } else {
      grandTotalVals1.push(0);
    }
  }
  // Cột 19 & 20
  grandTotalVals1.push(null);
  if (projectSubtotalRows.length > 0) {
    grandTotalVals1.push({ formula: projectSubtotalRows.map(r => `T${r}`).join('+') });
  } else {
    grandTotalVals1.push(0);
  }

  const grandRow = sheet1.addRow(grandTotalVals1);
  grandRow.height = 26;
  const curGrandR = grandRow.number;
  grandRow.getCell(19).value = { formula: `SUM(G${curGrandR}:R${curGrandR})` };
  grandRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

  for (let col = 7; col <= 20; col++) {
    grandRow.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
    grandRow.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
  }
  grandRow.eachCell(c => {
    c.fill = fillGrandTotal;
    c.font = fontGrandTotal;
    c.border = borderThin;
  });


  // =========================================================================
  // SHEET 2: MA TRẬN THEO NHÂN VIÊN (NHÂN SỰ x DỰ ÁN x 12 THÁNG + OT)
  // =========================================================================
  const sheet2 = workbook.addWorksheet('Ma Trận Nhân Sự - Dự Án');
  sheet2.columns = [
    { width: 6 },  // STT
    { width: 24 }, // Họ Tên Nhân Sự
    { width: 14 }, // Tài Khoản
    { width: 16 }, // Phòng Ban
    { width: 14 }, // Mã Dự Án
    { width: 26 }, // Số Hợp Đồng
    { width: 34 }, // Tên Dự Án
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 14 }, // Tổng Cả Năm
    { width: 14 }  // Trong Đó OT
  ];

  sheet2.mergeCells('A1:U1');
  const t2 = sheet2.getCell('A1');
  t2.value = `BÁO CÁO MA TRẬN GIỜ CÔNG: TỔNG HỢP THEO NHÂN VIÊN & DỰ ÁN THEO TỪNG THÁNG - NĂM ${targetYear}`;
  t2.font = fontTitle;
  t2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet2.getRow(1).height = 30;

  sheet2.mergeCells('A2:U2');
  const sub2 = sheet2.getCell('A2');
  sub2.value = `Thời gian xuất: ${new Date().toLocaleString('vi-VN')} | Đơn vị tính: Giờ công`;
  sub2.font = fontSub;
  sub2.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet2.getRow(2).height = 20;

  const headers2 = [
    'STT', 'Họ Và Tên Nhân Sự', 'Tài Khoản', 'Phòng Ban', 'Mã Dự Án', 'Số Hợp Đồng', 'Tên Dự Án',
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
    'Tổng Cả Năm', 'Trong Đó OT'
  ];
  const hRow2 = sheet2.addRow(headers2);
  hRow2.height = 28;
  hRow2.eachCell((cell, colNum) => {
    if (colNum >= 8 && colNum <= 19) {
      cell.fill = fillMonthHeader;
    } else if (colNum === 21) {
      cell.fill = fillOtHeader;
    } else {
      cell.fill = fillHeader;
    }
    cell.font = fontHeader;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borderThin;
  });

  // Gom nhóm dữ liệu theo Nhân sự -> Dự án
  const userMap = new Map();
  allUsers.forEach(u => {
    userMap.set(u.id, {
      id: u.id,
      name: u.full_name,
      username: u.username,
      department: u.department,
      projects: new Map()
    });
  });

  yearLogs.forEach(log => {
    let uObj = userMap.get(log.user_id);
    if (!uObj) {
      uObj = {
        id: log.user_id,
        name: log.user_name,
        username: log.username,
        department: log.department,
        projects: new Map()
      };
      userMap.set(log.user_id, uObj);
    }

    let pObj = uObj.projects.get(log.project_id);
    if (!pObj) {
      pObj = {
        id: log.project_id,
        code: log.project_code,
        name: log.project_name,
        contract_no: log.contract_no,
        months: Array(12).fill(0),
        total_ot: 0
      };
      uObj.projects.set(log.project_id, pObj);
    }
    const mIdx = parseInt(log.month_num, 10) - 1;
    if (mIdx >= 0 && mIdx < 12) {
      pObj.months[mIdx] += log.total_hours;
    }
    pObj.total_ot += (log.total_ot_hours || 0);
  });

  let sttUser = 1;
  const userSubtotalRows = [];

  userMap.forEach(u => {
    const pList = Array.from(u.projects.values());
    if (pList.length === 0) return;

    const startRowIdx = sheet2.rowCount + 1;

    pList.forEach(p => {
      const rowVals = [
        sttUser,
        u.name,
        u.username,
        u.department,
        p.code,
        p.contract_no,
        p.name
      ];

      for (let m = 0; m < 12; m++) {
        rowVals.push(p.months[m] > 0 ? p.months[m] : null);
      }

      // Cột 20: Tổng Cả Năm, Cột 21: Trong Đó OT
      rowVals.push(null);
      rowVals.push(p.total_ot > 0 ? p.total_ot : null);

      const row = sheet2.addRow(rowVals);
      row.height = 20;

      const curRow = row.number;
      row.getCell(20).value = { formula: `SUM(H${curRow}:S${curRow})` };

      row.getCell(1).alignment = { horizontal: 'center' };
      row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).alignment = { horizontal: 'center' };
      row.getCell(5).alignment = { horizontal: 'center' };
      for (let col = 8; col <= 21; col++) {
        row.getCell(col).alignment = { horizontal: 'right' };
        row.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
      }
      row.getCell(21).font = { name: 'Times New Roman', size: 10, color: { argb: 'FFB45309' }, bold: true };
      row.eachCell(c => {
        if (!c.font) c.font = fontBody;
        c.border = borderThin;
      });
    });

    const endRowIdx = sheet2.rowCount;

    // Subtotal nhân sự
    const subtotalVals = [
      '',
      `CỘNG NHÂN SỰ: ${u.name}`,
      u.username,
      u.department,
      '',
      '',
      `(${pList.length} dự án tham gia)`
    ];
    for (let m = 0; m < 12; m++) {
      const colLetter = sheet2.getColumn(8 + m).letter;
      subtotalVals.push({ formula: `SUM(${colLetter}${startRowIdx}:${colLetter}${endRowIdx})` });
    }
    // Cột 20 & 21
    subtotalVals.push(null);
    subtotalVals.push({ formula: `SUM(U${startRowIdx}:U${endRowIdx})` });

    const subRow = sheet2.addRow(subtotalVals);
    subRow.height = 22;
    const subRowNum = subRow.number;
    userSubtotalRows.push(subRowNum);

    subRow.getCell(20).value = { formula: `SUM(H${subRowNum}:S${subRowNum})` };
    subRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    subRow.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };

    for (let col = 8; col <= 21; col++) {
      subRow.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
      subRow.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
    }

    subRow.eachCell(c => {
      c.fill = fillSubtotal;
      c.font = fontBold;
      c.border = borderThin;
    });

    sttUser++;
  });

  // Dòng Tổng Cộng Sheet 2
  const grandTotalVals2 = ['', '', '', 'TỔNG CỘNG TOÀN CÔNG TY', '', '', ''];
  for (let m = 0; m < 12; m++) {
    const colLetter = sheet2.getColumn(8 + m).letter;
    if (userSubtotalRows.length > 0) {
      grandTotalVals2.push({ formula: userSubtotalRows.map(r => `${colLetter}${r}`).join('+') });
    } else {
      grandTotalVals2.push(0);
    }
  }
  // Cột 20 & 21
  grandTotalVals2.push(null);
  if (userSubtotalRows.length > 0) {
    grandTotalVals2.push({ formula: userSubtotalRows.map(r => `U${r}`).join('+') });
  } else {
    grandTotalVals2.push(0);
  }

  const userGrandRow = sheet2.addRow(grandTotalVals2);
  userGrandRow.height = 26;
  const curUserGrandR = userGrandRow.number;
  userGrandRow.getCell(20).value = { formula: `SUM(H${curUserGrandR}:S${curUserGrandR})` };
  userGrandRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };

  for (let col = 8; col <= 21; col++) {
    userGrandRow.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
    userGrandRow.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
  }
  userGrandRow.eachCell(c => {
    c.fill = fillGrandTotal;
    c.font = fontGrandTotal;
    c.border = borderThin;
  });


  // =========================================================================
  // SHEET 3: TỔNG HỢP DỰ ÁN THEO 12 THÁNG (+ OT)
  // =========================================================================
  const sheet3 = workbook.addWorksheet('Tổng Hợp Dự Án (12 Tháng)');
  sheet3.columns = [
    { width: 6 },  // STT
    { width: 14 }, // Mã Dự Án
    { width: 28 }, // Số Hợp Đồng
    { width: 35 }, // Tên Dự Án
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 14 }, // Tổng Cả Năm
    { width: 14 }  // Trong Đó OT
  ];

  sheet3.mergeCells('A1:R1');
  sheet3.getCell('A1').value = `BÁO CÁO TỔNG HỢP GIỜ CÔNG THEO DỰ ÁN QUA 12 THÁNG - NĂM ${targetYear}`;
  sheet3.getCell('A1').font = fontTitle;
  sheet3.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet3.getRow(1).height = 30;

  sheet3.mergeCells('A2:R2');
  sheet3.getCell('A2').value = `Thời gian xuất: ${new Date().toLocaleString('vi-VN')} | Đơn vị: Giờ công`;
  sheet3.getCell('A2').font = fontSub;
  sheet3.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet3.getRow(2).height = 20;

  const headers3 = [
    'STT', 'Mã Dự Án', 'Số Hợp Đồng', 'Tên Dự Án',
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
    'Tổng Cả Năm', 'Trong Đó OT'
  ];
  const hRow3 = sheet3.addRow(headers3);
  hRow3.height = 28;
  hRow3.eachCell((cell, colNum) => {
    if (colNum >= 5 && colNum <= 16) {
      cell.fill = fillMonthHeader;
    } else if (colNum === 18) {
      cell.fill = fillOtHeader;
    } else {
      cell.fill = fillHeader;
    }
    cell.font = fontHeader;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThin;
  });

  // Gom giờ từng dự án theo 12 tháng
  const projSummaryMonths = new Map();
  allProjects.forEach(p => {
    projSummaryMonths.set(p.id, {
      code: p.code,
      name: p.name,
      contract_no: p.contract_no,
      months: Array(12).fill(0),
      total_ot: 0
    });
  });

  yearLogs.forEach(log => {
    let pObj = projSummaryMonths.get(log.project_id);
    if (pObj) {
      const mIdx = parseInt(log.month_num, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        pObj.months[mIdx] += log.total_hours;
      }
      pObj.total_ot += (log.total_ot_hours || 0);
    }
  });

  let pIdx = 1;
  const startPDataRow = 4;
  projSummaryMonths.forEach(p => {
    const rowVals = [pIdx, p.code, p.contract_no, p.name];
    for (let m = 0; m < 12; m++) {
      rowVals.push(p.months[m] > 0 ? p.months[m] : null);
    }
    // Cột 17: Tổng Cả Năm, Cột 18: Trong Đó OT
    rowVals.push(null);
    rowVals.push(p.total_ot > 0 ? p.total_ot : null);

    const row = sheet3.addRow(rowVals);
    row.height = 20;
    const curR = row.number;
    row.getCell(17).value = { formula: `SUM(E${curR}:P${curR})` };

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    for (let col = 5; col <= 18; col++) {
      row.getCell(col).alignment = { horizontal: 'right' };
      row.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
    }
    row.getCell(18).font = { name: 'Times New Roman', size: 10, color: { argb: 'FFB45309' }, bold: true };
    row.eachCell(c => {
      if (!c.font) c.font = fontBody;
      c.border = borderThin;
    });
    pIdx++;
  });
  const endPDataRow = sheet3.rowCount;

  // Dòng Tổng cộng Sheet 3
  const pGrandVals = ['', '', '', 'TỔNG CỘNG TOÀN BỘ DỰ ÁN'];
  for (let m = 0; m < 12; m++) {
    const colLetter = sheet3.getColumn(5 + m).letter;
    pGrandVals.push({ formula: `SUM(${colLetter}${startPDataRow}:${colLetter}${endPDataRow})` });
  }
  pGrandVals.push(null);
  pGrandVals.push({ formula: `SUM(R${startPDataRow}:R${endPDataRow})` });

  const pGrandRow = sheet3.addRow(pGrandVals);
  pGrandRow.height = 26;
  const curGrandR3 = pGrandRow.number;
  pGrandRow.getCell(17).value = { formula: `SUM(E${curGrandR3}:P${curGrandR3})` };
  pGrandRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let col = 5; col <= 18; col++) {
    pGrandRow.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
    pGrandRow.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
  }
  pGrandRow.eachCell(c => { c.fill = fillGrandTotal; c.font = fontGrandTotal; c.border = borderThin; });


  // =========================================================================
  // SHEET 4: TỔNG HỢP NHÂN SỰ THEO 12 THÁNG (+ OT)
  // =========================================================================
  const sheet4 = workbook.addWorksheet('Tổng Hợp Nhân Sự (12 Tháng)');
  sheet4.columns = [
    { width: 6 },  // STT
    { width: 24 }, // Họ Tên
    { width: 14 }, // Tài Khoản
    { width: 18 }, // Phòng Ban
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 }, { width: 9 },
    { width: 14 }, // Tổng Cả Năm
    { width: 14 }  // Trong Đó OT
  ];

  sheet4.mergeCells('A1:R1');
  sheet4.getCell('A1').value = `BÁO CÁO TỔNG HỢP GIỜ CÔNG THEO NHÂN VIÊN QUA 12 THÁNG - NĂM ${targetYear}`;
  sheet4.getCell('A1').font = fontTitle;
  sheet4.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet4.getRow(1).height = 30;

  sheet4.mergeCells('A2:R2');
  sheet4.getCell('A2').value = `Thời gian xuất: ${new Date().toLocaleString('vi-VN')} | Đơn vị: Giờ công`;
  sheet4.getCell('A2').font = fontSub;
  sheet4.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };
  sheet4.getRow(2).height = 20;

  const headers4 = [
    'STT', 'Họ Và Tên Nhân Sự', 'Tài Khoản', 'Phòng Ban / Team',
    'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
    'Tổng Cả Năm', 'Trong Đó OT'
  ];
  const hRow4 = sheet4.addRow(headers4);
  hRow4.height = 28;
  hRow4.eachCell((cell, colNum) => {
    if (colNum >= 5 && colNum <= 16) {
      cell.fill = fillMonthHeader;
    } else if (colNum === 18) {
      cell.fill = fillOtHeader;
    } else {
      cell.fill = fillHeader;
    }
    cell.font = fontHeader;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThin;
  });

  const userSummaryMonths = new Map();
  allUsers.forEach(u => {
    userSummaryMonths.set(u.id, {
      name: u.full_name,
      username: u.username,
      department: u.department,
      months: Array(12).fill(0),
      total_ot: 0
    });
  });

  yearLogs.forEach(log => {
    let uObj = userSummaryMonths.get(log.user_id);
    if (uObj) {
      const mIdx = parseInt(log.month_num, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        uObj.months[mIdx] += log.total_hours;
      }
      uObj.total_ot += (log.total_ot_hours || 0);
    }
  });

  let uIdx = 1;
  const startUDataRow = 4;
  userSummaryMonths.forEach(u => {
    const rowVals = [uIdx, u.name, u.username, u.department];
    for (let m = 0; m < 12; m++) {
      rowVals.push(u.months[m] > 0 ? u.months[m] : null);
    }
    // Cột 17: Tổng Cả Năm, Cột 18: Trong Đó OT
    rowVals.push(null);
    rowVals.push(u.total_ot > 0 ? u.total_ot : null);

    const row = sheet4.addRow(rowVals);
    row.height = 20;
    const curR = row.number;
    row.getCell(17).value = { formula: `SUM(E${curR}:P${curR})` };

    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(3).alignment = { horizontal: 'center' };
    row.getCell(4).alignment = { horizontal: 'center' };
    for (let col = 5; col <= 18; col++) {
      row.getCell(col).alignment = { horizontal: 'right' };
      row.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
    }
    row.getCell(18).font = { name: 'Times New Roman', size: 10, color: { argb: 'FFB45309' }, bold: true };
    row.eachCell(c => {
      if (!c.font) c.font = fontBody;
      c.border = borderThin;
    });
    uIdx++;
  });
  const endUDataRow = sheet4.rowCount;

  // Dòng Tổng cộng Sheet 4
  const uGrandVals = ['', '', '', 'TỔNG CỘNG TOÀN BỘ NHÂN SỰ'];
  for (let m = 0; m < 12; m++) {
    const colLetter = sheet4.getColumn(5 + m).letter;
    uGrandVals.push({ formula: `SUM(${colLetter}${startUDataRow}:${colLetter}${endUDataRow})` });
  }
  uGrandVals.push(null);
  uGrandVals.push({ formula: `SUM(R${startUDataRow}:R${endUDataRow})` });

  const uGrandRow = sheet4.addRow(uGrandVals);
  uGrandRow.height = 26;
  const curUGrandR4 = uGrandRow.number;
  uGrandRow.getCell(17).value = { formula: `SUM(E${curUGrandR4}:P${curUGrandR4})` };
  uGrandRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  for (let col = 5; col <= 18; col++) {
    uGrandRow.getCell(col).alignment = { horizontal: 'right', vertical: 'middle' };
    uGrandRow.getCell(col).numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
  }
  uGrandRow.eachCell(c => { c.fill = fillGrandTotal; c.font = fontGrandTotal; c.border = borderThin; });


  // =========================================================================
  // SHEET 5: TIMESHEET MẪU HPA (THÁNG ĐƯỢC CHỌN - VD: T10)
  // =========================================================================
  try {
    let templatePath = 'C:\\Mau du lieu\\HPA Timesheet theo Hợp đồng- T10.xlsx';
    if (!fs.existsSync(templatePath)) {
      templatePath = path.join(__dirname, '..', '..', 'templates', 'HPA_Timesheet_Template.xlsx');
    }

    if (fs.existsSync(templatePath)) {
      const templateWb = new ExcelJS.Workbook();
      await templateWb.xlsx.readFile(templatePath);
      const hpaSheet = templateWb.getWorksheet('T10') || templateWb.worksheets[0];

      if (hpaSheet) {
        const sheet5 = workbook.addWorksheet(`Timesheet HPA (T${selectedMonthNum})`);

        // Sao chép cấu trúc cột
        sheet5.columns = hpaSheet.columns.map(c => ({ width: c.width }));

        // Sao chép các ô từ template
        for (let r = 1; r <= hpaSheet.rowCount; r++) {
          const srcRow = hpaSheet.getRow(r);
          const dstRow = sheet5.getRow(r);
          dstRow.height = srcRow.height;

          for (let c = 1; c <= hpaSheet.columnCount; c++) {
            const srcCell = srcRow.getCell(c);
            const dstCell = dstRow.getCell(c);
            if (srcCell.value !== null && srcCell.value !== undefined) {
              dstCell.value = srcCell.value;
            }
            if (srcCell.font) dstCell.font = srcCell.font;
            if (srcCell.fill) dstCell.fill = srcCell.fill;
            if (srcCell.border) dstCell.border = srcCell.border;
            if (srcCell.alignment) dstCell.alignment = srcCell.alignment;
            if (srcCell.numFmt) dstCell.numFmt = srcCell.numFmt;
          }
        }

        // Sao chép các merge cells
        if (hpaSheet.model.merges) {
          hpaSheet.model.merges.forEach(range => {
            try { sheet5.mergeCells(range); } catch (e) {}
          });
        }

        // Điền giờ làm việc của tháng được chọn vào sheet5
        const empColMap = new Map();
        for (let c = 5; c <= 38; c++) {
          const rawName = sheet5.getRow(2).getCell(c).value;
          if (rawName && typeof rawName === 'string') {
            empColMap.set(normalizeKey(rawName), c);
          }
        }

        const projRowMap = new Map();
        for (let r = 3; r <= 62; r++) {
          const rawCode = sheet5.getRow(r).getCell(2).value;
          const rawName = sheet5.getRow(r).getCell(4).value;
          if (rawCode) projRowMap.set(normalizeKey(rawCode), r);
          if (rawName) projRowMap.set(normalizeKey(rawName), r);
        }

        const monthLogs = db.prepare(`
          SELECT 
            wl.user_id,
            u.full_name AS user_name,
            wl.project_id,
            p.code AS project_code,
            p.name AS project_name,
            SUM(wl.hours) AS total_hours
          FROM work_logs wl
          JOIN users u ON wl.user_id = u.id
          JOIN projects p ON wl.project_id = p.id
          WHERE wl.log_date LIKE ?
          GROUP BY wl.user_id, wl.project_id
        `).all(`${targetMonth}%`);

        monthLogs.forEach(item => {
          const col = empColMap.get(normalizeKey(item.user_name));
          const row = projRowMap.get(normalizeKey(item.project_code)) || projRowMap.get(normalizeKey(item.project_name));

          if (col && row) {
            const cell = sheet5.getRow(row).getCell(col);
            const prev = (typeof cell.value === 'number') ? cell.value : 0;
            cell.value = prev + item.total_hours;
            cell.font = { name: 'Times New Roman', size: 11 };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.numFmt = '_(* #,##0.0_);_(* (#,##0.0);_(* "-"??_);_(@_)';
          }
        });
      }
    }
  } catch (err) {
    console.warn('Lỗi chèn Sheet mẫu HPA:', err.message);
  }


  // =========================================================================
  // SHEET 6: BẢNG LÀM THÊM GIỜ (OT) - CHUẨN MẪU HPA
  // =========================================================================
  const sheetOt = workbook.addWorksheet('OT - Làm Thêm Giờ');
  sheetOt.columns = [
    { width: 4 },  // A: Lề
    { width: 14 }, // B: Ngày tháng
    { width: 24 }, // C: Tên nhân sự
    { width: 34 }, // D: Dự án / Công việc
    { width: 16 }, // E: Mã dự án
    { width: 13 }, // F: Từ giờ
    { width: 13 }, // G: Đến giờ
    { width: 15 }, // H: Tổng số giờ OT
    { width: 42 }  // I: Lý do / Nội dung làm thêm
  ];

  // Header Title B2:I2
  sheetOt.mergeCells('B2:I2');
  const otTitleCell = sheetOt.getCell('B2');
  otTitleCell.value = `DANH SÁCH LÀM THÊM GIỜ ${targetYear}`;
  otTitleCell.font = { name: 'Times New Roman', size: 15, bold: true, color: { argb: 'FF1E3A8A' } };
  otTitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  otTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Light Amber fill
  sheetOt.getRow(2).height = 32;

  // Header B4:I5
  sheetOt.mergeCells('B4:B5');
  sheetOt.getCell('B4').value = 'Ngày tháng';
  sheetOt.mergeCells('C4:C5');
  sheetOt.getCell('C4').value = 'Tên nhân sự';
  sheetOt.mergeCells('D4:D5');
  sheetOt.getCell('D4').value = 'Dự án / Công việc';
  sheetOt.mergeCells('E4:E5');
  sheetOt.getCell('E4').value = 'Mã dự án';
  sheetOt.mergeCells('F4:H4');
  sheetOt.getCell('F4').value = 'Thời gian làm thêm';
  sheetOt.getCell('F5').value = 'Từ giờ';
  sheetOt.getCell('G5').value = 'Đến giờ';
  sheetOt.getCell('H5').value = 'Tổng số giờ';
  sheetOt.mergeCells('I4:I5');
  sheetOt.getCell('I4').value = 'Nội Dung / Lý Do Làm Thêm';

  sheetOt.getRow(4).height = 22;
  sheetOt.getRow(5).height = 22;

  for (let r = 4; r <= 5; r++) {
    for (let c = 2; c <= 9; c++) {
      const cell = sheetOt.getRow(r).getCell(c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }; // Amber Header
      cell.font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = borderThin;
    }
  }

  // Nhóm các bản ghi OT theo Tháng
  const otByMonth = new Map();
  for (let m = 1; m <= 12; m++) {
    otByMonth.set(String(m).padStart(2, '0'), []);
  }

  allYearOtLogs.forEach(log => {
    const mStr = log.month_num;
    if (otByMonth.has(mStr)) {
      otByMonth.get(mStr).push(log);
    }
  });

  let curOtRow = 6;
  const monthOtSubtotalRows = [];

  for (let m = 1; m <= 12; m++) {
    const mStr = String(m).padStart(2, '0');
    const logsInM = otByMonth.get(mStr) || [];
    if (logsInM.length === 0) continue;

    // Dòng Header Tháng
    const mRow = sheetOt.getRow(curOtRow);
    sheetOt.mergeCells(`B${curOtRow}:I${curOtRow}`);
    mRow.getCell(2).value = `THÁNG ${m}`;
    mRow.getCell(2).font = { name: 'Times New Roman', size: 11, bold: true, color: { argb: 'FF92400E' } };
    mRow.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE68A' } }; // Amber light
    mRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    for (let c = 2; c <= 9; c++) mRow.getCell(c).border = borderThin;
    mRow.height = 22;
    curOtRow++;

    const mStartRow = curOtRow;

    logsInM.forEach(log => {
      const row = sheetOt.getRow(curOtRow);
      row.getCell(2).value = log.log_date;
      row.getCell(3).value = log.user_name;
      row.getCell(4).value = log.project_name;
      row.getCell(5).value = log.project_code;
      row.getCell(6).value = log.ot_from_time || '18:00';
      row.getCell(7).value = log.ot_to_time || '20:00';
      row.getCell(8).value = log.ot_hours;
      row.getCell(9).value = log.ot_reason || log.description;

      row.height = 20;
      row.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(6).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(7).alignment = { horizontal: 'center', vertical: 'middle' };
      row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
      row.getCell(8).numFmt = '#,##0.0';

      for (let c = 2; c <= 9; c++) {
        row.getCell(c).font = fontBody;
        row.getCell(c).border = borderThin;
      }
      curOtRow++;
    });

    const mEndRow = curOtRow - 1;

    // Dòng Subtotal Tháng
    const subRow = sheetOt.getRow(curOtRow);
    sheetOt.mergeCells(`B${curOtRow}:G${curOtRow}`);
    subRow.getCell(2).value = `CỘNG THÁNG ${m} (${logsInM.length} lượt làm thêm)`;
    subRow.getCell(2).font = fontBold;
    subRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' };
    subRow.getCell(8).value = { formula: `SUM(H${mStartRow}:H${mEndRow})` };
    subRow.getCell(8).font = fontBold;
    subRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    subRow.getCell(8).numFmt = '#,##0.0';

    for (let c = 2; c <= 9; c++) {
      subRow.getCell(c).fill = fillSubtotal;
      subRow.getCell(c).border = borderThin;
    }
    subRow.height = 22;
    monthOtSubtotalRows.push(curOtRow);
    curOtRow++;
  }

  // Dòng Tổng Cộng Cả Năm (Sheet OT)
  if (monthOtSubtotalRows.length > 0) {
    const totalRow = sheetOt.getRow(curOtRow);
    sheetOt.mergeCells(`B${curOtRow}:G${curOtRow}`);
    totalRow.getCell(2).value = `TỔNG CỘNG GIỜ LÀM THÊM NĂM ${targetYear}`;
    totalRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    totalRow.getCell(8).value = { formula: monthOtSubtotalRows.map(r => `H${r}`).join('+') };
    totalRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(8).numFmt = '#,##0.0';

    for (let c = 2; c <= 9; c++) {
      totalRow.getCell(c).fill = fillGrandTotal;
      totalRow.getCell(c).font = fontGrandTotal;
      totalRow.getCell(c).border = borderThin;
    }
    totalRow.height = 26;
  } else {
    const emptyRow = sheetOt.getRow(curOtRow);
    sheetOt.mergeCells(`B${curOtRow}:I${curOtRow}`);
    emptyRow.getCell(2).value = 'Chưa có bản ghi làm thêm giờ (OT) nào trong năm này.';
    emptyRow.getCell(2).alignment = { horizontal: 'center', vertical: 'middle' };
    emptyRow.getCell(2).font = fontSub;
    for (let c = 2; c <= 9; c++) emptyRow.getCell(c).border = borderThin;
  }


  // =========================================================================
  // SHEET 7: CHI TIẾT NHẬT KÝ (AUDIT TRAIL ĐẦY ĐỦ CÓ GIỜ THƯỜNG & OT)
  // =========================================================================
  const sheet7 = workbook.addWorksheet('Chi Tiết Nhật Ký');
  sheet7.columns = [
    { width: 6 },  // STT
    { width: 14 }, // Ngày làm việc
    { width: 24 }, // Nhân viên
    { width: 18 }, // Phòng ban
    { width: 15 }, // Mã dự án
    { width: 28 }, // Số Hợp đồng
    { width: 35 }, // Tên dự án
    { width: 12 }, // Giờ Tiêu Chuẩn
    { width: 12 }, // Giờ OT
    { width: 16 }, // Khung Giờ OT
    { width: 30 }, // Lý Do OT
    { width: 45 }  // Mô tả công việc
  ];

  const hRow7 = sheet7.addRow([
    'STT', 'Ngày Làm Việc', 'Họ Và Tên', 'Phòng Ban', 'Mã Dự Án', 'Số Hợp Đồng', 'Tên Dự Án',
    'Giờ Thường', 'Giờ OT', 'Khung Giờ OT', 'Lý Do OT', 'Nội Dung Công Việc'
  ]);
  hRow7.height = 26;
  hRow7.eachCell((cell, colNum) => {
    if (colNum === 9) {
      cell.fill = fillOtHeader;
    } else {
      cell.fill = fillHeader;
    }
    cell.font = fontHeader;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = borderThin;
  });

  const allDetailedLogs = db.prepare(`
    SELECT 
      wl.id,
      wl.log_date,
      u.full_name AS user_name,
      u.department,
      p.code AS project_code,
      COALESCE(p.contract_no, '') AS contract_no,
      p.name AS project_name,
      wl.hours,
      COALESCE(wl.ot_hours, 0) AS ot_hours,
      COALESCE(wl.ot_from_time, '') AS ot_from_time,
      COALESCE(wl.ot_to_time, '') AS ot_to_time,
      COALESCE(wl.ot_reason, '') AS ot_reason,
      wl.description
    FROM work_logs wl
    JOIN users u ON wl.user_id = u.id
    JOIN projects p ON wl.project_id = p.id
    WHERE wl.log_date LIKE ?
    ORDER BY wl.log_date DESC, u.full_name ASC
  `).all(`${targetYear}%`);

  allDetailedLogs.forEach((log, idx) => {
    const regularHours = log.hours;
    const otTimeRange = (log.ot_from_time && log.ot_to_time) ? `${log.ot_from_time} - ${log.ot_to_time}` : '';

    const row = sheet7.addRow([
      idx + 1,
      log.log_date,
      log.user_name,
      log.department,
      log.project_code,
      log.contract_no,
      log.project_name,
      regularHours,
      log.ot_hours > 0 ? log.ot_hours : null,
      otTimeRange,
      log.ot_reason,
      log.description
    ]);
    row.height = 20;
    row.getCell(1).alignment = { horizontal: 'center' };
    row.getCell(2).alignment = { horizontal: 'center' };
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(8).alignment = { horizontal: 'right' };
    row.getCell(8).numFmt = '#,##0.0';
    row.getCell(9).alignment = { horizontal: 'right' };
    row.getCell(9).numFmt = '#,##0.0';
    row.getCell(9).font = { name: 'Times New Roman', size: 10, color: { argb: 'FFB45309' }, bold: true };
    row.getCell(10).alignment = { horizontal: 'center' };

    row.eachCell(c => {
      if (!c.font) c.font = fontBody;
      c.border = borderThin;
    });
  });

  // 3. Trả file về trình duyệt
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Bao_Cao_Ma_Tran_Gio_Cong_${targetYear}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}

module.exports = {
  exportHpaTimesheet
};
