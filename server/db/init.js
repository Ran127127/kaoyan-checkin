/**
 * db/init.js · SQLite 数据库初始化
 * 使用 better-sqlite3（同步 API，零依赖配置）
 */
const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/kaoyan.db');

let db;

function getDB() {
  if (!db) throw new Error('数据库尚未初始化，请先调用 initDB()');
  return db;
}

function initDB() {
  // 确保数据目录存在
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  /* ── 用户表 ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      phone       TEXT    UNIQUE,
      password    TEXT,
      name        TEXT    NOT NULL DEFAULT '同学',
      avatar      TEXT    NOT NULL DEFAULT 'https://api.dicebear.com/7.x/adventurer/svg?seed=Felix',
      login_type  TEXT    NOT NULL DEFAULT 'phone',  -- phone | wechat | guest
      school      TEXT    DEFAULT '',
      exam_date   TEXT    DEFAULT '2026-12-26',
      daily_goal  INTEGER DEFAULT 8,
      created_at  TEXT    DEFAULT (datetime('now','localtime')),
      updated_at  TEXT    DEFAULT (datetime('now','localtime'))
    );
  `);

  /* ── 打卡记录表 ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS checkins (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       TEXT    NOT NULL,          -- YYYY-MM-DD
      subject_id TEXT    NOT NULL,          -- politics | english | math | major
      done       INTEGER NOT NULL DEFAULT 1,
      created_at TEXT    DEFAULT (datetime('now','localtime')),
      UNIQUE(user_id, date, subject_id)
    );
  `);

  /* ── 学习日志表 ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS study_logs (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date       TEXT    NOT NULL,
      subject    TEXT    NOT NULL,
      minutes    INTEGER NOT NULL DEFAULT 0,
      created_at TEXT    DEFAULT (datetime('now','localtime'))
    );
  `);

  /* ── 任务表 ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id         TEXT    PRIMARY KEY,        -- 前端 Date.now() 生成的字符串 id
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name       TEXT    NOT NULL,
      subject    TEXT    NOT NULL DEFAULT '其他',
      duration   INTEGER NOT NULL DEFAULT 60,
      done       INTEGER NOT NULL DEFAULT 0,
      date       TEXT    NOT NULL,
      created_at TEXT    DEFAULT (datetime('now','localtime')),
      updated_at TEXT    DEFAULT (datetime('now','localtime'))
    );
  `);

  /* ── 连续/总打卡统计缓存表 ── */
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      streak         INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      total_days     INTEGER DEFAULT 0,
      updated_at     TEXT    DEFAULT (datetime('now','localtime'))
    );
  `);

  console.log('🗄️  数据库初始化完成');
  return db;
}

module.exports = { initDB, getDB };
