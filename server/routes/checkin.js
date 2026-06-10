/**
 * routes/checkin.js · 打卡相关路由
 *
 * GET  /api/checkin/today          获取今日打卡状态（各科）
 * POST /api/checkin/toggle         切换某科打卡（做了/取消）
 * POST /api/checkin/all            一键打卡全部科目
 * GET  /api/checkin/calendar       获取某月打卡热力图数据
 * GET  /api/checkin/history        获取所有打卡历史
 */
const express   = require('express');
const { getDB } = require('../db/init');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// 科目配置（与前端保持一致）
const SUBJECTS = [
  { id: 'politics', name: '政治',   target: 120 },
  { id: 'english',  name: '英语',   target: 90  },
  { id: 'math',     name: '数学',   target: 150 },
  { id: 'major',    name: '专业课', target: 120 },
];

function todayStr() {
  return new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD
}

/* ── 计算并更新连续打卡 / 总天数 ── */
function recalcStats(userId) {
  const db = getDB();
  // 获取所有有打卡记录的日期（去重）
  const dates = db.prepare(`
    SELECT DISTINCT date FROM checkins WHERE user_id = ? AND done = 1 ORDER BY date DESC
  `).all(userId).map(r => r.date);

  const totalDays = dates.length;

  // 计算当前连续天数（从今天往前）
  let streak = 0;
  let cur    = new Date();
  for (const d of dates) {
    const expected = cur.toLocaleDateString('sv-SE');
    if (d === expected) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }

  // 计算历史最长连续
  let longest = 0, curLen = 0, prev = null;
  for (let i = dates.length - 1; i >= 0; i--) {
    const d = new Date(dates[i]);
    if (!prev) { curLen = 1; }
    else {
      const diff = (d - prev) / 86400000;
      curLen = diff === 1 ? curLen + 1 : 1;
    }
    longest = Math.max(longest, curLen);
    prev    = d;
  }

  db.prepare(`
    INSERT INTO user_stats (user_id, streak, longest_streak, total_days, updated_at)
    VALUES (?, ?, ?, ?, datetime('now','localtime'))
    ON CONFLICT(user_id) DO UPDATE SET
      streak=excluded.streak,
      longest_streak=MAX(longest_streak, excluded.longest_streak),
      total_days=excluded.total_days,
      updated_at=excluded.updated_at
  `).run(userId, streak, longest, totalDays);

  return { streak, longestStreak: longest, totalDays };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /api/checkin/today
   返回今日四科打卡状态
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.get('/today', verifyToken, (req, res) => {
  const db    = getDB();
  const today = todayStr();
  const rows  = db.prepare(`
    SELECT subject_id, done FROM checkins WHERE user_id=? AND date=?
  `).all(req.user.id, today);

  const checkinMap = {};
  rows.forEach(r => { checkinMap[r.subject_id] = !!r.done; });

  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id=?').get(req.user.id)
    || { streak: 0, longest_streak: 0, total_days: 0 };

  res.json({
    success: true,
    date: today,
    checkins: checkinMap,
    streak:       stats.streak,
    longestStreak: stats.longest_streak,
    totalDays:    stats.total_days,
  });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST /api/checkin/toggle
   Body: { subjectId: 'math' }
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.post('/toggle', verifyToken, (req, res) => {
  const { subjectId } = req.body;
  const subject = SUBJECTS.find(s => s.id === subjectId);
  if (!subject) return res.status(400).json({ success: false, message: '无效的科目' });

  const db    = getDB();
  const today = todayStr();
  const userId = req.user.id;

  const existing = db.prepare(`
    SELECT * FROM checkins WHERE user_id=? AND date=? AND subject_id=?
  `).get(userId, today, subjectId);

  let done;
  if (!existing) {
    // 新增打卡
    db.prepare(`
      INSERT INTO checkins (user_id, date, subject_id, done) VALUES (?,?,?,1)
    `).run(userId, today, subjectId);
    // 记录学习日志
    db.prepare(`
      INSERT INTO study_logs (user_id, date, subject, minutes) VALUES (?,?,?,?)
    `).run(userId, today, subject.name, subject.target);
    done = true;
  } else {
    // 切换
    done = !existing.done;
    db.prepare(`UPDATE checkins SET done=? WHERE id=?`).run(done ? 1 : 0, existing.id);
    if (done) {
      db.prepare(`
        INSERT INTO study_logs (user_id, date, subject, minutes) VALUES (?,?,?,?)
      `).run(userId, today, subject.name, subject.target);
    } else {
      // 取消打卡时删除对应学习日志（最近一条）
      const log = db.prepare(`
        SELECT id FROM study_logs WHERE user_id=? AND date=? AND subject=? ORDER BY id DESC LIMIT 1
      `).get(userId, today, subject.name);
      if (log) db.prepare('DELETE FROM study_logs WHERE id=?').run(log.id);
    }
  }

  const stats = recalcStats(userId);

  // 是否全科完成
  const doneCount = db.prepare(`
    SELECT COUNT(*) as cnt FROM checkins WHERE user_id=? AND date=? AND done=1
  `).get(userId, today).cnt;
  const allDone = doneCount === SUBJECTS.length;

  res.json({ success: true, subjectId, done, allDone, stats });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST /api/checkin/all
   一键打卡全部未完成科目
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.post('/all', verifyToken, (req, res) => {
  const db     = getDB();
  const today  = todayStr();
  const userId = req.user.id;

  const insertCheckin = db.prepare(`
    INSERT OR IGNORE INTO checkins (user_id, date, subject_id, done) VALUES (?,?,?,1)
  `);
  const insertLog = db.prepare(`
    INSERT INTO study_logs (user_id, date, subject, minutes) VALUES (?,?,?,?)
  `);

  const batchAll = db.transaction(() => {
    SUBJECTS.forEach(s => {
      const r = insertCheckin.run(userId, today, s.id);
      if (r.changes > 0) insertLog.run(userId, today, s.name, s.target);
    });
  });
  batchAll();

  const stats = recalcStats(userId);
  res.json({ success: true, allDone: true, stats });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /api/checkin/calendar?year=2026&month=6
   返回该月每天的打卡科目数
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.get('/calendar', verifyToken, (req, res) => {
  const { year, month } = req.query;
  const y = parseInt(year)  || new Date().getFullYear();
  const m = parseInt(month) || (new Date().getMonth() + 1);
  const prefix = `${y}-${String(m).padStart(2, '0')}`;

  const rows = getDB().prepare(`
    SELECT date, COUNT(*) as count
    FROM checkins
    WHERE user_id=? AND date LIKE ? AND done=1
    GROUP BY date
  `).all(req.user.id, `${prefix}%`);

  // { 'YYYY-MM-DD': count }
  const map = {};
  rows.forEach(r => { map[r.date] = r.count; });

  res.json({ success: true, year: y, month: m, data: map });
});

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET /api/checkin/history
   返回所有有打卡记录的日期及科目
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
router.get('/history', verifyToken, (req, res) => {
  const rows = getDB().prepare(`
    SELECT date, subject_id FROM checkins WHERE user_id=? AND done=1 ORDER BY date DESC
  `).all(req.user.id);

  // 聚合 { date: [subject_id,...] }
  const map = {};
  rows.forEach(({ date, subject_id }) => {
    if (!map[date]) map[date] = {};
    map[date][subject_id] = true;
  });

  res.json({ success: true, checkins: map });
});

module.exports = router;
