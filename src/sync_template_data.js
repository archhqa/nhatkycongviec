const Database = require('better-sqlite3');
const ExcelJS = require('exceljs');
const path = require('path');
const bcrypt = require('bcryptjs');

// Utility to convert Vietnamese name to username slug
function slugify(str) {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function syncTemplateToDb() {
  const dbPath = path.join(__dirname, '..', 'worklog.db');
  const db = new Database(dbPath);

  // 1. Add contract_no column if not exists
  const cols = db.prepare('PRAGMA table_info(projects)').all();
  const hasContractNo = cols.some(c => c.name === 'contract_no');
  if (!hasContractNo) {
    db.exec("ALTER TABLE projects ADD COLUMN contract_no TEXT DEFAULT ''");
    console.log('-> Đã thêm cột contract_no vào bảng projects.');
  }

  // 2. Read template
  const templatePath = path.join(__dirname, '..', 'templates', 'HPA_Timesheet_Template.xlsx');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(templatePath);
  const sheet = wb.getWorksheet('T10');

  // 3. Import / Sync Projects
  console.log('--- ĐANG ĐỒNG BỘ DỰ ÁN TỪ TEMPLATE ---');
  const checkProjStmt = db.prepare('SELECT id FROM projects WHERE code = ?');
  const updateProjStmt = db.prepare('UPDATE projects SET name = ?, contract_no = ?, status = ? WHERE code = ?');
  const insertProjStmt = db.prepare(`
    INSERT INTO projects (code, name, contract_no, description, status)
    VALUES (?, ?, ?, ?, 'active')
  `);

  let projCount = 0;
  for (let r = 3; r <= 62; r++) {
    const code = sheet.getRow(r).getCell(2).value;
    const contract = sheet.getRow(r).getCell(3).value;
    const name = sheet.getRow(r).getCell(4).value;

    if (!code && !name) continue;

    const cleanCode = code ? String(code).trim() : `DA_${r}`;
    const cleanContract = contract ? String(contract).trim() : '';
    const cleanName = name ? String(name).trim() : cleanCode;

    const existing = checkProjStmt.get(cleanCode);
    if (existing) {
      updateProjStmt.run(cleanName, cleanContract, 'active', cleanCode);
    } else {
      insertProjStmt.run(cleanCode, cleanName, cleanContract, cleanContract ? `Hợp đồng: ${cleanContract}` : '');
    }
    projCount++;
  }
  console.log(`-> Đã đồng bộ ${projCount} dự án vào CSDL.`);

  // 4. Import / Sync Employees
  console.log('--- ĐANG ĐỒNG BỘ NHÂN SỰ TỪ TEMPLATE ---');
  const checkUserStmt = db.prepare('SELECT id FROM users WHERE full_name = ? OR username = ?');
  const updateUserStmt = db.prepare('UPDATE users SET department = ? WHERE id = ?');
  const insertUserStmt = db.prepare(`
    INSERT INTO users (username, password_hash, full_name, role, department, is_active)
    VALUES (?, ?, ?, 'employee', ?, 1)
  `);

  const salt = bcrypt.genSaltSync(10);
  const defaultHash = bcrypt.hashSync('123456', salt);

  let empCount = 0;
  for (let c = 5; c <= 38; c++) {
    const team = sheet.getRow(1).getCell(c).value;
    const fullName = sheet.getRow(2).getCell(c).value;
    if (!fullName) continue;

    const cleanName = String(fullName).trim();
    const cleanTeam = team ? String(team).trim() : 'Thiết kế';
    const cleanUsername = slugify(cleanName);

    const existing = checkUserStmt.get(cleanName, cleanUsername);
    if (existing) {
      updateUserStmt.run(cleanTeam, existing.id);
    } else {
      insertUserStmt.run(cleanUsername, defaultHash, cleanName, cleanTeam);
    }
    empCount++;
  }
  console.log(`-> Đã đồng bộ ${empCount} nhân sự vào CSDL (Mật khẩu mặc định: 123456).`);
}

syncTemplateToDb().catch(console.error);
