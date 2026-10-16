const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===== 认证中间件 =====
// 简单的token验证：用userId当token
function auth(req, res, next) {
  const userId = req.headers['x-user-id'];
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }
  const user = db.prepare('SELECT id, nickname, points, is_admin FROM users WHERE id = ?').get(userId);
  if (!user) {
    return res.status(401).json({ error: '用户不存在' });
  }
  req.user = user;
  next();
}

// ===== 认证API =====
// 注册
app.post('/api/register', (req, res) => {
  const { nickname, password } = req.body;
  if (!nickname || !password) {
    return res.status(400).json({ error: '昵称和密码不能为空' });
  }
  try {
    const stmt = db.prepare('INSERT INTO users (nickname, password) VALUES (?, ?)');
    const result = stmt.run(nickname, password);
    const user = db.prepare('SELECT id, nickname, points, is_admin FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.json(user);
  } catch (e) {
    res.status(400).json({ error: '昵称已被占用' });
  }
});

// 登录
app.post('/api/login', (req, res) => {
  const { nickname, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE nickname = ? AND password = ?').get(nickname, password);
  if (!user) {
    return res.status(401).json({ error: '昵称或密码错误' });
  }
  res.json({ id: user.id, nickname: user.nickname, points: user.points, is_admin: user.is_admin });
});

// 获取当前用户
app.get('/api/me', auth, (req, res) => {
  res.json(req.user);
});

// ===== 猫咪API =====
// 猫咪列表
app.get('/api/cats', (req, res) => {
  const { status, neutered } = req.query;
  let sql = `
    SELECT c.*, 
      COALESCE(SUM(CASE WHEN f.status = '已确认' THEN f.points ELSE 0 END), 0) as current_points
    FROM cats c
    LEFT JOIN feeding_records f ON c.id = f.cat_id
    WHERE 1=1
  `;
  const params = [];
  if (status) {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (neutered) {
    sql += ' AND c.neutered = ?';
    params.push(neutered);
  }
  sql += ' GROUP BY c.id ORDER BY c.created_at DESC';
  const cats = db.prepare(sql).all(...params);
  res.json(cats);
});

// 猫咪详情
app.get('/api/cats/:id', (req, res) => {
  const cat = db.prepare(`
    SELECT c.*, 
      COALESCE(SUM(CASE WHEN f.status = '已确认' THEN f.points ELSE 0 END), 0) as current_points
    FROM cats c
    LEFT JOIN feeding_records f ON c.id = f.cat_id
    WHERE c.id = ?
    GROUP BY c.id
  `).get(req.params.id);
  if (!cat) return res.status(404).json({ error: '猫咪不存在' });
  res.json(cat);
});

// 新增猫咪
app.post('/api/cats', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const b = req.body;
  const stmt = db.prepare(`
    INSERT INTO cats (name, photo, gender, weight, age, neutered, vaccine, story, medical, personality, health, location, status, threshold_points)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    b.name, b.photo || '', b.gender || '未知', b.weight || '', b.age || '',
    b.neutered || '待定', b.vaccine || '', b.story || '', b.medical || '',
    b.personality || '', b.health || '', b.location || '', b.status || '可领养',
    b.threshold_points || 500
  );
  res.json({ id: result.lastInsertRowid });
});

// 编辑猫咪
app.put('/api/cats/:id', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const b = req.body;
  const stmt = db.prepare(`
    UPDATE cats SET 
      name=?, photo=?, gender=?, weight=?, age=?, neutered=?, vaccine=?,
      story=?, medical=?, personality=?, health=?, location=?, status=?, threshold_points=?
    WHERE id=?
  `);
  stmt.run(
    b.name, b.photo || '', b.gender || '未知', b.weight || '', b.age || '',
    b.neutered || '待定', b.vaccine || '', b.story || '', b.medical || '',
    b.personality || '', b.health || '', b.location || '', b.status || '可领养',
    b.threshold_points || 500, req.params.id
  );
  res.json({ ok: true });
});

// ===== 投喂API =====
// 发起投喂
app.post('/api/feeding', auth, (req, res) => {
  const { cat_id, points, food_type } = req.body;
  if (!cat_id || !points) return res.status(400).json({ error: '参数不全' });
  const cat = db.prepare('SELECT * FROM cats WHERE id = ?').get(cat_id);
  if (!cat) return res.status(404).json({ error: '猫咪不存在' });
  
  const stmt = db.prepare('INSERT INTO feeding_records (user_id, cat_id, points, status, food_type) VALUES (?, ?, ?, ?, ?)');
  const result = stmt.run(req.user.id, cat_id, points, '待确认', food_type || '猫粮');
  res.json({ id: result.lastInsertRowid, status: '待确认' });
});

// 我的投喂记录
app.get('/api/feeding/my', auth, (req, res) => {
  const records = db.prepare(`
    SELECT f.*, c.name as cat_name 
    FROM feeding_records f
    JOIN cats c ON f.cat_id = c.id
    WHERE f.user_id = ?
    ORDER BY f.created_at DESC
  `).all(req.user.id);
  res.json(records);
});

// 待确认投喂列表（管理员）
app.get('/api/feeding/pending', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const records = db.prepare(`
    SELECT f.*, c.name as cat_name, u.nickname as user_name
    FROM feeding_records f
    JOIN cats c ON f.cat_id = c.id
    JOIN users u ON f.user_id = u.id
    WHERE f.status = '待确认'
    ORDER BY f.created_at DESC
  `).all();
  res.json(records);
});

// 确认投喂（管理员）
app.post('/api/feeding/:id/confirm', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const record = db.prepare('SELECT * FROM feeding_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: '记录不存在' });
  if (record.status === '已确认') return res.status(400).json({ error: '已经确认过了' });

  // 更新记录状态
  db.prepare("UPDATE feeding_records SET status = '已确认' WHERE id = ?").run(req.params.id);
  // 给用户加积分
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(record.points, record.user_id);
  
  res.json({ ok: true });
});

// ===== 任务API =====
app.get('/api/tasks', auth, (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, c.name as cat_name 
    FROM tasks t
    LEFT JOIN cats c ON t.cat_id = c.id
    ORDER BY t.task_date ASC, t.created_at DESC
  `).all();
  res.json(tasks);
});

app.post('/api/tasks', auth, (req, res) => {
  const { title, task_date, category, cat_id } = req.body;
  if (!title || !task_date) return res.status(400).json({ error: '标题和日期必填' });
  const stmt = db.prepare('INSERT INTO tasks (title, task_date, category, cat_id) VALUES (?, ?, ?, ?)');
  const result = stmt.run(title, task_date, category || '日常', cat_id || null);
  res.json({ id: result.lastInsertRowid });
});

app.put('/api/tasks/:id', auth, (req, res) => {
  const { done, title, task_date, category } = req.body;
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.params.id);
  if (!task) return res.status(404).json({ error: '任务不存在' });
  db.prepare('UPDATE tasks SET done = ?, title = ?, task_date = ?, category = ? WHERE id = ?')
    .run(done !== undefined ? (done ? 1 : 0) : task.done, title || task.title, task_date || task.task_date, category || task.category, req.params.id);
  res.json({ ok: true });
});

// ===== 备忘API =====
app.get('/api/memos', auth, (req, res) => {
  const memos = db.prepare('SELECT * FROM memos ORDER BY created_at DESC').all();
  res.json(memos);
});

app.post('/api/memos', auth, (req, res) => {
  const { content } = req.body;
  if (!content) return res.status(400).json({ error: '内容不能为空' });
  const result = db.prepare('INSERT INTO memos (content) VALUES (?)').run(content);
  res.json({ id: result.lastInsertRowid });
});

app.delete('/api/memos/:id', auth, (req, res) => {
  db.prepare('DELETE FROM memos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ===== 首页汇总API =====
app.get('/api/home/summary', auth, (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  
  const availableCats = db.prepare("SELECT COUNT(*) as count FROM cats WHERE status = '可领养'").get().count;
  const todayFeeding = db.prepare("SELECT COUNT(*) as count FROM feeding_records WHERE date(created_at) = date('now', 'localtime')").get().count;
  const pendingTasks = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE done = 0').get().count;
  const todayTasks = db.prepare("SELECT * FROM tasks WHERE task_date = ? AND done = 0 ORDER BY created_at DESC").all(today);
  
  res.json({
    availableCats,
    todayFeeding,
    pendingTasks,
    todayTasks
  });
});

// ===== 附近猫窝API =====
app.get('/api/cat-houses', auth, (req, res) => {
  const houses = db.prepare('SELECT * FROM cat_houses ORDER BY created_at DESC').all();
  res.json(houses);
});

app.post('/api/cat-houses', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const { name, location, manager, feed_frequency, notes } = req.body;
  if (!name || !location) return res.status(400).json({ error: '名称和位置必填' });
  const result = db.prepare('INSERT INTO cat_houses (name, location, manager, feed_frequency, notes) VALUES (?, ?, ?, ?, ?)')
    .run(name, location, manager || '', feed_frequency || '', notes || '');
  res.json({ id: result.lastInsertRowid });
});

// ===== 领养申请API =====
app.post('/api/adoption/apply', auth, (req, res) => {
  const { cat_id, message } = req.body;
  if (!cat_id) return res.status(400).json({ error: '请选择猫咪' });
  
  const cat = db.prepare('SELECT * FROM cats WHERE id = ?').get(cat_id);
  if (!cat) return res.status(404).json({ error: '猫咪不存在' });
  
  // 检查积分是否够
  if (req.user.points < cat.threshold_points) {
    return res.status(400).json({ error: `积分不足，还差${cat.threshold_points - req.user.points}分` });
  }
  
  const result = db.prepare('INSERT INTO adoption_applications (user_id, cat_id, message) VALUES (?, ?, ?)')
    .run(req.user.id, cat_id, message || '');
  res.json({ id: result.lastInsertRowid, status: '待审核' });
});

app.get('/api/adoption/my', auth, (req, res) => {
  const apps = db.prepare(`
    SELECT a.*, c.name as cat_name 
    FROM adoption_applications a
    JOIN cats c ON a.cat_id = c.id
    WHERE a.user_id = ?
    ORDER BY a.created_at DESC
  `).all(req.user.id);
  res.json(apps);
});

app.get('/api/adoption/pending', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const apps = db.prepare(`
    SELECT a.*, c.name as cat_name, u.nickname as user_name
    FROM adoption_applications a
    JOIN cats c ON a.cat_id = c.id
    JOIN users u ON a.user_id = u.id
    WHERE a.status = '待审核'
    ORDER BY a.created_at DESC
  `).all();
  res.json(apps);
});

app.post('/api/adoption/:id/review', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const { approved } = req.body;
  const app = db.prepare('SELECT * FROM adoption_applications WHERE id = ?').get(req.params.id);
  if (!app) return res.status(404).json({ error: '申请不存在' });
  
  db.prepare("UPDATE adoption_applications SET status = ? WHERE id = ?").run(approved ? '已通过' : '已拒绝', req.params.id);
  
  // 如果通过，把猫咪标记为已领养，扣掉用户积分
  if (approved) {
    db.prepare("UPDATE cats SET status = '已领养' WHERE id = ?").run(app.cat_id);
    const cat = db.prepare('SELECT threshold_points FROM cats WHERE id = ?').get(app.cat_id);
    db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(cat.threshold_points, app.user_id);
  }
  
  res.json({ ok: true });
});

// ===== 志愿者申请API =====
app.post('/api/volunteer/apply', auth, (req, res) => {
  const { name, phone, available_time, skills, notes } = req.body;
  if (!name || !phone) return res.status(400).json({ error: '姓名和联系方式必填' });
  const result = db.prepare('INSERT INTO volunteer_applications (name, phone, available_time, skills, notes) VALUES (?, ?, ?, ?, ?)')
    .run(name, phone, available_time || '', skills || '', notes || '');
  res.json({ id: result.lastInsertRowid, status: '待审核' });
});

app.get('/api/volunteer/pending', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const apps = db.prepare('SELECT * FROM volunteer_applications ORDER BY created_at DESC').all();
  res.json(apps);
});

// ===== 管理员：用户列表 + 手动调分 =====
app.get('/api/admin/users', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const users = db.prepare('SELECT id, nickname, points, is_admin, created_at FROM users ORDER BY created_at DESC').all();
  res.json(users);
});

app.post('/api/admin/users/:id/adjust-points', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const { points } = req.body;
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(points, req.params.id);
  res.json({ ok: true });
});

// ===== 数据导出导入 =====
app.get('/api/admin/export', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const data = {
    users: db.prepare('SELECT * FROM users').all(),
    cats: db.prepare('SELECT * FROM cats').all(),
    feeding_records: db.prepare('SELECT * FROM feeding_records').all(),
    tasks: db.prepare('SELECT * FROM tasks').all(),
    memos: db.prepare('SELECT * FROM memos').all()
  };
  res.json(data);
});

app.post('/api/admin/import', auth, (req, res) => {
  if (!req.user.is_admin) return res.status(403).json({ error: '无权限' });
  const data = req.body;
  
  // 清空所有表
  db.exec('DELETE FROM feeding_records');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM memos');
  db.exec('DELETE FROM cats');
  db.exec('DELETE FROM users');
  
  // 插入数据
  const insertUser = db.prepare('INSERT INTO users (id, nickname, password, points, is_admin, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  data.users.forEach(u => insertUser.run(u.id, u.nickname, u.password, u.points, u.is_admin, u.created_at));
  
  const insertCat = db.prepare('INSERT INTO cats (id, name, photo, gender, weight, age, neutered, vaccine, story, medical, personality, health, location, status, threshold_points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  data.cats.forEach(c => insertCat.run(c.id, c.name, c.photo, c.gender, c.weight, c.age, c.neutered, c.vaccine, c.story, c.medical, c.personality, c.health, c.location, c.status, c.threshold_points, c.created_at));
  
  const insertFeeding = db.prepare('INSERT INTO feeding_records (id, user_id, cat_id, points, status, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  data.feeding_records.forEach(f => insertFeeding.run(f.id, f.user_id, f.cat_id, f.points, f.status, f.created_at));
  
  const insertTask = db.prepare('INSERT INTO tasks (id, title, task_date, category, cat_id, done, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  data.tasks.forEach(t => insertTask.run(t.id, t.title, t.task_date, t.category, t.cat_id, t.done, t.created_at));
  
  const insertMemo = db.prepare('INSERT INTO memos (id, content, created_at) VALUES (?, ?, ?)');
  data.memos.forEach(m => insertMemo.run(m.id, m.content, m.created_at));
  
  res.json({ ok: true });
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`LLMRJ 流浪猫领养APP 已启动:`);
    console.log(`  本机访问: http://localhost:${PORT}`);
    console.log(`  局域网访问: http://<你的电脑IP>:${PORT}`);
  });
}

module.exports = app;
