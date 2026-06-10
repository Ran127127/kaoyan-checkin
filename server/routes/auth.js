/**
 * routes/auth.js · 用户认证路由
 *
 * POST /api/auth/register      注册（手机号 + 密码）
 * POST /api/auth/login/phone   手机号验证码登录
 * POST /api/auth/login/guest   游客登录（无手机号）
 * POST /api/auth/send-code     发送验证码（演示：返回固定码 666666）
 * GET  /api/auth/me            获取当前登录用户信息
 */
const express   = require('express');
const bcrypt    = require('bcryptjs');
const { getDB } = require('../db/init');
const { signToken, verifyToken } = require('../middleware/auth');

const router = express.Router();

/* ── 辅助：根据 userId 查 user 行 ── */
function findUser(id) {
  return getDB().prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/* ── 辅助：初始化 user_stats ── */
function ensureStats(userId) {
  getDB().prepare(`
    INSERT OR IGNORE INTO user_stats (user_id) VALUES (?)
  `).run(userId);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST /api/auth/send-code
   演示：直接返回 666666，实际接入短信服务
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.post('/send-code', (req, res) => {
  const { phone } = req.body;
  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ success: false, message: '手机号格式不正确' });
  }
  // 演示模式：固定验证码 666666
  // 生产：接入阿里云 / 腾讯云短信 SDK，将 code 存 Redis 并设 5 分钟过期
  console.log(`[SMS Demo] 手机号 ${phone} 验证码: 666666`);
  res.json({ success: true, message: '验证码已发送（演示：666666）' });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST /api/auth/login/phone
   { phone, code }  →  { token, user }
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.post('/login/phone', (req, res) => {
  const { phone, code } = req.body;

  if (!/^1[3-9]\d{9}$/.test(phone)) {
    return res.status(400).json({ success: false, message: '手机号格式不正确' });
  }
  // 演示：只接受 666666
  if (code !== '666666') {
    return res.status(400).json({ success: false, message: '验证码错误' });
  }

  const db = getDB();
  let user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);

  if (!user) {
    // 自动注册
    const name   = `用户${phone.slice(-4)}`;
    const avatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${phone.slice(-4)}`;
    const result = db.prepare(`
      INSERT INTO users (phone, name, avatar, login_type)
      VALUES (?, ?, ?, 'phone')
    `).run(phone, name, avatar);
    user = findUser(result.lastInsertRowid);
  } else {
    // 更新登录类型
    db.prepare(`UPDATE users SET login_type='phone', updated_at=datetime('now','localtime') WHERE id=?`).run(user.id);
  }

  ensureStats(user.id);
  const token = signToken({ id: user.id, name: user.name, phone: user.phone, login_type: 'phone' });
  res.json({ success: true, token, user: safeUser(user) });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST /api/auth/login/wechat
   演示：{ seed, name } →  { token, user }
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.post('/login/wechat', (req, res) => {
  const { name, avatar } = req.body;
  if (!name || !avatar) {
    return res.status(400).json({ success: false, message: '参数缺失' });
  }

  const db = getDB();
  // 微信登录演示：每次都创建新用户（实际应以 openid 为唯一键）
  const result = db.prepare(`
    INSERT INTO users (name, avatar, login_type)
    VALUES (?, ?, 'wechat')
  `).run(name, avatar);
  const user = findUser(result.lastInsertRowid);

  ensureStats(user.id);
  const token = signToken({ id: user.id, name: user.name, login_type: 'wechat' });
  res.json({ success: true, token, user: safeUser(user) });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST /api/auth/login/guest
   → { token, user }
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.post('/login/guest', (req, res) => {
  const db = getDB();
  const result = db.prepare(`
    INSERT INTO users (name, avatar, login_type)
    VALUES ('游客同学', 'https://api.dicebear.com/7.x/adventurer/svg?seed=guest', 'guest')
  `).run();
  const user = findUser(result.lastInsertRowid);

  ensureStats(user.id);
  const token = signToken({ id: user.id, name: '游客同学', login_type: 'guest' });
  res.json({ success: true, token, user: safeUser(user) });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /api/auth/me  (需要 Token)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.get('/me', verifyToken, (req, res) => {
  const user = findUser(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  res.json({ success: true, user: safeUser(user) });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   过滤敏感字段
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
function safeUser(u) {
  const { password, ...rest } = u;
  return rest;
}

module.exports = router;
