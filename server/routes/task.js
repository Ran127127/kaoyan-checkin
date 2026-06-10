/**
 * routes/task.js · 学习任务 CRUD
 *
 * GET    /api/task          获取当前用户所有任务
 * POST   /api/task          新增任务
 * PATCH  /api/task/:id      切换完成状态
 * DELETE /api/task/:id      删除任务
 */
const express   = require('express');
const { getDB } = require('../db/init');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

/* ── 获取任务列表 ── */
router.get('/', verifyToken, (req, res) => {
  const tasks = getDB()
    .prepare('SELECT * FROM tasks WHERE user_id=? ORDER BY created_at DESC')
    .all(req.user.id);
  res.json({ success: true, tasks: tasks.map(formatTask) });
});

/* ── 新增任务 ── */
router.post('/', verifyToken, (req, res) => {
  const { id, name, subject, duration, date } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: '任务名称不能为空' });
  }
  const taskId = id || Date.now().toString();
  getDB().prepare(`
    INSERT OR REPLACE INTO tasks (id, user_id, name, subject, duration, done, date)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(taskId, req.user.id, name.trim(), subject || '其他', parseInt(duration) || 60, date || new Date().toLocaleDateString('sv-SE'));

  const task = getDB().prepare('SELECT * FROM tasks WHERE id=?').get(taskId);
  res.json({ success: true, task: formatTask(task) });
});

/* ── 切换完成状态 ── */
router.patch('/:id', verifyToken, (req, res) => {
  const task = getDB().prepare('SELECT * FROM tasks WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
  if (!task) return res.status(404).json({ success: false, message: '任务不存在' });

  const newDone = req.body.done !== undefined ? (req.body.done ? 1 : 0) : (task.done ? 0 : 1);
  getDB().prepare(`UPDATE tasks SET done=?, updated_at=datetime('now','localtime') WHERE id=?`).run(newDone, task.id);
  res.json({ success: true, done: !!newDone });
});

/* ── 删除任务 ── */
router.delete('/:id', verifyToken, (req, res) => {
  const r = getDB().prepare('DELETE FROM tasks WHERE id=? AND user_id=?').run(req.params.id, req.user.id);
  if (r.changes === 0) return res.status(404).json({ success: false, message: '任务不存在' });
  res.json({ success: true, message: '任务已删除' });
});

function formatTask(t) {
  return { ...t, done: !!t.done };
}

module.exports = router;
