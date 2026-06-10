/**
 * routes/user.js · 用户资料路由
 *
 * GET  /api/user/profile          获取当前用户资料
 * PUT  /api/user/profile          更新昵称、头像
 * PUT  /api/user/settings         更新考研设置（考试日期、目标学校、每日目标时长）
 */
const express   = require('express');
const { getDB } = require('../db/init');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

/* ── 获取用户资料 ── */
router.get('/profile', verifyToken, (req, res) => {
  const user = getDB()
    .prepare('SELECT id, name, avatar, login_type, school, exam_date, daily_goal, phone, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ success: false, message: '用户不存在' });
  res.json({ success: true, user });
});

/* ── 更新昵称 / 头像 ── */
router.put('/profile', verifyToken, (req, res) => {
  const { name, avatar } = req.body;
  if (!name || name.trim().length === 0) {
    return res.status(400).json({ success: false, message: '昵称不能为空' });
  }
  getDB().prepare(`
    UPDATE users SET name=?, avatar=?, updated_at=datetime('now','localtime') WHERE id=?
  `).run(name.trim(), avatar || '', req.user.id);
  res.json({ success: true, message: '资料已更新' });
});

/* ── 更新考研设置 ── */
router.put('/settings', verifyToken, (req, res) => {
  const { examDate, name, school, dailyGoal } = req.body;
  getDB().prepare(`
    UPDATE users
    SET exam_date=?, name=?, school=?, daily_goal=?, updated_at=datetime('now','localtime')
    WHERE id=?
  `).run(
    examDate   || '2026-12-26',
    name       || '同学',
    school     || '',
    parseInt(dailyGoal) || 8,
    req.user.id,
  );
  res.json({ success: true, message: '设置已保存' });
});

module.exports = router;
