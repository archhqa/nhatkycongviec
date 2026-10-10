// ==========================================
// WORKLOG MANAGER - FRONTEND APPLICATION JS
// ==========================================

const now = new Date();
const state = {
  currentUser: null,
  activeTab: 'logs',
  calendarYear: now.getFullYear(),
  calendarMonth: now.getMonth() + 1, // 1 - 12
  selectedModalDate: null,
  projects: [],
  monthLogsByDate: {},
  pieChart: null,
  barChart: null
};

// ------------------------------------------
// 1. TIỆN ÍCH & THÔNG BÁO (TOAST)
// ------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast-item pointer-events-auto flex items-center p-3.5 rounded-xl shadow-lg border text-sm max-w-sm transition-all`;

  let icon = '<i class="fa-solid fa-circle-info mr-2.5 text-blue-500"></i>';
  let bg = 'bg-white border-slate-200 text-slate-800';

  if (type === 'success') {
    icon = '<i class="fa-solid fa-circle-check mr-2.5 text-emerald-500"></i>';
    bg = 'bg-emerald-50/95 border-emerald-200 text-emerald-900';
  } else if (type === 'error') {
    icon = '<i class="fa-solid fa-circle-exclamation mr-2.5 text-rose-500"></i>';
    bg = 'bg-rose-50/95 border-rose-200 text-rose-900';
  } else if (type === 'warning') {
    icon = '<i class="fa-solid fa-triangle-exclamation mr-2.5 text-amber-500"></i>';
    bg = 'bg-amber-50/95 border-amber-200 text-amber-900';
  }

  toast.className += ` ${bg}`;
  toast.innerHTML = `<div class="flex items-center flex-1">${icon}<span>${message}</span></div>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function formatDateVN(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function getDayNameVN(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  return days[d.getDay()];
}

// ------------------------------------------
// 2. KHỞI TẠO & KIỂM TRA ĐĂNG NHẬP
// ------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initEventListeners();
  checkAuth();
});

function initEventListeners() {
  // Form Đăng nhập
  document.getElementById('loginForm').addEventListener('submit', handleLogin);

  // Toggle xem mật khẩu
  document.getElementById('togglePasswordBtn').addEventListener('click', () => {
    const pwdInput = document.getElementById('loginPassword');
    const icon = document.getElementById('togglePasswordIcon');
    if (pwdInput.type === 'password') {
      pwdInput.type = 'text';
      icon.className = 'fa-solid fa-eye-slash';
    } else {
      pwdInput.type = 'password';
      icon.className = 'fa-solid fa-eye';
    }
  });

  // User menu dropdown toggle
  const userMenuBtn = document.getElementById('userMenuBtn');
  const userDropdown = document.getElementById('userDropdown');
  userMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    userDropdown.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    userDropdown.classList.add('hidden');
  });

  // Sự kiện chọn tháng trên lịch
  const calendarMonthPicker = document.getElementById('calendarMonthPicker');
  if (calendarMonthPicker) {
    calendarMonthPicker.addEventListener('change', (e) => {
      if (e.target.value) {
        const [year, month] = e.target.value.split('-').map(Number);
        state.calendarYear = year;
        state.calendarMonth = month;
        loadCalendar();
      }
    });
  }

  // Form Modal Ghi nhật ký theo ngày
  const dayLogModalForm = document.getElementById('dayLogModalForm');
  if (dayLogModalForm) {
    dayLogModalForm.addEventListener('submit', handleSaveModalLog);
  }

  // Form Dự án
  document.getElementById('projectForm').addEventListener('submit', handleSaveProject);

  // Form Người dùng
  document.getElementById('userForm').addEventListener('submit', handleSaveUser);

  // Form Reset password
  document.getElementById('resetPasswordForm').addEventListener('submit', handleResetPassword);

  // Form Đổi mật khẩu cá nhân
  document.getElementById('changePasswordForm').addEventListener('submit', handleChangePassword);

  // Mặc định chọn tháng hiện tại ở báo cáo
  const reportMonth = document.getElementById('reportMonthSelector');
  reportMonth.value = new Date().toISOString().slice(0, 7);
}

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      setupLoggedInUser(data.user);
    } else {
      showLoginScreen();
    }
  } catch (err) {
    showLoginScreen();
  }
}

function fillDemo(username, password) {
  document.getElementById('loginUsername').value = username;
  document.getElementById('loginPassword').value = password;
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const submitBtn = document.getElementById('loginSubmitBtn');

  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Đang đăng nhập...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Đăng nhập không thành công', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>Đăng nhập hệ thống</span><i class="fa-solid fa-arrow-right text-xs"></i>';
      return;
    }

    showToast('Đăng nhập thành công! Chào mừng ' + data.user.full_name, 'success');
    setupLoggedInUser(data.user);
  } catch (err) {
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>Đăng nhập hệ thống</span><i class="fa-solid fa-arrow-right text-xs"></i>';
  }
}

// Chuyển đổi giữa Đăng Nhập và Đăng Ký
function switchAuthMode(mode) {
  const loginContainer = document.getElementById('loginFormContainer');
  const registerContainer = document.getElementById('registerFormContainer');
  const tabLogin = document.getElementById('authTabLogin');
  const tabRegister = document.getElementById('authTabRegister');

  if (mode === 'register') {
    loginContainer.classList.add('hidden');
    registerContainer.classList.remove('hidden');

    tabRegister.className = 'flex-1 pb-2.5 text-sm font-bold text-emerald-600 border-b-2 border-emerald-600 transition flex items-center justify-center space-x-1.5';
    tabLogin.className = 'flex-1 pb-2.5 text-sm font-bold text-slate-400 hover:text-slate-600 border-b-2 border-transparent transition flex items-center justify-center space-x-1.5';
  } else {
    registerContainer.classList.add('hidden');
    loginContainer.classList.remove('hidden');

    tabLogin.className = 'flex-1 pb-2.5 text-sm font-bold text-blue-600 border-b-2 border-blue-600 transition flex items-center justify-center space-x-1.5';
    tabRegister.className = 'flex-1 pb-2.5 text-sm font-bold text-slate-400 hover:text-slate-600 border-b-2 border-transparent transition flex items-center justify-center space-x-1.5';
  }
}

// Xử lý đăng ký tài khoản nhân viên mới từ bên ngoài
async function handleRegister(e) {
  e.preventDefault();
  const full_name = document.getElementById('registerFullName').value.trim();
  const username = document.getElementById('registerUsername').value.trim();
  const department = document.getElementById('registerDept').value.trim();
  const password = document.getElementById('registerPassword').value;

  const submitBtn = document.getElementById('registerSubmitBtn');
  const submitText = document.getElementById('registerSubmitBtnText');
  submitBtn.disabled = true;
  submitText.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang tạo tài khoản...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name, username, department, password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Đăng ký tài khoản không thành công', 'error');
      submitBtn.disabled = false;
      submitText.innerText = 'Tạo Tài Khoản & Bắt Đầu Dùng';
      return;
    }

    showToast('Tạo tài khoản thành công! Chào mừng ' + data.user.full_name, 'success');
    // Tự động đăng nhập vào ứng dụng
    setupLoggedInUser(data.user);
  } catch (err) {
    showToast('Lỗi kết nối máy chủ: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitText.innerText = 'Tạo Tài Khoản & Bắt Đầu Dùng';
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (err) {}
  state.currentUser = null;
  showToast('Đã đăng xuất', 'info');
  showLoginScreen();
}

function showLoginScreen() {
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('appScreen').classList.add('hidden');
  switchAuthMode('login');
}

function setupLoggedInUser(user) {
  state.currentUser = user;
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('appScreen').classList.remove('hidden');

  // Header user info
  document.getElementById('userFullName').innerText = user.full_name;
  document.getElementById('userDept').innerText = user.department || 'Thành viên';
  document.getElementById('userAvatarChar').innerText = user.full_name.charAt(0).toUpperCase();

  const roleBadge = document.getElementById('userRoleBadge');
  const calUserWrapper = document.getElementById('calendarUserFilterWrapper');

  if (user.role === 'admin') {
    roleBadge.innerText = 'Quản trị viên';
    roleBadge.className = 'text-[11px] px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700';
    // Hiển thị các tab dành riêng cho admin
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    if (calUserWrapper) calUserWrapper.classList.remove('hidden');
    loadUsersDropdowns();
  } else {
    roleBadge.innerText = 'Nhân viên';
    roleBadge.className = 'text-[11px] px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700';
    // Ẩn các tab admin
    document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
    if (calUserWrapper) calUserWrapper.classList.add('hidden');
  }

  // Khởi động dữ liệu ban đầu
  switchTab('logs');
}

// ------------------------------------------
// 3. ĐIỀU HƯỚNG TABS
// ------------------------------------------
function switchTab(tabName) {
  // Kiểm tra quyền admin cho các tab đặc thù
  if (['reports', 'projects', 'users'].includes(tabName) && state.currentUser?.role !== 'admin') {
    showToast('Bạn không có quyền truy cập trang này!', 'error');
    tabName = 'logs';
  }

  state.activeTab = tabName;

  // Cập nhật kiểu nút tab
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  const currentBtn = document.getElementById(`tabBtn-${tabName}`);
  if (currentBtn) currentBtn.classList.add('active');

  // Ẩn/Hiện nội dung
  ['logs', 'reports', 'projects', 'users'].forEach(t => {
    const content = document.getElementById(`tabContent-${t}`);
    if (content) {
      if (t === tabName) {
        content.classList.remove('hidden');
      } else {
        content.classList.add('hidden');
      }
    }
  });

  // Tải dữ liệu tương ứng khi vào tab
  if (tabName === 'logs') {
    loadProjectsList();
    loadCalendar();
  } else if (tabName === 'reports') {
    loadMonthlyReport();
  } else if (tabName === 'projects') {
    loadProjectsTable();
  } else if (tabName === 'users') {
    loadUsersTable();
  }
}

// ------------------------------------------
// 4. TAB 1: NHẬT KÝ THEO LỊCH THÁNG (MONTHLY CALENDAR)
// ------------------------------------------

// Chuyển tháng trước
function prevMonth() {
  if (state.calendarMonth === 1) {
    state.calendarMonth = 12;
    state.calendarYear -= 1;
  } else {
    state.calendarMonth -= 1;
  }
  loadCalendar();
}

// Chuyển tháng sau
function nextMonth() {
  if (state.calendarMonth === 12) {
    state.calendarMonth = 1;
    state.calendarYear += 1;
  } else {
    state.calendarMonth += 1;
  }
  loadCalendar();
}

// Về tháng hiện tại
function goToCurrentMonth() {
  const d = new Date();
  state.calendarYear = d.getFullYear();
  state.calendarMonth = d.getMonth() + 1;
  loadCalendar();
}

// Mở modal cho ngày hôm nay
function openDayModalForToday() {
  const todayStr = new Date().toISOString().split('T')[0];
  openDayDetailModal(todayStr);
}

// Tải danh sách nhân viên để điền vào bộ lọc và form chọn
async function loadUsersDropdowns() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) return;
    const data = await res.json();
    userListCache = data.users || [];

    // 1. Cập nhật dropdown lọc nhân viên trên Lịch tháng (Admin)
    const calFilter = document.getElementById('calendarUserFilter');
    if (calFilter) {
      const currentVal = calFilter.value;
      calFilter.innerHTML = '<option value="">-- Tất cả nhân viên --</option>';
      userListCache.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.full_name} (${u.username})`;
        calFilter.appendChild(opt);
      });
      if (currentVal) calFilter.value = currentVal;
    }

    // 2. Cập nhật dropdown chọn nhân viên ở modal ghi nhật ký
    const modalUserSelect = document.getElementById('modalUserSelect');
    if (modalUserSelect) {
      const currentModalVal = modalUserSelect.value;
      modalUserSelect.innerHTML = '';
      userListCache.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = `${u.full_name} (${u.username})`;
        modalUserSelect.appendChild(opt);
      });
      if (currentModalVal) {
        modalUserSelect.value = currentModalVal;
      } else if (state.currentUser) {
        modalUserSelect.value = state.currentUser.id;
      }
    }
  } catch (err) {
    console.error('Lỗi tải danh sách nhân viên cho dropdown:', err);
  }
}

// Tải danh sách dự án active để điền vào các dropdown chọn
async function loadProjectsList() {
  try {
    const res = await fetch('/api/projects');
    if (!res.ok) return;
    const data = await res.json();
    state.projects = data.projects;

    // Cập nhật dropdown ở modal ghi việc
    const modalSelect = document.getElementById('modalProjectSelect');
    if (modalSelect) {
      modalSelect.innerHTML = '<option value="">-- Bấm để chọn tên dự án --</option>';
      data.projects.forEach(p => {
        if (p.status === 'active') {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.contract_no ? `[${p.code}] ${p.name} (HĐ: ${p.contract_no})` : `[${p.code}] ${p.name}`;
          modalSelect.appendChild(opt);
        }
      });
    }
  } catch (err) {
    console.error('Lỗi tải danh mục dự án:', err);
  }
}

// Tải dữ liệu nhật ký và render lịch tháng
async function loadCalendar() {
  const monthStr = `${state.calendarYear}-${String(state.calendarMonth).padStart(2, '0')}`;
  
  // Cập nhật tiêu đề và picker
  const monthTitle = document.getElementById('calendarMonthTitle');
  if (monthTitle) {
    monthTitle.innerText = `Tháng ${state.calendarMonth} / ${state.calendarYear}`;
  }
  const picker = document.getElementById('calendarMonthPicker');
  if (picker) {
    picker.value = monthStr;
  }

  // Kiểm tra bộ lọc nhân viên (Admin)
  const calFilter = document.getElementById('calendarUserFilter');
  const filteredUserId = (state.currentUser?.role === 'admin' && calFilter) ? calFilter.value : '';

  let queryUrl = `/api/logs?month=${monthStr}&limit=500`;
  if (filteredUserId) {
    queryUrl += `&user_id=${encodeURIComponent(filteredUserId)}`;
  }

  try {
    const res = await fetch(queryUrl);
    if (!res.ok) return;
    const data = await res.json();

    // Gom nhóm nhật ký theo ngày YYYY-MM-DD
    state.monthLogsByDate = {};
    let totalMonthHours = 0;
    let totalMonthOtHours = 0;
    data.logs.forEach(log => {
      if (!state.monthLogsByDate[log.log_date]) {
        state.monthLogsByDate[log.log_date] = [];
      }
      state.monthLogsByDate[log.log_date].push(log);
      totalMonthHours += log.hours;
      totalMonthOtHours += (log.ot_hours || 0);
    });

    // Cập nhật thống kê tháng của người dùng
    document.getElementById('userMonthTotalHours').innerText = `${totalMonthHours.toFixed(1)}h`;
    const otMonthEl = document.getElementById('userMonthOtHours');
    if (otMonthEl) otMonthEl.innerText = `${totalMonthOtHours.toFixed(1)}h`;
    document.getElementById('userMonthActiveDays').innerText = `${Object.keys(state.monthLogsByDate).length} ngày`;

    // Render lưới lịch
    renderCalendarGrid();

  } catch (err) {
    console.error('Lỗi tải lịch tháng:', err);
  }
}

// Render lưới lịch 7 cột (Thứ 2 -> Chủ Nhật)
function renderCalendarGrid() {
  const container = document.getElementById('calendarDaysGrid');
  if (!container) return;

  const year = state.calendarYear;
  const month = state.calendarMonth;

  // Ngày đầu tiên của tháng (1..31)
  const firstDayOfMonth = new Date(year, month - 1, 1);
  // Thứ trong tuần: JS getDay() trả về 0 (CN), 1 (T2), ..., 6 (T7)
  // Quy đổi sang Thứ 2 là 0: (getDay() + 6) % 7
  let startDayOfWeek = (firstDayOfMonth.getDay() + 6) % 7;

  // Số ngày trong tháng hiện tại
  const daysInCurrentMonth = new Date(year, month, 0).getDate();
  // Số ngày trong tháng trước
  const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

  const todayStr = new Date().toISOString().split('T')[0];

  let html = '';

  // 1. Các ô ngày bù từ tháng trước
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const dayNum = daysInPrevMonth - i;
    html += `
      <div class="calendar-day-cell other-month p-2 sm:p-2.5 flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">${dayNum}</span>
        </div>
      </div>
    `;
  }

  // 2. Các ô ngày trong tháng hiện tại
  for (let day = 1; day <= daysInCurrentMonth; day++) {
    const dayStr = String(day).padStart(2, '0');
    const monthStr = String(month).padStart(2, '0');
    const dateStr = `${year}-${monthStr}-${dayStr}`;

    const logs = state.monthLogsByDate[dateStr] || [];
    const dayHours = logs.reduce((sum, item) => sum + item.hours, 0);
    const dayOtHours = logs.reduce((sum, item) => sum + (item.ot_hours || 0), 0);

    const isToday = (dateStr === todayStr);
    
    // Kiểm tra thứ 7 hoặc CN
    const dateObj = new Date(year, month - 1, day);
    const dayOfWeek = (dateObj.getDay() + 6) % 7; // 5 là T7, 6 là CN
    const isWeekend = (dayOfWeek === 5 || dayOfWeek === 6);

    let cellClasses = 'calendar-day-cell p-2 sm:p-2.5 flex flex-col justify-between cursor-pointer';
    if (isToday) cellClasses += ' is-today ring-2 ring-blue-500/70 ring-inset';
    else if (isWeekend) cellClasses += ' is-weekend';

    // Badge tổng số giờ
    let hourBadgeHtml = '';
    if (dayHours > 0 || dayOtHours > 0) {
      if (dayOtHours > 0) {
        hourBadgeHtml = `
          <div class="flex items-center space-x-1">
            <span class="text-[11px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">${dayHours.toFixed(1)}h</span>
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200" title="Giờ làm thêm OT: ${dayOtHours.toFixed(1)}h">+${dayOtHours.toFixed(1)} OT</span>
          </div>
        `;
      } else if (dayHours >= 8) {
        hourBadgeHtml = `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">${dayHours.toFixed(1)}h</span>`;
      } else {
        hourBadgeHtml = `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">${dayHours.toFixed(1)}h</span>`;
      }
    }

    // Danh sách thẻ dự án trong ngày
    let projectBadgesHtml = '';
    const isAdmin = (state.currentUser?.role === 'admin');
    if (logs.length > 0) {
      projectBadgesHtml = logs.slice(0, 3).map(log => {
        const userBadge = (isAdmin && log.user_name) ? `<span class="text-[9px] font-semibold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1 py-0.2 rounded truncate max-w-[85px] inline-block" title="Nhân viên: ${escapeHtml(log.user_name)}">${escapeHtml(log.user_name)}</span>` : '';
        return `
        <div onclick="event.stopPropagation(); openDayDetailModal('${dateStr}', ${log.id})" 
          title="[${log.project_code}] ${log.project_name} | ${escapeHtml(log.user_name || '')}: ${log.hours}h ${log.ot_hours > 0 ? `(+${log.ot_hours}h OT)` : ''} - ${escapeHtml(log.description)}"
          class="proj-badge-item text-[11px] font-medium bg-white border border-slate-200/90 text-slate-800 px-2 py-1 rounded-lg flex items-center justify-between shadow-xs truncate cursor-pointer hover:border-blue-400">
          <div class="truncate mr-1 flex items-center space-x-1">
            <span class="truncate font-bold text-blue-700">[${log.project_code}]</span>
            ${userBadge}
          </div>
          <div class="flex items-center space-x-1 shrink-0">
            <span class="font-bold text-[10px] text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded">${log.hours.toFixed(1)}h</span>
            ${log.ot_hours > 0 ? `<span class="font-bold text-[9px] text-amber-800 bg-amber-100 px-1 py-0.2 rounded border border-amber-200">+${log.ot_hours} OT</span>` : ''}
          </div>
        </div>
      `;
      }).join('');

      if (logs.length > 3) {
        projectBadgesHtml += `
          <div class="text-[10px] text-slate-500 font-semibold text-center py-0.5">
            +${logs.length - 3} bản ghi khác...
          </div>
        `;
      }
    }

    html += `
      <div onclick="openDayDetailModal('${dateStr}')" class="${cellClasses}">
        <!-- Top header ngày: Số ngày + Badge tổng giờ -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="text-xs sm:text-sm font-bold ${isToday ? 'text-blue-700 bg-blue-100 w-6 h-6 rounded-full flex items-center justify-center -ml-0.5' : (isWeekend ? 'text-slate-500' : 'text-slate-900')}">
              ${day}
            </span>
            ${hourBadgeHtml}
          </div>

          <!-- Danh sách thẻ dự án -->
          <div class="space-y-1 mt-1">
            ${projectBadgesHtml}
          </div>
        </div>

        <!-- Nút + Dự án ở dưới cùng của ô ngày -->
        <button type="button" onclick="event.stopPropagation(); openDayDetailModal('${dateStr}')" 
          class="mt-2 text-[11px] font-medium text-slate-400 hover:text-blue-700 hover:bg-blue-50/80 py-1 px-1.5 rounded-lg border border-dashed border-slate-200 hover:border-blue-300 flex items-center justify-center space-x-1 transition w-full">
          <i class="fa-solid fa-plus text-[9px]"></i>
          <span>Dự án</span>
        </button>
      </div>
    `;
  }

  // 3. Các ô ngày bù tháng sau để đủ lưới tuần (35 hoặc 42 ô)
  const totalCellsSoFar = startDayOfWeek + daysInCurrentMonth;
  const targetTotal = totalCellsSoFar > 35 ? 42 : 35;
  const remainingCells = targetTotal - totalCellsSoFar;

  for (let d = 1; d <= remainingCells; d++) {
    html += `
      <div class="calendar-day-cell other-month p-2 sm:p-2.5 flex flex-col justify-between">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold text-slate-400">${d}</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}

// ------------------------------------------
// MODAL GHI & QUẢN LÝ NHẬT KÝ THEO NGÀY
// ------------------------------------------
function openDayDetailModal(dateStr, editLogId = null) {
  state.selectedModalDate = dateStr;
  document.getElementById('modalSelectedDate').value = dateStr;

  // Tiêu đề ngày: format Thứ, DD/MM/YYYY
  const dayName = getDayNameVN(dateStr);
  const formattedDate = formatDateVN(dateStr);
  document.getElementById('modalDayTitle').innerText = `${dayName}, ngày ${formattedDate}`;

  // Kiểm tra hiển thị ô chọn nhân viên (chỉ dành cho Admin)
  const userSelectWrapper = document.getElementById('modalUserSelectWrapper');
  if (state.currentUser?.role === 'admin') {
    if (userSelectWrapper) userSelectWrapper.classList.remove('hidden');
    const userSelect = document.getElementById('modalUserSelect');
    if (userSelect && userSelect.options.length === 0) {
      loadUsersDropdowns();
    }
  } else {
    if (userSelectWrapper) userSelectWrapper.classList.add('hidden');
  }

  // Đảm bảo dropdown dự án đã được nạp
  loadProjectsList();

  // Nạp danh sách các công việc đã làm trong ngày đó
  renderModalDayLogsList(dateStr);

  // Nếu có editLogId thì nạp dữ liệu lên form để sửa, ngược lại reset form
  if (editLogId) {
    editModalLog(editLogId);
  } else {
    resetModalLogForm();
  }

  document.getElementById('dayDetailModal').classList.remove('hidden');
}

function closeDayDetailModal() {
  document.getElementById('dayDetailModal').classList.add('hidden');
  resetModalLogForm();
}

function renderModalDayLogsList(dateStr) {
  const logs = state.monthLogsByDate[dateStr] || [];
  const container = document.getElementById('modalDayLogsList');
  const countBadge = document.getElementById('modalDayItemsCount');
  const totalBadge = document.getElementById('modalDayTotalBadge');
  const otBadge = document.getElementById('modalDayOtBadge');

  const dayTotalHours = logs.reduce((sum, item) => sum + item.hours, 0);
  const dayTotalOtHours = logs.reduce((sum, item) => sum + (item.ot_hours || 0), 0);
  countBadge.innerText = `${logs.length} mục`;
  totalBadge.innerText = `Tổng: ${dayTotalHours.toFixed(1)} giờ`;

  if (otBadge) {
    if (dayTotalOtHours > 0) {
      otBadge.classList.remove('hidden');
      otBadge.innerText = `+${dayTotalOtHours.toFixed(1)}h OT`;
    } else {
      otBadge.classList.add('hidden');
    }
  }

  if (dayTotalHours >= 8) {
    totalBadge.className = 'px-3 py-1 rounded-xl text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200';
  } else if (dayTotalHours > 0) {
    totalBadge.className = 'px-3 py-1 rounded-xl text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200';
  } else {
    totalBadge.className = 'px-3 py-1 rounded-xl text-xs font-bold bg-slate-100 text-slate-600 border border-slate-200';
  }

  if (logs.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 text-xs text-slate-400 bg-slate-50/60 rounded-xl border border-dashed border-slate-200">
        Chưa có dự án nào được ghi nhận cho ngày này. Hãy chọn dự án ở dưới để thêm.
      </div>
    `;
    return;
  }

  const isAdmin = (state.currentUser?.role === 'admin');

  container.innerHTML = logs.map(item => `
    <div class="p-3 bg-white hover:bg-slate-50/90 rounded-xl border border-slate-200 transition shadow-xs flex items-start justify-between">
      <div class="flex-1 pr-3">
        <div class="flex flex-wrap items-center gap-1.5">
          ${item.user_name ? `
            <span class="px-2 py-0.5 text-[11px] font-bold bg-indigo-50 text-indigo-700 rounded-md border border-indigo-200 flex items-center space-x-1" title="Nhân viên thực hiện: ${escapeHtml(item.user_name)}">
              <i class="fa-solid fa-user text-[9px]"></i>
              <span>${escapeHtml(item.user_name)}</span>
            </span>
          ` : ''}
          <span class="px-2 py-0.5 text-xs font-bold bg-blue-100 text-blue-700 rounded-md">
            ${item.project_code}
          </span>
          <span class="text-xs font-bold text-slate-900">${item.project_name}</span>
          <span class="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200">
            ${item.hours.toFixed(1)}h
          </span>
          ${item.ot_hours > 0 ? `
            <span class="text-xs font-bold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-lg border border-amber-200 flex items-center space-x-1" title="${escapeHtml(item.ot_reason || 'Làm thêm giờ')}">
              <i class="fa-solid fa-business-time text-[10px]"></i>
              <span>+${item.ot_hours.toFixed(1)}h OT ${item.ot_from_time ? `(${item.ot_from_time} - ${item.ot_to_time})` : ''}</span>
            </span>
          ` : ''}
        </div>
        <p class="text-xs text-slate-600 mt-1.5 whitespace-pre-line leading-relaxed">${escapeHtml(item.description)}</p>
        ${item.ot_reason ? `<div class="text-[11px] text-amber-700 mt-1 flex items-center"><i class="fa-solid fa-circle-info mr-1 text-[10px]"></i><span>Lý do OT: ${escapeHtml(item.ot_reason)}</span></div>` : ''}
      </div>

      <div class="flex items-center space-x-1 shrink-0">
        ${(isAdmin || item.user_id === state.currentUser?.id) ? `
          <button type="button" onclick="editModalLog(${item.id})" title="Sửa" class="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition">
            <i class="fa-solid fa-pen-to-square text-xs"></i>
          </button>
          <button type="button" onclick="deleteModalLog(${item.id})" title="Xóa" class="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition">
            <i class="fa-solid fa-trash-can text-xs"></i>
          </button>
        ` : ''}
      </div>
    </div>
  `).join('');
}

function modalSetHours(h) {
  document.getElementById('modalHoursInput').value = h;
}

function modalSetOtHours(h) {
  document.getElementById('modalOtHoursInput').value = h;
}

function autoCalculateOtHours() {
  const fromVal = document.getElementById('modalOtFromInput').value;
  const toVal = document.getElementById('modalOtToInput').value;
  if (fromVal && toVal) {
    const [h1, m1] = fromVal.split(':').map(Number);
    const [h2, m2] = toVal.split(':').map(Number);
    let diffMinutes = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (diffMinutes < 0) diffMinutes += 24 * 60; // qua đêm
    const diffHours = Math.round((diffMinutes / 60) * 10) / 10;
    if (diffHours > 0) {
      document.getElementById('modalOtHoursInput').value = diffHours;
    }
  }
}

function resetModalLogForm() {
  document.getElementById('modalEditingLogId').value = '';
  document.getElementById('modalProjectSelect').value = '';
  document.getElementById('modalHoursInput').value = '';
  document.getElementById('modalOtHoursInput').value = '';
  document.getElementById('modalOtFromInput').value = '';
  document.getElementById('modalOtToInput').value = '';
  document.getElementById('modalOtReasonInput').value = '';
  document.getElementById('modalDescInput').value = '';

  // Đồng bộ chọn nhân viên cho Admin
  const modalUserSelect = document.getElementById('modalUserSelect');
  if (modalUserSelect) {
    const calFilter = document.getElementById('calendarUserFilter');
    if (calFilter && calFilter.value) {
      modalUserSelect.value = calFilter.value;
    } else if (state.currentUser) {
      modalUserSelect.value = state.currentUser.id;
    }
  }

  document.getElementById('modalFormTitle').innerHTML = `
    <i class="fa-solid fa-plus-circle text-blue-600 mr-2"></i>
    <span>Thêm Dự Án & Giờ Làm Việc</span>
  `;
  document.getElementById('modalSubmitBtnText').innerText = 'Lưu Vào Ngày Này';
  document.getElementById('modalCancelEditBtn').classList.add('hidden');
}

function editModalLog(id) {
  const dateStr = state.selectedModalDate;
  const logs = state.monthLogsByDate[dateStr] || [];
  const item = logs.find(x => x.id === id);
  if (!item) return;

  document.getElementById('modalEditingLogId').value = item.id;
  document.getElementById('modalProjectSelect').value = item.project_id;
  document.getElementById('modalHoursInput').value = item.hours;
  document.getElementById('modalOtHoursInput').value = item.ot_hours || '';
  document.getElementById('modalOtFromInput').value = item.ot_from_time || '';
  document.getElementById('modalOtToInput').value = item.ot_to_time || '';
  document.getElementById('modalOtReasonInput').value = item.ot_reason || '';
  document.getElementById('modalDescInput').value = item.description;

  const modalUserSelect = document.getElementById('modalUserSelect');
  if (modalUserSelect && item.user_id) {
    modalUserSelect.value = item.user_id;
  }

  document.getElementById('modalFormTitle').innerHTML = `
    <i class="fa-solid fa-pen-to-square text-blue-600 mr-2"></i>
    <span>Chỉnh Sửa Bản Ghi: [${item.project_code}]</span>
  `;
  document.getElementById('modalSubmitBtnText').innerText = 'Cập Nhật Bản Ghi';
  document.getElementById('modalCancelEditBtn').classList.remove('hidden');

  // Cuộn form vào tầm nhìn
  document.getElementById('dayLogModalForm').scrollIntoView({ behavior: 'smooth' });
}

async function handleSaveModalLog(e) {
  e.preventDefault();
  const editingId = document.getElementById('modalEditingLogId').value;
  const log_date = state.selectedModalDate;
  const project_id = document.getElementById('modalProjectSelect').value;
  const hours = document.getElementById('modalHoursInput').value;
  const ot_hours = document.getElementById('modalOtHoursInput').value;
  const ot_from_time = document.getElementById('modalOtFromInput').value;
  const ot_to_time = document.getElementById('modalOtToInput').value;
  const ot_reason = document.getElementById('modalOtReasonInput').value.trim();
  const description = document.getElementById('modalDescInput').value.trim();

  if (!project_id) {
    showToast('Vui lòng chọn dự án từ danh sách!', 'warning');
    return;
  }

  const payload = { project_id, log_date, hours, description, ot_hours, ot_from_time, ot_to_time, ot_reason };

  // Nếu là Admin, gửi kèm user_id đã chọn
  if (state.currentUser?.role === 'admin') {
    const selectedUserId = document.getElementById('modalUserSelect')?.value;
    if (selectedUserId) {
      payload.user_id = selectedUserId;
    }
  }

  const url = editingId ? `/api/logs/${editingId}` : '/api/logs';
  const method = editingId ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Lỗi khi lưu nhật ký', 'error');
      return;
    }

    showToast(data.message || 'Đã lưu nhật ký thành công!', 'success');
    resetModalLogForm();

    // Tải lại dữ liệu tháng và cập nhật lại modal ngày hiện tại
    await loadCalendar();
    renderModalDayLogsList(log_date);

  } catch (err) {
    showToast('Lỗi lưu nhật ký: ' + err.message, 'error');
  }
}

async function deleteModalLog(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa bản ghi nhật ký này?')) return;

  try {
    const res = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Không thể xóa', 'error');
      return;
    }

    showToast(data.message || 'Đã xóa bản ghi', 'success');

    // Tải lại lịch và cập nhật modal
    await loadCalendar();
    renderModalDayLogsList(state.selectedModalDate);

  } catch (err) {
    showToast('Lỗi xóa: ' + err.message, 'error');
  }
}

// ------------------------------------------
// 5. TAB 2: BÁO CÁO & TỔNG HỢP THÁNG (ADMIN)
// ------------------------------------------
async function loadMonthlyReport() {
  const month = document.getElementById('reportMonthSelector').value;
  if (!month) return;

  try {
    const res = await fetch(`/api/reports/monthly?month=${month}`);
    if (!res.ok) {
      const err = await res.json();
      showToast(err.error || 'Không thể tải báo cáo', 'error');
      return;
    }
    const data = await res.json();

    // 1. Cập nhật KPIs
    document.getElementById('kpiTotalHours').innerText = `${data.overall.grand_total_hours.toFixed(1)}h`;
    const kpiOtEl = document.getElementById('kpiOtHours');
    if (kpiOtEl) kpiOtEl.innerText = `Trong đó OT: ${(data.overall.grand_total_ot_hours || 0).toFixed(1)}h`;
    document.getElementById('kpiActiveProjects').innerText = data.overall.active_projects_count;
    document.getElementById('kpiActiveUsers').innerText = data.overall.active_users_count;

    // 2. Render Biểu đồ tròn phân bổ dự án
    renderProjectPieChart(data.projects);

    // 3. Render Biểu đồ cột xu hướng theo ngày
    renderDailyBarChart(data.daily_trend);

    // 4. Render Bảng 1: Tổng hợp theo Dự án
    renderReportProjectsTable(data.projects, data.overall.grand_total_hours, data.overall.grand_total_ot_hours || 0);

    // 5. Render Bảng 2: Tổng hợp theo Nhân viên
    renderReportUsersTable(data.users);

  } catch (err) {
    showToast('Lỗi tải báo cáo: ' + err.message, 'error');
  }
}

function renderProjectPieChart(projects) {
  const ctx = document.getElementById('projectPieChart').getContext('2d');
  
  if (state.pieChart) {
    state.pieChart.destroy();
  }

  const activeProjects = projects.filter(p => p.total_hours > 0);

  if (activeProjects.length === 0) {
    ctx.clearRect(0, 0, 300, 300);
    return;
  }

  const labels = activeProjects.map(p => `[${p.project_code}] ${p.project_name}`);
  const data = activeProjects.map(p => p.total_hours);
  const colors = [
    '#2563eb', '#3b82f6', '#60a5fa', '#06b6d4', 
    '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'
  ];

  state.pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, activeProjects.length),
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, font: { size: 11 } }
        },
        tooltip: {
          callbacks: {
            label: function(item) {
              return ` ${item.label}: ${item.raw}h`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

function renderDailyBarChart(dailyTrend) {
  const ctx = document.getElementById('dailyBarChart').getContext('2d');

  if (state.barChart) {
    state.barChart.destroy();
  }

  const labels = dailyTrend.map(d => formatDateVN(d.log_date));
  const data = dailyTrend.map(d => d.total_hours);

  state.barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Số giờ công (h)',
        data,
        backgroundColor: '#4f46e5',
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 8 }
        },
        x: {
          grid: { display: false }
        }
      },
      plugins: {
        legend: { display: false }
      }
    }
  });
}

function renderReportProjectsTable(projects, grandTotal, grandTotalOt = 0) {
  const tbody = document.getElementById('reportProjectsTableBody');
  
  if (projects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="py-6 text-center text-xs text-slate-400">Không có dữ liệu dự án trong tháng này</td></tr>`;
    return;
  }

  const statusMap = {
    'active': '<span class="px-2 py-0.5 rounded text-[11px] font-semibold badge-active">Đang thực hiện</span>',
    'paused': '<span class="px-2 py-0.5 rounded text-[11px] font-semibold badge-paused">Tạm dừng</span>',
    'completed': '<span class="px-2 py-0.5 rounded text-[11px] font-semibold badge-completed">Hoàn thành</span>'
  };

  let rowsHtml = projects.map((p, idx) => {
    const ot = p.total_ot_hours || 0;
    const regular = Math.max(0, p.total_hours - ot);
    return `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-3 text-center text-xs text-slate-400">${idx + 1}</td>
      <td class="py-3 px-3 text-xs font-bold text-blue-700">${p.project_code}</td>
      <td class="py-3 px-3 text-xs font-medium text-slate-900">${p.project_name}</td>
      <td class="py-3 px-3 text-center">${statusMap[p.project_status] || p.project_status}</td>
      <td class="py-3 px-3 text-right text-xs font-semibold text-slate-600">${regular.toFixed(1)}h</td>
      <td class="py-3 px-3 text-right text-xs font-bold text-amber-700">${ot > 0 ? `+${ot.toFixed(1)}h` : '-'}</td>
      <td class="py-3 px-3 text-right text-sm font-bold text-blue-600">${p.total_hours.toFixed(1)}h</td>
      <td class="py-3 px-3 text-right text-xs font-semibold text-slate-700">
        <div class="flex items-center justify-end space-x-1.5">
          <div class="w-16 bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${p.percentage}%"></div>
          </div>
          <span>${p.percentage}%</span>
        </div>
      </td>
      <td class="py-3 px-3 text-center text-xs text-slate-700">${p.user_count} người</td>
      <td class="py-3 px-3 text-center text-xs text-slate-500">${p.log_count} lượt</td>
    </tr>
  `}).join('');

  const regularGrandTotal = Math.max(0, grandTotal - grandTotalOt);

  // Dòng Tổng Cộng
  rowsHtml += `
    <tr class="bg-slate-100 font-bold border-t-2 border-slate-300">
      <td colspan="4" class="py-3 px-3 text-center text-xs uppercase tracking-wider text-slate-700">TỔNG CỘNG TOÀN CÔNG TY</td>
      <td class="py-3 px-3 text-right text-xs font-bold text-slate-700">${regularGrandTotal.toFixed(1)}h</td>
      <td class="py-3 px-3 text-right text-xs font-bold text-amber-700">${grandTotalOt > 0 ? `+${grandTotalOt.toFixed(1)}h` : '-'}</td>
      <td class="py-3 px-3 text-right text-base text-blue-700">${grandTotal.toFixed(1)}h</td>
      <td class="py-3 px-3 text-right text-xs text-slate-800">100.0%</td>
      <td colspan="2" class="py-3 px-3"></td>
    </tr>
  `;

  tbody.innerHTML = rowsHtml;
}

function renderReportUsersTable(users) {
  const tbody = document.getElementById('reportUsersTableBody');

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-xs text-slate-400">Không có dữ liệu nhân viên</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map((u, idx) => {
    const ot = u.total_ot_hours || 0;
    const regular = Math.max(0, u.total_hours - ot);
    return `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-3 px-3 text-center text-xs text-slate-400">${idx + 1}</td>
      <td class="py-3 px-3 text-xs font-bold text-slate-900">${u.full_name}</td>
      <td class="py-3 px-3 text-xs text-slate-500 font-mono">${u.username}</td>
      <td class="py-3 px-3 text-xs text-slate-600">${u.department || 'Chưa phân bổ'}</td>
      <td class="py-3 px-3 text-right text-xs font-semibold text-slate-600">${regular.toFixed(1)}h</td>
      <td class="py-3 px-3 text-right text-xs font-bold text-amber-700">${ot > 0 ? `+${ot.toFixed(1)}h` : '-'}</td>
      <td class="py-3 px-3 text-right text-sm font-bold text-indigo-600">${u.total_hours.toFixed(1)}h</td>
      <td class="py-3 px-3 text-center text-xs text-slate-700">${u.project_count} dự án</td>
      <td class="py-3 px-3 text-center text-xs text-slate-700">${u.active_days} ngày</td>
    </tr>
  `}).join('');
}

// --- TIỆN ÍCH TẢI FILE NHỊ PHÂN TRỰC TIẾP (BLOB DOWNLOAD) ---
async function downloadFileFromUrl(url, defaultFilename) {
  const res = await fetch(url);
  if (!res.ok) {
    let errMsg = 'Không thể tải file báo cáo';
    try {
      const errJson = await res.json();
      errMsg = errJson.error || errMsg;
    } catch (e) {}
    throw new Error(errMsg);
  }

  // Lấy tên file từ header Content-Disposition nếu có
  let filename = defaultFilename;
  const disposition = res.headers.get('content-disposition');
  if (disposition && disposition.indexOf('filename=') !== -1) {
    const matches = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
    if (matches != null && matches[1]) {
      filename = matches[1].replace(/['"]/g, '');
    }
  }

  const blob = await res.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    window.URL.revokeObjectURL(blobUrl);
    a.remove();
  }, 1500);
}

// Xuất file Excel nhanh theo tháng đang chọn
async function exportExcelReport() {
  const month = document.getElementById('reportMonthSelector').value;
  if (!month) {
    showToast('Vui lòng chọn tháng cần xuất báo cáo!', 'warning');
    return;
  }

  const btn = document.getElementById('exportExcelBtn');
  const btnText = document.getElementById('exportExcelBtnText');
  const originalText = btnText ? btnText.innerText : 'Xuất Excel';

  if (btn) btn.disabled = true;
  if (btnText) btnText.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang xuất Excel...';
  showToast(`Đang kết xuất dữ liệu và tạo file Excel cho tháng ${month}...`, 'info');

  try {
    await downloadFileFromUrl(`/api/reports/export-excel?month=${month}`, `Bao_Cao_Ma_Tran_Gio_Cong_${month}.xlsx`);
    showToast(`Đã xuất và tải file Báo cáo Ma trận Giờ công tháng ${month} thành công!`, 'success');
  } catch (err) {
    showToast('Lỗi khi xuất file Excel: ' + err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.innerText = originalText;
  }
}

// --- CÁC HÀM XỬ LÝ MODAL TÙY CHỌN XUẤT EXCEL NÂNG CAO ---
function openExcelExportModal() {
  const currentMonth = document.getElementById('reportMonthSelector').value || new Date().toISOString().slice(0, 7);
  document.getElementById('exportCustomMonth').value = currentMonth;

  // Điền ngày mặc định: từ đầu tháng đến hôm nay
  const now = new Date();
  const year = now.getFullYear();
  const monthStr = String(now.getMonth() + 1).padStart(2, '0');
  const todayStr = now.toISOString().split('T')[0];
  document.getElementById('exportFromDate').value = `${year}-${monthStr}-01`;
  document.getElementById('exportToDate').value = todayStr;

  // Nạp danh sách dự án vào dropdown filter
  const projFilter = document.getElementById('exportProjectFilter');
  projFilter.innerHTML = '<option value="">-- Tất cả các dự án (Mặc định) --</option>';
  if (state.projects && state.projects.length > 0) {
    state.projects.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = `[${p.code}] ${p.name}`;
      projFilter.appendChild(opt);
    });
  }

  // Nạp danh sách nhân viên vào dropdown filter
  const userFilter = document.getElementById('exportUserFilter');
  userFilter.innerHTML = '<option value="">-- Tất cả nhân viên (Mặc định) --</option>';
  fetch('/api/users')
    .then(r => r.json())
    .then(data => {
      if (data.users) {
        data.users.forEach(u => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = `${u.full_name} (${u.username})`;
          userFilter.appendChild(opt);
        });
      }
    })
    .catch(() => {});

  document.getElementById('excelExportModal').classList.remove('hidden');
}

function closeExcelExportModal() {
  document.getElementById('excelExportModal').classList.add('hidden');
}

function toggleExportTimeInputs() {
  const selectedType = document.querySelector('input[name="exportTimeType"]:checked').value;
  const monthWrapper = document.getElementById('exportMonthWrapper');
  const rangeWrapper = document.getElementById('exportRangeWrapper');

  if (selectedType === 'month') {
    monthWrapper.classList.remove('hidden');
    rangeWrapper.classList.add('hidden');
  } else {
    monthWrapper.classList.add('hidden');
    rangeWrapper.classList.remove('hidden');
  }
}

async function handleCustomExcelExport(e) {
  e.preventDefault();
  const timeType = document.querySelector('input[name="exportTimeType"]:checked').value;
  const projectId = document.getElementById('exportProjectFilter').value;
  const userId = document.getElementById('exportUserFilter').value;

  const params = new URLSearchParams();
  let exportFileName = 'Bao_Cao_Ma_Tran_Gio_Cong.xlsx';

  if (timeType === 'month') {
    const m = document.getElementById('exportCustomMonth').value;
    if (!m) {
      showToast('Vui lòng chọn tháng cần xuất!', 'warning');
      return;
    }
    params.append('month', m);
    exportFileName = `Bao_Cao_Ma_Tran_Gio_Cong_${m}.xlsx`;
  } else {
    const fromDate = document.getElementById('exportFromDate').value;
    const toDate = document.getElementById('exportToDate').value;
    if (!fromDate || !toDate) {
      showToast('Vui lòng chọn đầy đủ từ ngày và đến ngày!', 'warning');
      return;
    }
    if (fromDate > toDate) {
      showToast('Từ ngày không thể lớn hơn đến ngày!', 'warning');
      return;
    }
    params.append('from_date', fromDate);
    params.append('to_date', toDate);
    exportFileName = `Bao_Cao_Ma_Tran_Gio_Cong_${fromDate}_den_${toDate}.xlsx`;
  }

  if (projectId) params.append('project_id', projectId);
  if (userId) params.append('user_id', userId);

  const submitBtn = document.getElementById('customExportSubmitBtn');
  const submitText = document.getElementById('customExportSubmitBtnText');
  submitBtn.disabled = true;
  submitText.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Đang tải...';

  try {
    await downloadFileFromUrl(`/api/reports/export-excel?${params.toString()}`, exportFileName);
    showToast('Đã tải xuống file Báo cáo Ma trận Giờ công thành công!', 'success');
    closeExcelExportModal();
  } catch (err) {
    showToast('Lỗi khi xuất file Excel: ' + err.message, 'error');
  } finally {
    submitBtn.disabled = false;
    submitText.innerText = 'Tải File Excel (.xlsx)';
  }
}

// ------------------------------------------
// 6. TAB 3: QUẢN LÝ DỰ ÁN (ADMIN)
// ------------------------------------------
async function loadProjectsTable() {
  try {
    const res = await fetch('/api/projects');
    if (!res.ok) return;
    const data = await res.json();
    state.projects = data.projects;

    const tbody = document.getElementById('projectsTableBody');
    if (data.projects.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-xs text-slate-400">Chưa có dự án nào. Nhấn 'Thêm Dự Án Mới' để bắt đầu.</td></tr>`;
      return;
    }

    const statusBadge = {
      'active': '<span class="px-2.5 py-1 rounded-full text-xs font-semibold badge-active"><i class="fa-solid fa-play text-[10px] mr-1"></i>Đang thực hiện</span>',
      'paused': '<span class="px-2.5 py-1 rounded-full text-xs font-semibold badge-paused"><i class="fa-solid fa-pause text-[10px] mr-1"></i>Tạm dừng</span>',
      'completed': '<span class="px-2.5 py-1 rounded-full text-xs font-semibold badge-completed"><i class="fa-solid fa-check text-[10px] mr-1"></i>Hoàn thành</span>'
    };

    tbody.innerHTML = data.projects.map(p => `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3.5 px-3 text-xs font-bold text-blue-700">${p.code}</td>
        <td class="py-3.5 px-3 text-sm font-semibold text-slate-900">${p.name}</td>
        <td class="py-3.5 px-3 text-xs font-mono text-slate-600">${escapeHtml(p.contract_no || '--')}</td>
        <td class="py-3.5 px-3 text-xs text-slate-500 max-w-xs truncate" title="${escapeHtml(p.description || '')}">${escapeHtml(p.description || '--')}</td>
        <td class="py-3.5 px-3 text-center">${statusBadge[p.status] || p.status}</td>
        <td class="py-3.5 px-3 text-right text-xs font-bold text-slate-800">
          ${(p.total_hours || 0).toFixed(1)}h
          <div class="text-[10px] text-slate-400 font-normal">${p.total_members || 0} nhân sự</div>
        </td>
        <td class="py-3.5 px-3 text-center">
          <div class="flex items-center justify-center space-x-2">
            <button onclick="openEditProjectModal(${p.id})" title="Chỉnh sửa" class="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition">
              <i class="fa-solid fa-pen-to-square"></i>
            </button>
            <button onclick="deleteProject(${p.id}, '${escapeHtml(p.code)}')" title="Xóa" class="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error('Lỗi tải danh sách dự án:', err);
  }
}

function openCreateProjectModal() {
  document.getElementById('projectModalId').value = '';
  document.getElementById('projectCodeInput').value = '';
  document.getElementById('projectNameInput').value = '';
  document.getElementById('projectContractInput').value = '';
  document.getElementById('projectDescInput').value = '';
  document.getElementById('projectStatusSelect').value = 'active';

  document.getElementById('projectModalTitle').innerText = 'Thêm Dự Án Mới';
  document.getElementById('projectModal').classList.remove('hidden');
}

function openEditProjectModal(id) {
  const p = state.projects.find(x => x.id === id);
  if (!p) return;

  document.getElementById('projectModalId').value = p.id;
  document.getElementById('projectCodeInput').value = p.code;
  document.getElementById('projectNameInput').value = p.name;
  document.getElementById('projectContractInput').value = p.contract_no || '';
  document.getElementById('projectDescInput').value = p.description || '';
  document.getElementById('projectStatusSelect').value = p.status;

  document.getElementById('projectModalTitle').innerText = 'Chỉnh Sửa Dự Án: ' + p.code;
  document.getElementById('projectModal').classList.remove('hidden');
}

function closeProjectModal() {
  document.getElementById('projectModal').classList.add('hidden');
}

async function handleSaveProject(e) {
  e.preventDefault();
  const id = document.getElementById('projectModalId').value;
  const code = document.getElementById('projectCodeInput').value.trim();
  const name = document.getElementById('projectNameInput').value.trim();
  const contract_no = document.getElementById('projectContractInput').value.trim();
  const description = document.getElementById('projectDescInput').value.trim();
  const status = document.getElementById('projectStatusSelect').value;

  const payload = { code, name, contract_no, description, status };
  const url = id ? `/api/projects/${id}` : '/api/projects';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Lỗi lưu dự án', 'error');
      return;
    }

    showToast(data.message || 'Lưu dự án thành công!', 'success');
    closeProjectModal();
    loadProjectsTable();
    loadProjectsList();
  } catch (err) {
    showToast('Lỗi lưu dự án: ' + err.message, 'error');
  }
}

async function deleteProject(id, code) {
  if (!confirm(`Bạn có chắc chắn muốn xóa dự án '${code}'?`)) return;

  try {
    const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Không thể xóa dự án', 'error');
      return;
    }

    showToast(data.message || 'Đã xóa dự án!', 'success');
    loadProjectsTable();
    loadProjectsList();
  } catch (err) {
    showToast('Lỗi xóa dự án: ' + err.message, 'error');
  }
}

// ------------------------------------------
// 7. TAB 4: QUẢN LÝ NHÂN VIÊN (ADMIN)
// ------------------------------------------
let userListCache = [];

async function loadUsersTable() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) return;
    const data = await res.json();
    userListCache = data.users;

    const tbody = document.getElementById('usersTableBody');
    if (data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-xs text-slate-400">Chưa có người dùng nào</td></tr>`;
      return;
    }

    tbody.innerHTML = data.users.map(u => {
      const projects = u.projects || [];
      let projectsCellHtml = '';
      if (projects.length === 0) {
        projectsCellHtml = `<span class="text-xs text-slate-400 italic">Chưa thực hiện dự án nào</span>`;
      } else {
        const preview = projects.slice(0, 3);
        const tags = preview.map(p => `
          <div class="inline-flex items-center text-[11px] bg-slate-50 hover:bg-blue-50 border border-slate-200 rounded-lg px-2 py-0.5 mr-1 mb-1 transition shadow-xs" title="${escapeHtml(p.name)}">
            <span class="font-bold text-blue-700 mr-1">[${escapeHtml(p.code)}]</span>
            <span class="text-slate-700 truncate max-w-[130px] mr-1">${escapeHtml(p.name)}:</span>
            <span class="font-bold text-slate-900">${p.hours.toFixed(1)}h</span>
            ${p.ot_hours > 0 ? `<span class="text-[10px] text-amber-700 font-bold ml-1" title="Giờ làm thêm OT: ${p.ot_hours.toFixed(1)}h">(+${p.ot_hours.toFixed(1)} OT)</span>` : ''}
          </div>
        `).join('');

        const detailBtn = `
          <button type="button" onclick="openUserProjectsModal(${u.id})" 
            class="inline-flex items-center text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg px-2 py-0.5 transition mb-1">
            <i class="fa-solid fa-folder-tree mr-1 text-[10px]"></i>
            ${projects.length > 3 ? `+${projects.length - 3} DA khác` : 'Chi tiết'}
          </button>
        `;
        projectsCellHtml = `<div class="flex flex-wrap items-center">${tags}${detailBtn}</div>`;
      }

      return `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-3.5 px-3">
          <div class="text-sm font-bold text-slate-900">${u.full_name}</div>
        </td>
        <td class="py-3.5 px-3 text-xs font-mono text-slate-600">${u.username}</td>
        <td class="py-3.5 px-3 text-xs text-slate-600">${u.department || '--'}</td>
        <td class="py-3.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}">
            ${u.role === 'admin' ? 'Admin' : 'Nhân viên'}
          </span>
        </td>
        <td class="py-3.5 px-3 text-center">
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold ${u.is_active ? 'badge-active' : 'bg-rose-50 text-rose-600 border border-rose-200'}">
            ${u.is_active ? 'Hoạt động' : 'Đã khóa'}
          </span>
        </td>
        <td class="py-3.5 px-3 min-w-[280px]">
          ${projectsCellHtml}
        </td>
        <td class="py-3.5 px-3 text-right text-xs font-bold text-slate-800">
          ${(u.total_logged_hours || 0).toFixed(1)}h
        </td>
        <td class="py-3.5 px-3 text-center">
          <div class="flex items-center justify-center space-x-1.5">
            <button onclick="openUserProjectsModal(${u.id})" title="Xem tất cả dự án & giờ công" class="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition">
              <i class="fa-solid fa-list-check"></i>
            </button>
            <button onclick="openEditUserModal(${u.id})" title="Sửa thông tin" class="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition">
              <i class="fa-solid fa-user-pen"></i>
            </button>
            <button onclick="openResetPasswordModal(${u.id}, '${escapeHtml(u.username)}')" title="Đặt lại mật khẩu" class="p-1.5 text-slate-500 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition">
              <i class="fa-solid fa-key"></i>
            </button>
            <button onclick="deleteUser(${u.id}, '${escapeHtml(u.username)}')" title="Xóa hoặc Khóa tài khoản" class="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi tải người dùng:', err);
  }
}

// Mở modal danh sách chi tiết các dự án của nhân viên
function openUserProjectsModal(userId) {
  const u = userListCache.find(x => x.id === userId);
  if (!u) return;

  document.getElementById('userProjectsModalTitle').innerText = `Nhân Viên: ${u.full_name} (${u.username})`;
  const projects = u.projects || [];
  const totalHours = (u.total_logged_hours || 0).toFixed(1);
  const totalOt = projects.reduce((s, p) => s + (p.ot_hours || 0), 0).toFixed(1);
  document.getElementById('userProjectsModalSub').innerText = `Phòng ban: ${u.department || '--'} | Dự án đã tham gia: ${projects.length} | Tổng giờ công tích lũy: ${totalHours}h (OT: ${totalOt}h)`;

  const tbody = document.getElementById('userProjectsModalTableBody');
  if (projects.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-6 text-center text-xs text-slate-400">Nhân viên này chưa có bản ghi nhật ký nào.</td></tr>`;
  } else {
    tbody.innerHTML = projects.map((p, idx) => `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-3 text-center text-xs text-slate-500 font-medium">${idx + 1}</td>
        <td class="py-2.5 px-3 text-xs font-bold text-blue-700">[${escapeHtml(p.code)}]</td>
        <td class="py-2.5 px-3 text-xs text-slate-600 font-mono">${escapeHtml(p.contract_no || '--')}</td>
        <td class="py-2.5 px-3 text-xs font-semibold text-slate-900">${escapeHtml(p.name)}</td>
        <td class="py-2.5 px-3 text-right text-xs text-slate-700">${(p.regular_hours || 0).toFixed(1)}h</td>
        <td class="py-2.5 px-3 text-right text-xs font-bold text-amber-700">${p.ot_hours > 0 ? `+${p.ot_hours.toFixed(1)}h` : '0.0h'}</td>
        <td class="py-2.5 px-3 text-right text-xs font-extrabold text-blue-700">${p.hours.toFixed(1)}h</td>
        <td class="py-2.5 px-3 text-center text-xs text-slate-600">${p.log_count} lượt</td>
      </tr>
    `).join('');
  }

  document.getElementById('userProjectsModal').classList.remove('hidden');
}

function closeUserProjectsModal() {
  document.getElementById('userProjectsModal').classList.add('hidden');
}

function openCreateUserModal() {
  document.getElementById('userModalId').value = '';
  document.getElementById('userUsernameInput').value = '';
  document.getElementById('userUsernameInput').disabled = false;
  document.getElementById('userPasswordInput').value = '';
  document.getElementById('userPasswordWrapper').classList.remove('hidden');
  document.getElementById('userFullNameInput').value = '';
  document.getElementById('userDeptInput').value = '';
  document.getElementById('userRoleSelect').value = 'employee';
  document.getElementById('userActiveSelect').value = '1';
  document.getElementById('userActiveStatusWrapper').classList.add('hidden');

  document.getElementById('userModalTitle').innerText = 'Thêm Tài Khoản Mới';
  document.getElementById('userModal').classList.remove('hidden');
}

function openEditUserModal(id) {
  const u = userListCache.find(x => x.id === id);
  if (!u) return;

  document.getElementById('userModalId').value = u.id;
  document.getElementById('userUsernameInput').value = u.username;
  document.getElementById('userUsernameInput').disabled = true; // Không sửa username
  document.getElementById('userPasswordWrapper').classList.add('hidden'); // Đổi mk qua modal riêng
  document.getElementById('userFullNameInput').value = u.full_name;
  document.getElementById('userDeptInput').value = u.department || '';
  document.getElementById('userRoleSelect').value = u.role;
  document.getElementById('userActiveSelect').value = u.is_active ? '1' : '0';
  document.getElementById('userActiveStatusWrapper').classList.remove('hidden');

  document.getElementById('userModalTitle').innerText = 'Chỉnh Sửa Tài Khoản: ' + u.username;
  document.getElementById('userModal').classList.remove('hidden');
}

function closeUserModal() {
  document.getElementById('userModal').classList.add('hidden');
}

async function handleSaveUser(e) {
  e.preventDefault();
  const id = document.getElementById('userModalId').value;
  const username = document.getElementById('userUsernameInput').value.trim();
  const password = document.getElementById('userPasswordInput').value;
  const full_name = document.getElementById('userFullNameInput').value.trim();
  const department = document.getElementById('userDeptInput').value.trim();
  const role = document.getElementById('userRoleSelect').value;
  const is_active = document.getElementById('userActiveSelect').value === '1';

  let payload, url, method;

  if (id) {
    url = `/api/users/${id}`;
    method = 'PUT';
    payload = { full_name, department, role, is_active };
  } else {
    url = '/api/users';
    method = 'POST';
    if (!password || password.length < 6) {
      showToast('Mật khẩu ban đầu phải có ít nhất 6 ký tự!', 'warning');
      return;
    }
    payload = { username, password, full_name, department, role };
  }

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Lỗi lưu tài khoản', 'error');
      return;
    }

    showToast(data.message || 'Lưu tài khoản thành công!', 'success');
    closeUserModal();
    loadUsersTable();
  } catch (err) {
    showToast('Lỗi lưu tài khoản: ' + err.message, 'error');
  }
}

function openResetPasswordModal(id, username) {
  document.getElementById('resetUserId').value = id;
  document.getElementById('resetTargetUsername').innerText = username;
  document.getElementById('resetNewPasswordInput').value = '';
  document.getElementById('resetPasswordModal').classList.remove('hidden');
}

function closeResetPasswordModal() {
  document.getElementById('resetPasswordModal').classList.add('hidden');
}

async function handleResetPassword(e) {
  e.preventDefault();
  const id = document.getElementById('resetUserId').value;
  const new_password = document.getElementById('resetNewPasswordInput').value;

  try {
    const res = await fetch(`/api/users/${id}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Không thể đặt lại mật khẩu', 'error');
      return;
    }

    showToast(data.message || 'Đã đặt lại mật khẩu thành công!', 'success');
    closeResetPasswordModal();
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
}

async function deleteUser(id, username) {
  if (!confirm(`Bạn có chắc chắn muốn xóa hoặc khóa tài khoản '${username}'?`)) return;

  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Không thể xóa', 'error');
      return;
    }

    showToast(data.message || 'Thao tác thành công', 'success');
    loadUsersTable();
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
}

// ------------------------------------------
// 8. ĐỔI MẬT KHẨU CÁ NHÂN
// ------------------------------------------
function openChangePasswordModal() {
  document.getElementById('currentPasswordInput').value = '';
  document.getElementById('newPasswordInput').value = '';
  document.getElementById('changePasswordModal').classList.remove('hidden');
}

function closeChangePasswordModal() {
  document.getElementById('changePasswordModal').classList.add('hidden');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const current_password = document.getElementById('currentPasswordInput').value;
  const new_password = document.getElementById('newPasswordInput').value;

  try {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password, new_password })
    });
    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Đổi mật khẩu thất bại', 'error');
      return;
    }

    showToast(data.message || 'Đổi mật khẩu thành công!', 'success');
    closeChangePasswordModal();
  } catch (err) {
    showToast('Lỗi: ' + err.message, 'error');
  }
}

// ------------------------------------------
// TIỆN ÍCH ESCAPE HTML
// ------------------------------------------
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
