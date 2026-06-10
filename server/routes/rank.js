/**
 * routes/rank.js · 排行榜路由
 *
 * GET /api/rank?tab=week|month|total
 *   返回排行榜数据（前 20 名）+ 当前用户排名
 */
const express   = require('express');
const { getDB } = require('../db/init');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

router.get('/', verifyToken, (req, res) => {
  const tab = req.query.tab || 'total'; // week | month | total
  const db  = getDB();

  let dateFilter = '';
  if (tab === 'week') {
    // 近7天
    dateFilter = `AND c.date >= date('now','-6 days','localtime')`;
  } else if (tab === 'month') {
    // 近30天
    dateFilter = `AND c.date >= date('now','-29 days','localtime')`;
  }

  // 按打卡天数排名（各用户不重复计日期）
  const rows = db.prepare(`
    SELECT
      u.id,
      u.name,
      u.avatar,
      u.school,
      u.login_type,
      COUNT(DISTINCT c.date) AS score
    FROM users u
    LEFT JOIN checkins c ON c.user_id = u.id AND c.done = 1 ${dateFilter}
    GROUP BY u.id
    ORDER BY score DESC
    LIMIT 50
  `).all();

  // 找当前用户排名
  const myRank = rows.findIndex(r => r.id === req.user.id) + 1;
  const myData = rows.find(r => r.id === req.user.id);

  // 标记当前用户
  const list = rows.slice(0, 20).map((r, i) => ({
    rank: i + 1,
    id:   r.id,
    name: r.name,
    avatar: r.avatar,
    school: r.school || '目标院校',
    score:  r.score,
    isMe:   r.id === req.user.id,
  }));

  res.json({
    success: true,
    tab,
    list,
    myRank: myRank || rows.length + 1,
    myScore: myData ? myData.score : 0,
  });
});

module.exports = router;
