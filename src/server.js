const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const os = require('os');

// Khởi tạo database
require('./db');

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const userRoutes = require('./routes/userRoutes');
const logRoutes = require('./routes/logRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Static web files
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/users', userRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/reports', reportRoutes);

// Fallback route cho Single Page Application
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Lấy danh sách địa chỉ IP LAN
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const server = app.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log('\n===============================================================');
  console.log('   PHẦN MỀM NHẬT KÝ CÔNG VIỆC & QUẢN LÝ GIỜ CÔNG DỰ ÁN   ');
  console.log('===============================================================');
  console.log(`\n-> Server đang chạy thành công tại:`);
  console.log(`   * Trên máy tính này:     http://localhost:${PORT}`);
  if (localIps.length > 0) {
    console.log(`   * Mạng nội bộ (LAN):     http://${localIps[0]}:${PORT}`);
    if (localIps.length > 1) {
      localIps.slice(1).forEach(ip => {
        console.log(`                            http://${ip}:${PORT}`);
      });
    }
  }
  console.log('\n-> Tài khoản mặc định:');
  console.log('   * Quản trị viên (Admin): admin / admin123');
  console.log('   * Nhân viên mẫu 1:       nv_nam / 123456');
  console.log('   * Nhân viên mẫu 2:       nv_lan / 123456');
  console.log('   * Nhân viên mẫu 3:       nv_tuan / 123456');
  console.log('===============================================================\n');
});

module.exports = { app, server };
