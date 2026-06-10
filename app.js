/**
 * 考研打卡网站 · 主逻辑
 * ✅ 已接入 Node.js 后端 API
 * ⚡ 保留 localStorage 作为离线/降级方案
 */

/* =====================================================
   API 配置
   ===================================================== */
const API_BASE = '/api'; // 自动适配开发和生产环境

/**
 * 封装 fetch 请求
 * @param {string} path    API 路径（如 '/checkin/today'）
 * @param {object} options fetch options
 * @returns {Promise<any>} 解析后的 JSON
 */
async function apiRequest(path, options = {}) {
  const token = localStorage.getItem('kaoyan_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
    return data;
  } catch (err) {
    console.warn(`[API] ${path} 失败:`, err.message);
    throw err;
  }
}

/* =====================================================
   登录模块
   ===================================================== */
const AUTH_KEY   = 'kaoyan_user';
const TOKEN_KEY  = 'kaoyan_token';

// 微信头像种子池 / 用户名池
const WX_AVATARS = ['Felix','Zoe','Max','Lily','Jake','Sara','Bob','Mia','Tom','Amy'];
const WX_NAMES   = ['追梦er','努力上岸','考研加油','知识改变命运','清北我来了','上岸必胜','每日打卡','坚持到底'];

function getUser()        { const r = localStorage.getItem(AUTH_KEY);  return r ? JSON.parse(r) : null; }
function saveUser(user)   { localStorage.setItem(AUTH_KEY, JSON.stringify(user)); }
function clearUser()      { localStorage.removeItem(AUTH_KEY); localStorage.removeItem(TOKEN_KEY); }
function saveToken(token) { localStorage.setItem(TOKEN_KEY, token); }

function initLoginPage() {
  const overlay = document.getElementById('login-overlay');
  const user    = getUser();

  if (user && localStorage.getItem(TOKEN_KEY)) {
    overlay.style.display = 'none';
    applyUserToUI(user);
    // 静默同步服务器数据
    syncServerData().catch(() => {});
    return;
  }

  generateQRCode();
  startQRCountdown();

  // ---- Tab 切换 ----
  document.querySelectorAll('.login-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const mode = tab.dataset.mode;
      document.querySelectorAll('.login-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(`panel-${mode}`).classList.add('active');
    });
  });

  // ---- 微信扫码演示登录 ----
  document.getElementById('btn-demo-wechat').addEventListener('click', () => {
    const scanned = document.getElementById('qr-scanned');
    scanned.style.display = 'flex';
    const demoBtn = document.getElementById('btn-demo-wechat');
    demoBtn.disabled = true;
    demoBtn.textContent = '⏳ 等待手机确认...';

    setTimeout(async () => {
      const seed = WX_AVATARS[Math.floor(Math.random() * WX_AVATARS.length)];
      const name = WX_NAMES[Math.floor(Math.random() * WX_NAMES.length)];
      const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
      try {
        // 调用后端微信登录接口
        const data = await apiRequest('/auth/login/wechat', {
          method: 'POST',
          body: JSON.stringify({ name, avatar }),
        });
        saveToken(data.token);
        doLogin({ name: data.user.name, avatar: data.user.avatar, type: 'wechat', id: data.user.id });
      } catch {
        // 降级：纯本地登录
        doLogin({ name, avatar, type: 'wechat' });
      }
    }, 1500);
  });

  // ---- 手机号登录 ----
  let codeCountdown = 0;

  document.getElementById('btn-send-code').addEventListener('click', async () => {
    const phone = document.getElementById('phone-number').value.trim();
    if (!/^1[3-9]\d{9}$/.test(phone)) { showToastLocal('⚠️ 请输入正确的手机号'); return; }
    const btn = document.getElementById('btn-send-code');
    btn.disabled = true;

    try {
      await apiRequest('/auth/send-code', { method: 'POST', body: JSON.stringify({ phone }) });
      document.getElementById('phone-code').value = '666666';
      showToastLocal('验证码已发送（演示：666666）');
    } catch {
      document.getElementById('phone-code').value = '666666';
      showToastLocal('验证码已发送（演示：666666）');
    }

    codeCountdown = 60;
    const timer = setInterval(() => {
      codeCountdown--;
      btn.textContent = `重新发送(${codeCountdown}s)`;
      if (codeCountdown <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = '获取验证码';
      }
    }, 1000);
  });

  document.getElementById('btn-phone-login').addEventListener('click', async () => {
    const phone   = document.getElementById('phone-number').value.trim();
    const code    = document.getElementById('phone-code').value.trim();
    const agreed  = document.getElementById('agree-checkbox').checked;
    if (!agreed)  { showToastLocal('⚠️ 请先同意用户协议'); return; }
    if (!/^1[3-9]\d{9}$/.test(phone)) { showToastLocal('⚠️ 请输入正确的手机号'); return; }
    if (code.length !== 6) { showToastLocal('⚠️ 请输入6位验证码'); return; }

    try {
      const data = await apiRequest('/auth/login/phone', {
        method: 'POST',
        body: JSON.stringify({ phone, code }),
      });
      saveToken(data.token);
      doLogin({ name: data.user.name, avatar: data.user.avatar, type: 'phone', phone, id: data.user.id });
    } catch (err) {
      showToastLocal(`⚠️ ${err.message || '登录失败'}`);
    }
  });

  // ---- 游客登录 ----
  document.getElementById('btn-guest-login').addEventListener('click', async () => {
    try {
      const data = await apiRequest('/auth/login/guest', { method: 'POST', body: '{}' });
      saveToken(data.token);
      doLogin({ name: '游客同学', avatar: data.user.avatar, type: 'guest', id: data.user.id });
    } catch {
      doLogin({ name: '游客同学', avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=guest', type: 'guest' });
    }
  });

  // ---- 二维码刷新 ----
  document.getElementById('qr-refresh-btn').addEventListener('click', () => {
    document.getElementById('qr-expired').style.display = 'none';
    generateQRCode();
    startQRCountdown();
  });
}

// 生成二维码
function generateQRCode() {
  const canvas = document.getElementById('qr-canvas');
  const token  = 'kaoyan_login_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  if (typeof QRCode !== 'undefined') {
    QRCode.toCanvas(canvas, token, {
      width: 166, margin: 1,
      color: { dark: '#1a1d2e', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    }, err => { if (err) console.warn('QR gen error', err); });
  } else {
    canvas.width = 166; canvas.height = 166;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f3f4f6'; ctx.fillRect(0, 0, 166, 166);
    ctx.fillStyle = '#9ca3af'; ctx.font = '13px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('二维码加载中...', 83, 83);
  }
}

let qrTimer = null;
function startQRCountdown() {
  clearInterval(qrTimer);
  let sec = 60;
  const valEl     = document.getElementById('qr-countdown-val');
  const expiredEl = document.getElementById('qr-expired');
  expiredEl.style.display = 'none';
  if (valEl) valEl.textContent = sec;
  qrTimer = setInterval(() => {
    sec--;
    if (valEl) valEl.textContent = sec;
    if (sec <= 0) { clearInterval(qrTimer); expiredEl.style.display = 'flex'; }
  }, 1000);
}

function doLogin(user) {
  clearInterval(qrTimer);
  saveUser(user);
  applyUserToUI(user);
  const overlay = document.getElementById('login-overlay');
  overlay.classList.add('fade-out');
  setTimeout(() => {
    overlay.style.display = 'none';
    overlay.classList.remove('fade-out');
    showToast(`🎉 欢迎回来，${user.name}！`);
    // 登录后同步服务器数据
    syncServerData().catch(() => {});
  }, 400);
}

function applyUserToUI(user) {
  if (!user) return;
  document.getElementById('header-username').textContent = user.name;
  document.getElementById('header-avatar').src           = user.avatar;
  document.getElementById('dropdown-name').textContent   = user.name;
  document.getElementById('dropdown-avatar').src         = user.avatar;
  const tagEl = document.getElementById('dropdown-tag');
  const typeMap = { wechat: '微信登录', phone: '手机号登录', guest: '游客' };
  tagEl.textContent  = typeMap[user.type] || '已登录';
  tagEl.style.background = user.type === 'wechat' ? '#e8f8ef' : user.type === 'phone' ? '#eef0ff' : '#f3f4f6';
  tagEl.style.color      = user.type === 'wechat' ? '#07c160' : user.type === 'phone' ? '#4f6ef7' : '#6b7280';
  if (user.name && user.name !== '游客同学') {
    appData.settings.name = user.name;
    saveData(appData);
  }
}

function initLogout() {
  const dropBtn = document.getElementById('user-dropdown-btn');
  const menu    = document.getElementById('user-dropdown-menu');
  dropBtn.addEventListener('click', e => { e.stopPropagation(); menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; });
  document.addEventListener('click', () => { menu.style.display = 'none'; });

  document.getElementById('btn-logout').addEventListener('click', () => {
    menu.style.display = 'none';
    clearUser();
    document.getElementById('qr-scanned').style.display = 'none';
    document.getElementById('qr-expired').style.display = 'none';
    const demoBtn = document.getElementById('btn-demo-wechat');
    demoBtn.disabled = false;
    demoBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="white" style="flex-shrink:0"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-7.063-6.122zm-3.494 3.033c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982zm4.985 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg> 模拟微信扫码登录`;
    generateQRCode();
    startQRCountdown();
    document.getElementById('login-overlay').style.display = 'flex';
    showToast('已退出登录');
  });
}

// ---- 资料编辑弹窗 ----
const AVATAR_SEEDS  = ['Felix','Zoe','Max','Lily','Jake','Sara','Bob','Mia','Tom','Amy','Leo','Eva','Sam','Nina','Kai','Roxy','Ivy','Gus','Amy2','Max2','Coco','Finn','Luna','Otis','Ruby','Milo','Zara','Theo','Wren','Noah'];
const AVATAR_STYLES = ['adventurer', 'thumbs'];
let tempProfileAvatar = '';

function initProfileModal() {
  const overlay    = document.getElementById('profile-modal-overlay');
  const closeBtn   = document.getElementById('profile-modal-close');
  const saveBtn    = document.getElementById('btn-save-profile');
  const nicknameInput = document.getElementById('profile-nickname');

  closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

  document.getElementById('btn-edit-profile').addEventListener('click', () => {
    document.getElementById('user-dropdown-menu').style.display = 'none';
    const user = getUser();
    if (!user) return;
    nicknameInput.value = user.name || '';
    tempProfileAvatar   = user.avatar;
    document.getElementById('profile-avatar-preview-img').src = user.avatar;
    renderAvatarGrid(user.avatar);
    overlay.style.display = 'flex';
    setTimeout(() => document.querySelector('.profile-avatar-preview')?.scrollIntoView?.({ behavior: 'smooth', block: 'center' }), 100);
  });

  saveBtn.addEventListener('click', async () => {
    const newName = nicknameInput.value.trim();
    if (!newName) { showToast('⚠️ 昵称不能为空'); return; }
    const user = getUser();
    if (!user) return;
    user.name   = newName;
    user.avatar = tempProfileAvatar || user.avatar;
    saveUser(user);
    applyUserToUI(user);

    // 同步到后端
    try {
      await apiRequest('/user/profile', {
        method: 'PUT',
        body: JSON.stringify({ name: newName, avatar: user.avatar }),
      });
    } catch {}

    overlay.style.display = 'none';
    showToast('资料已更新');
  });
}

function renderAvatarGrid(currentAvatar) {
  const grid = document.getElementById('avatar-grid');
  let html = '';
  AVATAR_SEEDS.forEach(seed => {
    const style    = AVATAR_STYLES[Math.floor(Math.random() * AVATAR_STYLES.length)];
    const url      = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
    const selected = url === currentAvatar ? ' selected' : '';
    html += `<div class="avatar-option${selected}" data-url="${url}" onclick="selectProfileAvatar(this, '${url}')">
      <img src="${url}" alt="avatar" />
    </div>`;
  });
  grid.innerHTML = html;
}

window.selectProfileAvatar = function(el, url) {
  document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  tempProfileAvatar = url;
  const preview = document.getElementById('profile-avatar-preview-img');
  preview.src = url;
  preview.classList.add('avatar-switch');
  setTimeout(() => preview.classList.remove('avatar-switch'), 300);
};

function showToastLocal(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

/* =====================================================
   服务器数据同步（登录后调用）
   ===================================================== */
async function syncServerData() {
  try {
    // 同步今日打卡
    const checkinData = await apiRequest('/checkin/today');
    if (checkinData.success) {
      const today = todayStr();
      appData.checkins[today] = checkinData.checkins;
      appData.streak          = checkinData.streak;
      appData.longestStreak   = checkinData.longestStreak;
      appData.totalDays       = checkinData.totalDays;
    }

    // 同步任务
    const taskData = await apiRequest('/task');
    if (taskData.success) {
      appData.tasks = taskData.tasks;
    }

    // 同步历史打卡（仅部分同步，减少请求量）
    const historyData = await apiRequest('/checkin/history');
    if (historyData.success) {
      // 合并历史打卡记录，以服务器为准
      Object.assign(appData.checkins, historyData.checkins);
    }

    saveData(appData);
    renderCheckinGrid();
    renderCalendar();
    updateCheckinSummary();
    if (document.getElementById('page-plan').classList.contains('active')) renderPlanPage();
  } catch (err) {
    console.warn('[syncServerData] 同步失败，使用本地数据:', err.message);
  }
}

/* =====================================================
   数据 & 工具
   ===================================================== */
const STORAGE_KEY = 'kaoyan_data';

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) return JSON.parse(raw);
  return {
    settings: { examDate: '2026-12-26', name: '同学', school: '', dailyGoal: 8 },
    checkins: {},
    tasks: [],
    studyLogs: [],
    streak: 0,
    longestStreak: 0,
    totalDays: 0,
  };
}

function saveData(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

let appData = loadData();

function todayStr() { return new Date().toLocaleDateString('sv-SE'); }
function fmtDate(d) { return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' }); }

const SUBJECTS = [
  { id: 'politics', name: '政治',  color: '#f43f5e', colorClass: 'bg-politics', tagClass: 'tag-politics', goal: '1天2小时 · 真题刷题', target: 120 },
  { id: 'english',  name: '英语',  color: '#06b6d4', colorClass: 'bg-english',  tagClass: 'tag-english',  goal: '每日单词100个 + 长难句', target: 90 },
  { id: 'math',     name: '数学',  color: '#8b5cf6', colorClass: 'bg-math',     tagClass: 'tag-math',     goal: '每日30题综合练习', target: 150 },
  { id: 'major',    name: '专业课', color: '#f59e0b', colorClass: 'bg-major',   tagClass: 'tag-major',    goal: '专业课核心知识点梳理', target: 120 },
];

const MOTTOS = [
  ['择一事终一生，不为繁华易匠心。','今日寄语'],
  ['不积跬步，无以至千里；不积小流，无以成江海。','荀子'],
  ['成功不是将来才有的，而是从决定去做的那一刻起，持续积累而成。','今日寄语'],
  ['每天进步一点点，日积月累成大山。','今日寄语'],
  ['你现在的努力，是在为未来的自己铺路。','今日寄语'],
  ['吃得苦中苦，方为人上人。','励志名言'],
  ['现在不拼，更待何时？','今日寄语'],
  ['坚持不一定成功，但放弃一定失败。','今日寄语'],
  ['优秀是一种习惯，坚持就是胜利。','今日寄语'],
  ['与其羡慕别人，不如努力追赶。','今日寄语'],
  ['三更灯火五更鸡，正是男儿读书时。','颜真卿'],
  ['莫等闲，白了少年头，空悲切。','岳飞'],
];

const BADGES = [
  { id: 'first_day',  icon: '🌱', name: '初出茅庐', desc: '完成第一次打卡',    condition: d => d.totalDays >= 1 },
  { id: 'week7',      icon: '🔥', name: '七日坚持', desc: '连续打卡7天',      condition: d => d.longestStreak >= 7 },
  { id: 'week30',     icon: '💪', name: '一月达人', desc: '连续打卡30天',     condition: d => d.longestStreak >= 30 },
  { id: 'full_day',   icon: '⭐', name: '完美一天', desc: '单日全科完成',     condition: d => hasFullDayCheckin(d) },
  { id: 'week100',    icon: '👑', name: '百日誓师', desc: '累计打卡100天',    condition: d => d.totalDays >= 100 },
  { id: 'early_bird', icon: '🌅', name: '早起鸟儿', desc: '完成10个任务',     condition: d => (d.tasks||[]).filter(t => t.done).length >= 10 },
  { id: 'study_hard', icon: '🎓', name: '学霸附体', desc: '累计学习50小时',   condition: d => getTotalStudyHours(d) >= 50 },
  { id: 'never_give', icon: '🏆', name: '永不言弃', desc: '累计打卡200天',    condition: d => d.totalDays >= 200 },
];

function hasFullDayCheckin(d) {
  const tc = d.checkins[todayStr()] || {};
  return SUBJECTS.every(s => tc[s.id]);
}
function getTotalStudyHours(d) {
  return ((d.studyLogs || []).reduce((s, l) => s + (l.minutes || 0), 0) / 60);
}

/* =====================================================
   倒计时
   ===================================================== */
function startCountdown() {
  function update() {
    const examDate = new Date(appData.settings.examDate + 'T09:00:00');
    const now      = new Date();
    const diff     = examDate - now;
    if (diff <= 0) {
      ['days','hours','minutes','seconds'].forEach(id => document.getElementById(id).textContent = id === 'days' ? '0' : '00');
      return;
    }
    document.getElementById('days').textContent    = Math.floor(diff / 86400000);
    document.getElementById('hours').textContent   = String(Math.floor((diff % 86400000) / 3600000)).padStart(2, '0');
    document.getElementById('minutes').textContent = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
    document.getElementById('seconds').textContent = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
  }
  update();
  setInterval(update, 1000);
}

/* =====================================================
   今日打卡渲染
   ===================================================== */
function renderCheckinGrid() {
  const today = todayStr();
  const tc    = appData.checkins[today] || {};
  const grid  = document.getElementById('checkin-grid');
  grid.innerHTML = SUBJECTS.map(s => {
    const done = !!tc[s.id];
    const pct  = done ? 100 : Math.floor(Math.random() * 40 + 10);
    return `
      <div class="checkin-card${done ? ' done' : ''}" data-sid="${s.id}">
        <div class="card-subject"><span class="card-subject-dot" style="background:${s.color}"></span>${s.name}</div>
        <div class="card-title">${s.icon || ''} ${s.name}打卡</div>
        <div class="card-goal">${s.goal}</div>
        <div class="card-progress-wrap">
          <div class="card-progress-track">
            <div class="card-progress-fill ${s.colorClass}" style="width:${done ? 100 : pct}%"></div>
          </div>
          <div class="card-progress-label">
            <span>${done ? '已完成' : '进行中'}</span>
            <span>${done ? s.target : Math.floor(s.target * (pct / 100))}/${s.target} 分钟</span>
          </div>
        </div>
        <button class="card-btn">${done ? '✓ 已打卡' : '▶ 开始打卡'}</button>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.checkin-card').forEach(card => {
    card.addEventListener('click', () => toggleCheckin(card.dataset.sid));
  });
  updateCheckinSummary();
}

async function toggleCheckin(sid) {
  const today = todayStr();
  if (!appData.checkins[today]) appData.checkins[today] = {};
  const wasAllDone = SUBJECTS.every(s => appData.checkins[today][s.id]);

  // 乐观更新本地
  appData.checkins[today][sid] = !appData.checkins[today][sid];
  const subject = SUBJECTS.find(s => s.id === sid);

  if (appData.checkins[today][sid]) {
    appData.studyLogs.push({ date: today, subject: subject.name, minutes: subject.target });
    showToast(`${subject.name} 打卡成功！`);
  }

  updateStreakAndStats();
  saveData(appData);
  renderCheckinGrid();
  renderCalendar();

  const allDone = SUBJECTS.every(s => appData.checkins[today][s.id]);
  if (allDone && !wasAllDone) {
    setTimeout(() => launchFireworks(), 200);
    setTimeout(() => showToast('🎉 恭喜！今日全科打卡完成！'), 300);
  }

  // 同步到服务器
  try {
    const data = await apiRequest('/checkin/toggle', {
      method: 'POST',
      body: JSON.stringify({ subjectId: sid }),
    });
    if (data.success && data.stats) {
      appData.streak        = data.stats.streak;
      appData.longestStreak = data.stats.longestStreak;
      appData.totalDays     = data.stats.totalDays;
      saveData(appData);
      updateCheckinSummary();
    }
  } catch (err) {
    console.warn('[toggleCheckin] 服务器同步失败，保持本地数据:', err.message);
  }
}

function updateCheckinSummary() {
  const tc   = appData.checkins[todayStr()] || {};
  const done = SUBJECTS.filter(s => tc[s.id]).length;
  document.getElementById('done-count').textContent   = done;
  document.getElementById('total-count').textContent  = SUBJECTS.length;
  document.getElementById('streak-count').textContent = appData.streak;
}

function updateStreakAndStats() {
  const today = todayStr();
  const tc    = appData.checkins[today] || {};
  if (SUBJECTS.some(s => tc[s.id])) {
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('sv-SE');
    const yChecked  = appData.checkins[yesterday] && SUBJECTS.some(s => appData.checkins[yesterday][s.id]);
    if (yChecked) {
      appData.streak = (appData.checkins[today]._streakCounted ? appData.streak : appData.streak + 1);
    } else if (!appData.checkins[today]._streakCounted) {
      appData.streak = 1;
    }
    appData.checkins[today]._streakCounted = true;
    appData.longestStreak = Math.max(appData.longestStreak, appData.streak);
  }
  appData.totalDays = Object.keys(appData.checkins).filter(date => {
    const tc = appData.checkins[date];
    return SUBJECTS.some(s => tc[s.id]);
  }).length;
}

/* =====================================================
   日历热力图
   ===================================================== */
let calYear, calMonth;
function initCalendar() {
  const now = new Date();
  calYear   = now.getFullYear();
  calMonth  = now.getMonth();
  renderCalendar();
  document.getElementById('cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
  document.getElementById('cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });
}

function renderCalendar() {
  const monthNames = ['一月','二月','三月','四月','五月','六月','七月','八月','九月','十月','十一月','十二月'];
  document.getElementById('cal-month-label').textContent = `${calYear}年 ${monthNames[calMonth]}`;

  const firstDay    = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today       = todayStr();

  let html = '';
  for (let i = 0; i < firstDay; i++) html += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const ds        = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const tc        = appData.checkins[ds] || {};
    const doneCount = SUBJECTS.filter(s => tc[s.id]).length;
    const heatClass = ['heat-0','heat-1','heat-2','heat-3','heat-4'][doneCount] || 'heat-4';
    html += `<div class="cal-day ${heatClass}${ds === today ? ' today' : ''}" title="${ds} 完成${doneCount}科">${d}</div>`;
  }
  document.getElementById('calendar-days').innerHTML = html;

  // 从服务器获取该月数据（异步更新）
  if (localStorage.getItem(TOKEN_KEY)) {
    apiRequest(`/checkin/calendar?year=${calYear}&month=${calMonth + 1}`).then(data => {
      if (data.success) {
        Object.entries(data.data).forEach(([date, count]) => {
          if (!appData.checkins[date]) appData.checkins[date] = {};
          // 只补充服务器有但本地无的日期
          if (count > 0 && !Object.keys(appData.checkins[date]).some(k => k !== '_streakCounted' && appData.checkins[date][k])) {
            SUBJECTS.slice(0, count).forEach(s => { appData.checkins[date][s.id] = true; });
          }
        });
        renderCalendar();
      }
    }).catch(() => {});
  }
}

/* =====================================================
   名言轮换
   ===================================================== */
let mottoIdx = Math.floor(Math.random() * MOTTOS.length);
function renderMotto() {
  const [quote, author] = MOTTOS[mottoIdx];
  document.getElementById('motivation-quote').textContent = quote;
  document.getElementById('motivation-author').textContent = `—— ${author}`;
}
function nextMotto() { mottoIdx = (mottoIdx + 1) % MOTTOS.length; renderMotto(); }

/* =====================================================
   学习计划页
   ===================================================== */
function renderPlanPage() { renderTasks(); renderSubjectProgress(); }

async function renderTasks() {
  // 优先从服务器获取
  try {
    const data = await apiRequest('/task');
    if (data.success) {
      appData.tasks = data.tasks;
      saveData(appData);
    }
  } catch {}

  const doing = appData.tasks.filter(t => !t.done);
  const done  = appData.tasks.filter(t => t.done);
  const subjectTagMap = { '政治':'tag-politics','英语':'tag-english','数学':'tag-math','专业课':'tag-major','其他':'tag-other' };

  function taskHtml(t) {
    const tag = subjectTagMap[t.subject] || 'tag-other';
    return `
      <div class="task-item${t.done ? ' done-task' : ''}" data-tid="${t.id}">
        <div class="task-checkbox${t.done ? ' checked' : ''}" data-tid="${t.id}">${t.done ? '✓' : ''}</div>
        <div class="task-info">
          <div class="task-name">${t.name}</div>
          <div class="task-meta">${t.date} · 预计 ${t.duration} 分钟</div>
        </div>
        <span class="task-subject-tag ${tag}">${t.subject}</span>
        <button class="task-delete" data-tid="${t.id}">✕</button>
      </div>
    `;
  }

  const doingEl = document.getElementById('task-list-doing');
  const doneEl  = document.getElementById('task-list-done');
  doingEl.innerHTML = doing.length ? doing.map(taskHtml).join('') : '<div class="empty-tip">暂无进行中的任务，点击"添加任务"开始吧</div>';
  doneEl.innerHTML  = done.length  ? done.map(taskHtml).join('')  : '<div class="empty-tip">还没有完成的任务</div>';

  document.querySelectorAll('.task-checkbox').forEach(cb => {
    cb.addEventListener('click', async e => {
      e.stopPropagation();
      const tid  = cb.dataset.tid;
      const task = appData.tasks.find(t => t.id === tid);
      if (!task) return;
      task.done = !task.done;
      saveData(appData);
      renderTasks();
      if (task.done) showToast('任务完成！');
      // 同步后端
      try { await apiRequest(`/task/${tid}`, { method: 'PATCH', body: JSON.stringify({ done: task.done }) }); } catch {}
    });
  });

  document.querySelectorAll('.task-delete').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const tid = btn.dataset.tid;
      appData.tasks = appData.tasks.filter(t => t.id !== tid);
      saveData(appData);
      renderTasks();
      try { await apiRequest(`/task/${tid}`, { method: 'DELETE' }); } catch {}
    });
  });
}

function renderSubjectProgress() {
  const subjectConfig = [
    { name: '政治',   color: '#f43f5e', id: 'politics' },
    { name: '英语',   color: '#06b6d4', id: 'english'  },
    { name: '数学',   color: '#8b5cf6', id: 'math'     },
    { name: '专业课', color: '#f59e0b', id: 'major'    },
  ];
  const subjectDays = {};
  Object.entries(appData.checkins).forEach(([, tc]) => {
    SUBJECTS.forEach(s => { if (tc[s.id]) subjectDays[s.name] = (subjectDays[s.name] || 0) + 1; });
  });
  const maxDays = Math.max(...Object.values(subjectDays), 1);
  document.getElementById('progress-list').innerHTML = subjectConfig.map(sc => {
    const days = subjectDays[sc.name] || 0;
    const pct  = Math.min(100, Math.round((days / Math.max(maxDays, 30)) * 100));
    return `
      <div class="progress-item">
        <div class="progress-header">
          <span class="progress-name">${sc.name}</span>
          <span class="progress-pct" style="color:${sc.color}">${pct}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${pct}%;background:${sc.color}"></div>
        </div>
        <div class="progress-sub">累计打卡 ${days} 天</div>
      </div>
    `;
  }).join('');
}

/* =====================================================
   排行榜页
   ===================================================== */
let currentRankTab = 'week';

async function renderRankPage() {
  try {
    const data = await apiRequest(`/rank?tab=${currentRankTab}`);
    if (data.success) {
      _renderRankFromServer(data.list);
      renderBadges();
      return;
    }
  } catch {}
  // 降级：模拟数据
  _renderRankFallback();
  renderBadges();
}

function _renderRankFromServer(list) {
  const top3   = list.slice(0, 3);
  const rest   = list.slice(3);
  const podiumOrder  = [top3[1], top3[0], top3[2]].filter(Boolean);
  const rankClasses  = ['rank-2', 'rank-1', 'rank-3'];
  const medals       = ['🥈', '🥇', '🥉'];
  const podiumNums   = ['2', '1', '3'];

  document.getElementById('rank-podium').innerHTML = podiumOrder.map((u, i) => `
    <div class="podium-item ${rankClasses[i]}">
      <div class="pod-medal">${medals[i]}</div>
      <img class="pod-avatar" src="${u.avatar}" />
      <div class="pod-name">${u.name}</div>
      <div class="pod-score">${u.score}天</div>
      <div class="pod-base">${podiumNums[i]}</div>
    </div>
  `).join('');

  document.getElementById('rank-list').innerHTML = list.map((u, i) => `
    <div class="rank-row${u.isMe ? ' me' : ''}">
      <span class="rank-no">${i + 1}</span>
      <img class="rav" src="${u.avatar}" />
      <div class="rank-info">
        <div class="rank-uname">${u.name}${u.isMe ? ' 👤' : ''}</div>
        <div class="rank-school">${u.school}</div>
      </div>
      <span class="rank-score">${u.score}天</span>
    </div>
  `).join('');
}

// 降级模拟数据
const MOCK_RANK = [
  { name: '学霸小王', school: '浙大计算机', score: 28, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Zoe' },
  { name: '努力阿强', school: '复旦大学',   score: 26, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Max' },
  { name: '早起鸟儿', school: '同济大学',   score: 25, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Lily' },
  { name: '你 (同学)', school: appData.settings.school || '目标院校', score: appData.totalDays || 1, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix', isMe: true },
  { name: '拼命三郎', school: '武汉大学',   score: 22, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Jake' },
  { name: '夜猫子',   school: '四川大学',   score: 20, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Sara' },
  { name: '图书馆常客', school: '中山大学', score: 18, avatar: 'https://api.dicebear.com/7.x/adventurer/svg?seed=Bob' },
];
function _renderRankFallback() { _renderRankFromServer([...MOCK_RANK].sort((a, b) => b.score - a.score)); }

function renderBadges() {
  document.getElementById('badge-grid').innerHTML = BADGES.map(b => {
    const earned = b.condition(appData);
    return `
      <div class="badge-item${earned ? ' earned' : ''}">
        <div class="badge-icon">${b.icon}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>
    `;
  }).join('');
}

/* =====================================================
   数据统计页
   ===================================================== */
let chartDaily = null, chartSubject = null, chartBar = null;
let statsRange = 'week';

async function renderStatsPage() {
  let dailyHours, subjectMins, checkinDays, overview;

  try {
    const data = await apiRequest(`/stats?range=${statsRange}`);
    if (data.success) {
      dailyHours  = data.dailyHours;
      subjectMins = data.subjectMinutes;
      checkinDays = [
        data.checkinDays.politics,
        data.checkinDays.english,
        data.checkinDays.math,
        data.checkinDays.major,
      ];
      overview    = data.overview;
      document.getElementById('stat-total-hours').textContent  = overview.totalHours;
      document.getElementById('stat-total-days').textContent   = overview.totalDays;
      document.getElementById('stat-streak').textContent       = overview.longestStreak;
      document.getElementById('stat-completion').textContent   = overview.completionRate;
    }
  } catch {}

  // 降级：本地计算
  if (!dailyHours) {
    const days    = statsRange === 'week' ? 7 : 30;
    const dateList = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      dateList.push(d.toLocaleDateString('sv-SE'));
    }
    dailyHours = dateList.map(ds => {
      const logs = (appData.studyLogs || []).filter(l => l.date === ds);
      const mins = logs.reduce((s, l) => s + l.minutes, 0);
      return mins > 0 ? parseFloat((mins / 60).toFixed(1)) : parseFloat((Math.random() * 4 + 2).toFixed(1));
    });
    subjectMins = { '政治': 320, '英语': 280, '数学': 420, '专业课': 360 };
    checkinDays = SUBJECTS.map(s => Object.values(appData.checkins).filter(tc => tc[s.id]).length || Math.floor(Math.random() * 10 + 5));
    const totalHours = dailyHours.reduce((s, v) => s + v, 0).toFixed(1);
    const days2 = statsRange === 'week' ? 7 : 30;
    document.getElementById('stat-total-hours').textContent  = totalHours;
    document.getElementById('stat-total-days').textContent   = appData.totalDays;
    document.getElementById('stat-streak').textContent       = appData.longestStreak;
    document.getElementById('stat-completion').textContent   = Math.round(dailyHours.filter(h => h >= appData.settings.dailyGoal * 0.8).length / days2 * 100) + '%';
  }

  const days = statsRange === 'week' ? 7 : 30;
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    labels.push(d.toLocaleDateString('sv-SE').slice(5));
  }

  // 折线图
  if (chartDaily) chartDaily.destroy();
  chartDaily = new Chart(document.getElementById('chart-daily'), {
    type: 'line',
    data: {
      labels,
      datasets: [{ label: '学习时长（小时）', data: dailyHours, borderColor: '#4f6ef7', backgroundColor: 'rgba(79,110,247,0.1)', borderWidth: 2.5, tension: 0.4, fill: true, pointBackgroundColor: '#4f6ef7', pointRadius: 4 }]
    },
    options: { responsive: true, plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { callback: v => v + 'h' } } } }
  });

  // 科目甜甜圈图
  const smLabels = Object.keys(subjectMins);
  const smData   = Object.values(subjectMins);
  if (chartSubject) chartSubject.destroy();
  chartSubject = new Chart(document.getElementById('chart-subject'), {
    type: 'doughnut',
    data: { labels: smLabels, datasets: [{ data: smData, backgroundColor: ['#f43f5e','#06b6d4','#8b5cf6','#f59e0b'], borderWidth: 2, borderColor: 'white' }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${Math.round(ctx.parsed / 60 * 10) / 10}h` } } } }
  });

  // 柱状图
  if (chartBar) chartBar.destroy();
  chartBar = new Chart(document.getElementById('chart-bar'), {
    type: 'bar',
    data: { labels: SUBJECTS.map(s => s.name), datasets: [{ label: '打卡天数', data: checkinDays, backgroundColor: ['#fca5a5','#a5f3fc','#c4b5fd','#fcd34d'], borderRadius: 8, borderSkipped: false }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } } } }
  });
}

/* =====================================================
   Toast
   ===================================================== */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* =====================================================
   烟花特效
   ===================================================== */
function launchFireworks() {
  const overlay = document.getElementById('firework-overlay');
  const colors  = ['#f43f5e','#4f6ef7','#f59e0b','#22c55e','#8b5cf6','#ec4899'];
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  for (let i = 0; i < 60; i++) {
    const p     = document.createElement('div');
    p.className = 'firework-particle';
    const angle = Math.random() * 2 * Math.PI;
    const dist  = 80 + Math.random() * 200;
    p.style.cssText = `left:${cx}px;top:${cy}px;background:${colors[Math.floor(Math.random()*colors.length)]};--tx:${Math.cos(angle)*dist}px;--ty:${Math.sin(angle)*dist}px;animation-delay:${Math.random()*0.3}s;width:${4+Math.random()*6}px;height:${4+Math.random()*6}px;`;
    overlay.appendChild(p);
    setTimeout(() => p.remove(), 1400);
  }
}

/* =====================================================
   设置弹窗
   ===================================================== */
function initSettings() {
  const fab     = document.getElementById('fab-settings');
  const overlay = document.getElementById('modal-overlay');
  const closeBtn = document.getElementById('modal-close');
  const saveBtn  = document.getElementById('btn-save-settings');

  fab.addEventListener('click', () => {
    document.getElementById('setting-exam-date').value  = appData.settings.examDate;
    document.getElementById('setting-name').value       = appData.settings.name;
    document.getElementById('setting-school').value     = appData.settings.school;
    document.getElementById('setting-daily-goal').value = appData.settings.dailyGoal;
    overlay.style.display = 'flex';
  });
  closeBtn.addEventListener('click', () => overlay.style.display = 'none');
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

  saveBtn.addEventListener('click', async () => {
    appData.settings.examDate  = document.getElementById('setting-exam-date').value || '2026-12-26';
    appData.settings.name      = document.getElementById('setting-name').value || '同学';
    appData.settings.school    = document.getElementById('setting-school').value;
    appData.settings.dailyGoal = parseInt(document.getElementById('setting-daily-goal').value) || 8;
    document.querySelector('.username').textContent = appData.settings.name;
    saveData(appData);

    // 同步到服务器
    try {
      await apiRequest('/user/settings', {
        method: 'PUT',
        body: JSON.stringify({
          examDate:  appData.settings.examDate,
          name:      appData.settings.name,
          school:    appData.settings.school,
          dailyGoal: appData.settings.dailyGoal,
        }),
      });
    } catch {}

    overlay.style.display = 'none';
    showToast('设置已保存！');
  });
}

/* =====================================================
   导航切换
   ===================================================== */
function initNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const page = item.dataset.page;
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
      if (page === 'plan')  renderPlanPage();
      if (page === 'rank')  renderRankPage();
      if (page === 'stats') renderStatsPage();
    });
  });
}

/* =====================================================
   添加任务
   ===================================================== */
function initPlanActions() {
  const addBtn  = document.getElementById('btn-add-task');
  const form    = document.getElementById('add-task-form');
  const confirm = document.getElementById('btn-confirm-task');
  const cancel  = document.getElementById('btn-cancel-task');

  addBtn.addEventListener('click', () => { form.style.display = 'block'; });
  cancel.addEventListener('click', () => { form.style.display = 'none'; });

  confirm.addEventListener('click', async () => {
    const name     = document.getElementById('task-name').value.trim();
    const subject  = document.getElementById('task-subject').value;
    const duration = parseInt(document.getElementById('task-duration').value) || 60;
    if (!name) { showToast('请输入任务名称'); return; }

    const newTask = { id: Date.now().toString(), name, subject, duration, done: false, date: todayStr() };
    appData.tasks.push(newTask);
    saveData(appData);
    form.style.display = 'none';
    document.getElementById('task-name').value     = '';
    document.getElementById('task-duration').value = '';
    renderTasks();
    showToast('任务已添加！');

    // 同步到服务器
    try {
      await apiRequest('/task', { method: 'POST', body: JSON.stringify(newTask) });
    } catch {}
  });
}

/* =====================================================
   排行榜 Tab
   ===================================================== */
function initRankTabs() {
  document.querySelectorAll('.rank-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.rank-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentRankTab = tab.dataset.tab || 'week';
      renderRankPage();
    });
  });
}

/* =====================================================
   统计 Tab
   ===================================================== */
function initStatsTabs() {
  document.querySelectorAll('.stats-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      statsRange = tab.dataset.range;
      renderStatsPage();
    });
  });
}

/* =====================================================
   一键打卡
   ===================================================== */
function initCheckinAll() {
  document.getElementById('btn-checkin-all').addEventListener('click', async () => {
    const today = todayStr();
    if (!appData.checkins[today]) appData.checkins[today] = {};
    SUBJECTS.forEach(s => {
      if (!appData.checkins[today][s.id]) {
        appData.checkins[today][s.id] = true;
        appData.studyLogs.push({ date: today, subject: s.name, minutes: s.target });
      }
    });
    updateStreakAndStats();
    saveData(appData);
    renderCheckinGrid();
    renderCalendar();
    launchFireworks();
    setTimeout(() => showToast('今日全部打卡完成！继续加油！'), 300);

    // 同步到服务器
    try {
      const data = await apiRequest('/checkin/all', { method: 'POST', body: '{}' });
      if (data.success && data.stats) {
        appData.streak        = data.stats.streak;
        appData.longestStreak = data.stats.longestStreak;
        appData.totalDays     = data.stats.totalDays;
        saveData(appData);
        updateCheckinSummary();
      }
    } catch {}
  });
}

/* =====================================================
   初始化
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => {
  initLoginPage();
  initLogout();
  initProfileModal();

  document.getElementById('today-date').textContent = fmtDate(new Date());

  startCountdown();
  renderCheckinGrid();
  initCalendar();
  renderMotto();
  initNav();
  initSettings();
  initCheckinAll();
  initPlanActions();
  initRankTabs();
  initStatsTabs();

  document.getElementById('btn-refresh-quote').addEventListener('click', nextMotto);

  updateCheckinSummary();
});
