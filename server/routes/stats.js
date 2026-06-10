/**
 * routes/stats.js · 数据统计路由
 *
 * GET /api/stats?range=week|month
 *   返回：每日学习时长、各科占比、打卡完成率、概览卡片数据
 */
const express   = require('express');
const { getDB } = require('../db/init');
const { verifyToken } = require('../middleware/auth');

const router  = express.Router();
const SUBJECTS = ['政治', '英语', '数学', '专业课'];

router.get('/', verifyToken, (req, res) => {
  const range = req.query.range || 'week';
  const days  = range === 'month' ? 30 : 7;
  const db    = getDB();
  const uid   = req.user.id;

  // 生成日期列表 [days 天前 ... 今天]
  const dateList = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dateList.push(d.toLocaleDateString('sv-SE'));
  }

  // 每日学习时长（分钟）
  const logRows = db.prepare(`
    SELECT date, SUM(minutes) as total_min
    FROM study_logs
    WHERE user_id=? AND date >= ?
    GROUP BY date
  `).all(uid, dateList[0]);
  const logMap = {};
  logRows.forEach(r => { logMap[r.date] = r.total_min; });

  const dailyHours = dateList.map(d =>
    logMap[d] ? parseFloat((logMap[d] / 60).toFixed(1)) : 0
  );

  // 各科学习分钟数
  const subjectRows = db.prepare(`
    SELECT subject, SUM(minutes) as total_min
    FROM study_logs
    WHERE user_id=? AND date >= ?
    GROUP BY subject
  `).all(uid, dateList[0]);
  const subjectMap = {};
  SUBJECTS.forEach(s => { subjectMap[s] = 0; });
  subjectRows.forEach(r => {
    if (subjectMap[r.subject] !== undefined) subjectMap[r.subject] = r.total_min;
  });

  // 各科打卡天数
  const checkinRows = db.prepare(`
    SELECT subject_id, COUNT(DISTINCT date) as cnt
    FROM checkins
    WHERE user_id=? AND done=1
    GROUP BY subject_id
  `).all(uid);
  const checkinDayMap = {};
  checkinRows.forEach(r => { checkinDayMap[r.subject_id] = r.cnt; });

  // 统计概览
  const stats = db.prepare('SELECT * FROM user_stats WHERE user_id=?').get(uid)
    || { streak: 0, longest_streak: 0, total_days: 0 };

  const totalHours     = dailyHours.reduce((s, v) => s + v, 0).toFixed(1);
  const userSettings   = db.prepare('SELECT daily_goal FROM users WHERE id=?').get(uid);
  const dailyGoal      = userSettings ? userSettings.daily_goal : 8;
  const completionRate = Math.round(
    (dailyHours.filter(h => h >= dailyGoal * 0.8).length / days) * 100
  );

  res.json({
    success: true,
    range,
    dateList,
    dailyHours,
    subjectMinutes: subjectMap,
    checkinDays: {
      politics: checkinDayMap['politics'] || 0,
      english:  checkinDayMap['english']  || 0,
      math:     checkinDayMap['math']     || 0,
      major:    checkinDayMap['major']    || 0,
    },
    overview: {
      totalHours,
      totalDays:    stats.total_days,
      longestStreak: stats.longest_streak,
      completionRate: completionRate + '%',
    },
  });
});

module.exports = router;
