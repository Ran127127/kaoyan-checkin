/**
 * 考研打卡网站 · Node.js 后端入口
 * server.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express  = require('express');
const cors     = require('cors');
const morgan   = require('morgan');
const path     = require('path');

const { initDB }       = require('./db/init');
const authRouter       = require('./routes/auth');
const checkinRouter    = require('./routes/checkin');
const taskRouter       = require('./routes/task');
const rankRouter       = require('./routes/rank');
const statsRouter      = require('./routes/stats');
const userRouter       = require('./routes/user');

const app  = express();
const PORT = process.env.PORT || 3000;

/* ── 初始化数据库 ── */
initDB();

/* ── 中间件 ── */
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'development' ? 'dev' : 'combined'));

/* ── 静态前端文件（生产可直接托管 html/css/js）── */
app.use(express.static(path.join(__dirname, '../')));

/* ── 根路径重定向到前端首页 ── */
app.get('/', (_req, res) => {
  res.redirect('/public/index.html');
});

/* ── API 路由 ── */
app.use('/api/auth',    authRouter);
app.use('/api/checkin', checkinRouter);
app.use('/api/task',    taskRouter);
app.use('/api/rank',    rankRouter);
app.use('/api/stats',   statsRouter);
app.use('/api/user',    userRouter);

/* ── 健康检查 ── */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/* ── 全局错误处理 ── */
app.use((err, _req, res, _next) => {
  console.error('[Error]', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
  });
});

/* ── 启动 ── */
app.listen(PORT, () => {
  console.log(`✅ 考研打卡后端运行在 http://localhost:${PORT}`);
  console.log(`📂 数据库: ${process.env.DB_PATH || './data/kaoyan.db'}`);
});

module.exports = app;
