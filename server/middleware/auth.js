/**
 * middleware/auth.js · JWT 鉴权中间件
 */
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'kaoyan_secret_2026';

/**
 * verifyToken —— 校验请求头中的 Bearer Token
 * 验证通过后在 req.user 中挂载 { id, name, phone, login_type }
 */
function verifyToken(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token  = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: '未登录，请先登录' });
  }

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token 已失效，请重新登录' });
  }
}

/**
 * signToken —— 生成 JWT
 */
function signToken(payload) {
  return jwt.sign(payload, SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });
}

module.exports = { verifyToken, signToken };
