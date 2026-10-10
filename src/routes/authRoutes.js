const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const { generateToken, authMiddleware } = require('../auth');

// Đăng nhập
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
  }

  if (user.is_active !== 1) {
    return res.status(403).json({ error: 'Tài khoản này hiện đang bị khóa. Vui lòng liên hệ Admin.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không chính xác.' });
  }

  const token = generateToken(user);

  res.cookie('token', token, {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: 'lax'
  });

  return res.json({
    message: 'Đăng nhập thành công',
    token,
    user: {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role,
      department: user.department
    }
  });
});

// Đăng ký tài khoản nhân viên mới từ bên ngoài
router.post('/register', (req, res) => {
  const { username, password, full_name, fullName, department } = req.body;
  const name = (full_name || fullName || '').trim();

  if (!username || !password || !name) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ Tên đăng nhập, Mật khẩu và Họ tên.' });
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanFullName = name;
  const cleanDept = department ? department.trim() : '';

  // Kiểm tra tên đăng nhập hợp lệ (chữ, số, gạch dưới, tối thiểu 3 ký tự)
  const usernameRegex = /^[a-zA-Z0-9_]{3,30}$/;
  if (!usernameRegex.test(cleanUsername)) {
    return res.status(400).json({ error: 'Tên đăng nhập từ 3-30 ký tự, chỉ gồm chữ cái, chữ số hoặc dấu gạch dưới (không dấu, không khoảng trắng).' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự.' });
  }

  // Kiểm tra xem username đã tồn tại chưa
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUsername);
  if (existing) {
    return res.status(400).json({ error: `Tên đăng nhập '${cleanUsername}' đã có người sử dụng. Vui lòng chọn tên khác.` });
  }

  try {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const info = db.prepare(`
      INSERT INTO users (username, password_hash, full_name, role, department, is_active)
      VALUES (?, ?, ?, 'employee', ?, 1)
    `).run(cleanUsername, hash, cleanFullName, cleanDept);

    const newUser = db.prepare('SELECT id, username, full_name, role, department FROM users WHERE id = ?').get(info.lastInsertRowid);

    // Tự động đăng nhập luôn cho user sau khi tạo tài khoản
    const token = generateToken(newUser);
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'lax'
    });

    return res.status(201).json({
      message: 'Đăng ký tài khoản thành công! Chào mừng ' + newUser.full_name,
      token,
      user: newUser
    });
  } catch (err) {
    return res.status(500).json({ error: 'Lỗi khi tạo tài khoản: ' + err.message });
  }
});

// Đăng xuất
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Đã đăng xuất thành công' });
});

// Lấy thông tin tài khoản hiện tại
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, full_name, role, department, is_active FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Không tìm thấy thông tin tài khoản.' });
  }
  res.json({ user });
});

// Đổi mật khẩu cá nhân
router.post('/change-password', authMiddleware, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Vui lòng cung cấp mật khẩu hiện tại và mật khẩu mới.' });
  }

  if (new_password.length < 6) {
    return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'Người dùng không tồn tại.' });
  }

  const isMatch = bcrypt.compareSync(current_password, user.password_hash);
  if (!isMatch) {
    return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng.' });
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, user.id);

  res.json({ message: 'Đổi mật khẩu thành công!' });
});

module.exports = router;
