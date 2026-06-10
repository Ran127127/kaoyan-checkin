# 考研打卡网站 · Node.js 后端接入说明

## 项目结构

```
代码/
├── index.html          # 前端页面
├── style.css           # 样式
├── app.js              # 前端逻辑（已接入后端 API）
└── server/             # ✅ Node.js 后端
    ├── server.js           # 入口文件
    ├── package.json        # 依赖配置
    ├── .env.example        # 环境变量模板
    ├── db/
    │   └── init.js         # SQLite 数据库初始化
    ├── middleware/
    │   └── auth.js         # JWT 鉴权中间件
    └── routes/
        ├── auth.js         # 用户登录注册
        ├── user.js         # 用户资料/设置
        ├── checkin.js      # 打卡记录
        ├── task.js         # 学习任务 CRUD
        ├── rank.js         # 排行榜
        └── stats.js        # 数据统计
```

## 🚀 快速启动

### 1. 安装依赖
```bash
cd 代码/server
npm install
```

### 2. 配置环境变量
```bash
# 复制并修改环境变量
cp .env.example .env
```
`.env` 内容（按需修改）：
```
PORT=3000
JWT_SECRET=your_super_secret_key_change_in_production
JWT_EXPIRES_IN=7d
DB_PATH=./data/kaoyan.db
```

### 3. 启动后端
```bash
# 开发模式（自动重启）
npm run dev

# 生产模式
npm start
```

### 4. 打开前端
直接用浏览器打开 `index.html`，或通过 http://localhost:3000 访问（后端会托管静态文件）。

---

## 📡 API 接口列表

| 方法   | 路径                      | 说明               | 是否需要 Token |
|------|--------------------------|--------------------|----|
| POST | /api/auth/send-code       | 发送验证码（演示）   | 否 |
| POST | /api/auth/login/phone     | 手机号登录          | 否 |
| POST | /api/auth/login/wechat    | 微信登录（演示）     | 否 |
| POST | /api/auth/login/guest     | 游客登录            | 否 |
| GET  | /api/auth/me              | 获取当前用户信息     | ✅ |
| GET  | /api/user/profile         | 获取用户资料        | ✅ |
| PUT  | /api/user/profile         | 更新昵称/头像       | ✅ |
| PUT  | /api/user/settings        | 更新考研设置        | ✅ |
| GET  | /api/checkin/today        | 今日打卡状态        | ✅ |
| POST | /api/checkin/toggle       | 切换科目打卡        | ✅ |
| POST | /api/checkin/all          | 一键全科打卡        | ✅ |
| GET  | /api/checkin/calendar     | 月份热力图数据      | ✅ |
| GET  | /api/checkin/history      | 历史打卡记录        | ✅ |
| GET  | /api/task                 | 获取任务列表        | ✅ |
| POST | /api/task                 | 新增任务            | ✅ |
| PATCH| /api/task/:id             | 切换任务完成状态     | ✅ |
| DELETE| /api/task/:id            | 删除任务            | ✅ |
| GET  | /api/rank                 | 排行榜（?tab=week/month/total）| ✅ |
| GET  | /api/stats                | 统计数据（?range=week/month）| ✅ |
| GET  | /api/health               | 健康检查            | 否 |

---

## 🏗️ 技术架构

```
前端 (index.html + app.js)
   │
   │  HTTP / Fetch API
   │  JWT Token (localStorage)
   ▼
Node.js + Express 后端
   │
   │  better-sqlite3 (同步 API)
   ▼
SQLite 数据库 (server/data/kaoyan.db)
```

### 离线降级策略
- 后端不可用时，自动降级为 **localStorage 本地模式**
- 页面右下角有「后端状态指示器」：绿色=已连接，黄色=离线模式
- 所有数据操作都遵循「乐观更新」模式：先更新本地 UI，再异步同步服务器

---

## 🔮 后续扩展建议

1. **接入真实短信验证码** — 替换 `routes/auth.js` 中的演示码逻辑，接入阿里云 / 腾讯云短信 SDK
2. **Redis 存储验证码** — 生产环境用 Redis 替代内存存储，设置5分钟过期
3. **微信 OAuth** — 接入真实微信 OAuth 2.0，用 openid 作为用户唯一标识
4. **Nginx 反向代理** — 部署时用 Nginx 托管前端静态文件并代理 `/api` 到 Node.js
5. **数据库迁移** — 数据量大后可迁移至 PostgreSQL / MySQL
