// ===== 全局状态 =====
let currentUser = null;
let currentCatId = null;
let selectedFeedingPoints = 500;

// ===== API 封装 =====
async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (currentUser) {
    headers['x-user-id'] = currentUser.id;
  }
  const res = await fetch(path, {
    ...options,
    headers: { ...headers, ...options.headers }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// ===== 登录注册 =====
document.querySelectorAll('.login-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.login-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const isLogin = tab.dataset.tab === 'login';
    document.getElementById('login-form').style.display = isLogin ? 'block' : 'none';
    document.getElementById('register-form').style.display = isLogin ? 'none' : 'block';
  });
});

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = document.getElementById('login-nickname').value;
  const password = document.getElementById('login-password').value;
  try {
    const user = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ nickname, password })
    });
    loginSuccess(user);
  } catch (err) {
    document.getElementById('login-error').textContent = err.message;
  }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const nickname = document.getElementById('register-nickname').value;
  const password = document.getElementById('register-password').value;
  try {
    const user = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify({ nickname, password })
    });
    loginSuccess(user);
  } catch (err) {
    document.getElementById('register-error').textContent = err.message;
  }
});

function loginSuccess(user) {
  currentUser = user;
  localStorage.setItem('userId', user.id);
  document.getElementById('login-page').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  updateProfileUI();
  loadHomeData();
  switchTab('home');
}

// ===== 页面切换 =====
function switchTab(tabName) {
  // 底部导航激活状态
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.tab === tabName);
  });
  
  // 显示对应页面
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  
  const pageMap = {
    home: 'page-home',
    cats: 'page-cats',
    tasks: 'page-tasks',
    profile: 'page-profile',
    'cat-detail': 'page-cat-detail',
    feeding: 'page-feeding',
    admin: 'page-admin',
    'my-feedings': 'page-my-feedings',
    'cat-houses': 'page-cat-houses',
    adoption: 'page-adoption-apply',
    volunteer: 'page-volunteer',
    shop: 'page-shop'
  };
  
  const pageId = pageMap[tabName] || 'page-home';
  document.getElementById(pageId).classList.add('active');
  
  // 更新标题
  const titleMap = {
    home: '首页',
    cats: '找猫咪',
    tasks: '救助计划',
    profile: '我的',
    'cat-detail': '猫咪详情',
    feeding: '投喂确认',
    admin: '管理员后台',
    'my-feedings': '我的投喂记录',
    'cat-houses': '附近猫屋',
    adoption: '领养代替购买',
    volunteer: '志愿者填报',
    shop: '积分商城'
  };
  document.getElementById('header-title').textContent = titleMap[tabName] || '首页';
  
  // 加载对应数据
  if (tabName === 'home') loadHomeData();
  if (tabName === 'cats') loadCats();
  if (tabName === 'tasks') loadTasks();
  if (tabName === 'profile') loadProfile();
  if (tabName === 'admin') loadAdminData();
  if (tabName === 'my-feedings') loadMyFeedings();
  if (tabName === 'cat-houses') loadCatHouses();
  if (tabName === 'adoption') loadAdoptionPage();
  if (tabName === 'shop') loadShopPage();
}

document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => switchTab(item.dataset.tab));
});

// ===== 退出登录 =====
document.getElementById('logout-btn').addEventListener('click', () => {
  currentUser = null;
  localStorage.removeItem('userId');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-page').style.display = 'flex';
});

// ===== 首页数据 =====
async function loadHomeData() {
  try {
    const data = await api('/api/home/summary');
    
    // 今日计划
    const planList = document.getElementById('today-plan-list');
    if (data.todayTasks.length === 0) {
      planList.innerHTML = '<div class="empty-text">今日暂无安排</div>';
    } else {
      planList.innerHTML = data.todayTasks.map(t => 
        `<div class="plan-item">${t.title}</div>`
      ).join('');
    }
    
    // 待领养猫咪横向列表
    loadHomeCatsRow();
    
    // 今日投喂动态
    loadHomeFeeding();
    
    // 备忘
    loadMemos();
  } catch (err) {
    console.error('加载首页数据失败:', err);
  }
}

async function loadHomeCatsRow() {
  try {
    const cats = await api('/api/cats?status=可领养');
    const row = document.getElementById('home-cats-row');
    
    if (cats.length === 0) {
      row.innerHTML = '<div class="empty-text" style="width:100%;">暂无待领养猫咪</div>';
      return;
    }
    
    row.innerHTML = cats.slice(0, 8).map(c => `
      <div class="cat-mini-card" onclick="showCatDetail(${c.id})">
        <div class="cat-mini-photo" style="background-image: url('${c.photo || ''}');">
          ${c.photo ? '' : '猫'}
        </div>
        <div class="cat-mini-name">${c.name}</div>
        <div class="cat-mini-meta">${c.gender} · ${c.neutered}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('加载首页猫咪失败:', err);
  }
}

async function loadHomeFeeding() {
  try {
    const records = await api('/api/feeding/my');
    const list = document.getElementById('home-feeding-list');
    
    if (records.length === 0) {
      list.innerHTML = '<div class="empty-text">今天还没有投喂记录</div>';
      return;
    }
    
    list.innerHTML = records.slice(0, 3).map(r => `
      <div class="plan-item">
        <span style="color:#F2994A;">+${r.points}分</span> 投喂了 ${r.cat_name}
        <span style="float:right;font-size:11px;color:#8A8178;">${r.status}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error('加载投喂动态失败:', err);
    document.getElementById('home-feeding-list').innerHTML = '<div class="empty-text">暂无投喂动态</div>';
  }
}

// ===== 备忘 =====
async function loadMemos() {
  try {
    const memos = await api('/api/memos');
    const list = document.getElementById('memo-list');
    if (memos.length === 0) {
      list.innerHTML = '<div class="empty-text">还没有备忘，记一条吧</div>';
    } else {
      list.innerHTML = memos.map(m => 
        `<div class="memo-item">
          <span>${m.content}</span>
          <button class="memo-delete" onclick="deleteMemo(${m.id})">×</button>
        </div>`
      ).join('');
    }
  } catch (err) {
    console.error('加载备忘失败:', err);
  }
}

document.getElementById('memo-add-btn').addEventListener('click', async () => {
  const input = document.getElementById('memo-input');
  const content = input.value.trim();
  if (!content) return;
  await api('/api/memos', {
    method: 'POST',
    body: JSON.stringify({ content })
  });
  input.value = '';
  loadMemos();
});

async function deleteMemo(id) {
  await api(`/api/memos/${id}`, { method: 'DELETE' });
  loadMemos();
}

// 添加今日计划
document.getElementById('plan-add-btn').addEventListener('click', async () => {
  const input = document.getElementById('plan-input');
  const title = input.value.trim();
  if (!title) return;
  await api('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, date: new Date().toISOString().split('T')[0] })
  });
  input.value = '';
  loadHome();
});

// 搜索功能
function showSearchModal() {
  document.getElementById('search-modal').style.display = 'block';
  document.getElementById('search-input').focus();
}

function closeSearchModal() {
  document.getElementById('search-modal').style.display = 'none';
  document.getElementById('search-results').innerHTML = '';
  document.getElementById('search-input').value = '';
}

async function doSearch() {
  const keyword = document.getElementById('search-input').value.trim();
  if (!keyword) return;
  const cats = await api('/api/cats');
  const results = cats.filter(c => c.name.includes(keyword));
  const resultsDiv = document.getElementById('search-results');
  if (results.length === 0) {
    resultsDiv.innerHTML = '<div style="text-align:center;color:#999;padding:20px;">没有找到相关猫咪</div>';
    return;
  }
  resultsDiv.innerHTML = results.map(c => 
    `<div style="padding:10px;border-bottom:1px solid #eee;cursor:pointer;" onclick="closeSearchModal();switchTab('adoption');showCatDetail(${c.id})">
      <div style="font-weight:600;">${c.name}</div>
      <div style="font-size:12px;color:#666;">${c.status}</div>
    </div>`
  ).join('');
}

// ===== 猫咪列表 =====
async function loadCats(filter = '') {
  try {
    const params = filter ? `?status=${filter}` : '';
    const cats = await api(`/api/cats${params}`);
    const list = document.getElementById('cat-list');
    
    if (cats.length === 0) {
      list.innerHTML = '<div class="empty-text">暂无猫咪</div>';
      return;
    }
    
    list.innerHTML = cats.map(cat => {
      const percent = cat.threshold_points > 0 
        ? Math.min(100, (cat.current_points / cat.threshold_points * 100)).toFixed(0) 
        : 0;
      const statusClass = cat.status === '可领养' ? 'status-available' 
        : cat.status === '住院中' ? 'status-hospital' : 'status-adopted';
      
      return `
        <div class="cat-card" onclick="showCatDetail(${cat.id})">
          <div class="cat-photo" style="background-image: url('${cat.photo || ''}'); background-size: cover; background-position: center;">
            ${cat.photo ? '' : '猫咪照片'}
          </div>
          <div class="cat-info">
            <div class="cat-name">
              ${cat.name}
              <span class="status-badge ${statusClass}">${cat.status}</span>
            </div>
            <div class="cat-meta">${cat.gender} · ${cat.age || '年龄未知'} · ${cat.neutered}</div>
            <div class="progress-bar">
              <div class="progress-fill" style="width:${percent}%"></div>
            </div>
            <div class="progress-text">
              <span>${cat.current_points}/${cat.threshold_points}分</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('加载猫咪列表失败:', err);
  }
}

// 筛选标签
document.querySelectorAll('.filter-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
    tag.classList.add('active');
    loadCats(tag.dataset.filter);
  });
});

// ===== 猫咪详情 =====
async function showCatDetail(catId) {
  currentCatId = catId;
  try {
    const cat = await api(`/api/cats/${catId}`);
    const percent = cat.threshold_points > 0 
      ? Math.min(100, (cat.current_points / cat.threshold_points * 100)).toFixed(0) 
      : 0;
    
    document.getElementById('cat-detail-content').innerHTML = `
      <div class="detail-hero" style="background-image: url('${cat.photo || ''}'); background-size: cover; background-position: center;">
        ${cat.photo ? '' : '猫咪照片'}
      </div>
      <h2 style="font-size:22px;margin-bottom:4px;">${cat.name}</h2>
      <div style="color:#8A8178;font-size:13px;margin-bottom:16px;">${cat.gender} · ${cat.age} · ${cat.location}</div>
      
      <div class="detail-section" style="background:#FFF8EC;border-color:#F2D9A8;">
        <h4 style="color:#8B6914;">领养进度 · 需要${cat.threshold_points}积分</h4>
        <div class="progress-bar" style="background:#F2D9A8;">
          <div class="progress-fill" style="width:${percent}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;color:#8B6914;margin-top:6px;">
          <span>当前 ${cat.current_points}分</span>
        </div>
      </div>
      
      <div class="detail-section">
        <h4>基本情况</h4>
        <div class="detail-row">性别：${cat.gender}</div>
        <div class="detail-row">年龄：${cat.age || '未知'}</div>
        <div class="detail-row">体重：${cat.weight || '未知'}</div>
        <div class="detail-row">绝育：${cat.neutered}</div>
        <div class="detail-row">疫苗：${cat.vaccine || '未知'}</div>
      </div>
      
      <div class="detail-section">
        <h4>履历</h4>
        <div class="detail-row">${cat.story || '暂无记录'}</div>
      </div>
      
      <div class="detail-section">
        <h4>病历</h4>
        <div class="detail-row">${cat.medical || '暂无记录'}</div>
      </div>
      
      <div class="detail-section">
        <h4>现状</h4>
        <div class="detail-row">性格：${cat.personality || '未知'}</div>
        <div class="detail-row">健康：${cat.health || '良好'}</div>
        <div class="detail-row">位置：${cat.location || '未知'}</div>
      </div>
      
      <button class="cta-button" onclick="showFeedingPage()">投喂猫粮攒积分</button>
    `;
    
    switchTab('cat-detail');
  } catch (err) {
    alert('加载猫咪详情失败: ' + err.message);
  }
}

// ===== 投喂页面 =====
let selectedFoodType = '猫粮';
let selectedFoodCount = 1;

const foodPrices = {
  '猫粮': 5,
  '猫条': 2,
  '罐头': 10,
  '饮水': 2
};

const dailyLimits = {
  '猫粮': 3,
  '猫条': 3,
  '罐头': 1,
  '饮水': 3
};

function showFeedingPage() {
  selectedFoodType = '猫粮';
  selectedFoodCount = 1;
  document.getElementById('feeding-content').innerHTML = `
    <div style="text-align:center;padding:20px 0;">
      <div style="width:80px;height:80px;border-radius:50%;background:linear-gradient(135deg,#D4C5B0,#B8A088);margin:0 auto 12px;display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;">🐱</div>
      <div style="font-size:16px;font-weight:600;margin-bottom:4px;">为猫咪投喂食物</div>
      <div style="font-size:12px;color:#8A8178;">每花10元 = 获得1积分</div>
    </div>
    
    <div class="section-title">选择食物种类</div>
    <div class="food-types">
      <div class="food-type selected" data-food="猫粮" onclick="selectFood(this, '猫粮')">
        <div class="food-img" style="background-image:url('assets/food-catfood.jpg');background-size:cover;background-position:center;"></div>
        <div class="food-name">诚实一口猫粮</div>
        <div style="font-size:10px;color:#F2994A;margin-top:2px;">5元/份</div>
      </div>
      <div class="food-type" data-food="猫条" onclick="selectFood(this, '猫条')">
        <div class="food-img" style="background-image:url('assets/food-stick.jpg');background-size:cover;background-position:center;"></div>
        <div class="food-name">诚实一口猫条</div>
        <div style="font-size:10px;color:#F2994A;margin-top:2px;">2元/根</div>
      </div>
      <div class="food-type" data-food="罐头" onclick="selectFood(this, '罐头')">
        <div class="food-img" style="background-image:url('assets/food-can.jpg');background-size:cover;background-position:center;"></div>
        <div class="food-name">诚实一口罐头</div>
        <div style="font-size:10px;color:#F2994A;margin-top:2px;">10元/罐</div>
      </div>
      <div class="food-type" data-food="饮水" onclick="selectFood(this, '饮水')">
        <div class="food-icon">💧</div>
        <div class="food-name">饮水</div>
        <div style="font-size:10px;color:#F2994A;margin-top:2px;">2元/碗</div>
      </div>
    </div>
    
    <div style="background:#FFF8EC;border-radius:8px;padding:10px;font-size:12px;color:#8A8178;margin-bottom:16px;">
      ⚠️ 每日限制：猫粮/猫条/饮水 每天最多3次，罐头每天最多1次
    </div>
    
    <div class="section-title">选择数量</div>
    <div class="count-selector">
      <button class="count-btn" onclick="changeCount(-1)">-</button>
      <div class="count-num" id="food-count">1</div>
      <button class="count-btn" onclick="changeCount(1)">+</button>
    </div>
    
    <div id="feeding-summary" style="background:#fff;border-radius:12px;padding:16px;margin:16px 0;border:1px solid #E8E2D9;">
      <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
        <span>选择：猫粮 × 1</span>
        <span>5元</span>
      </div>
      <div style="display:flex;justify-content:space-between;font-weight:600;color:#F2994A;">
        <span>获得积分</span>
        <span>0.5分</span>
      </div>
    </div>
    
    <button class="cta-button" onclick="submitFeeding()">确认投喂</button>
    <div style="text-align:center;font-size:12px;color:#8A8178;margin-top:10px;">
      提交后等待管理员确认加分
    </div>
  `;
  switchTab('feeding');
  updateFeedingSummary();
}

function selectFood(el, food) {
  document.querySelectorAll('.food-type').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedFoodType = food;
  selectedFoodCount = 1;
  document.getElementById('food-count').textContent = '1';
  updateFeedingSummary();
}

function changeCount(delta) {
  selectedFoodCount = Math.max(1, Math.min(3, selectedFoodCount + delta));
  document.getElementById('food-count').textContent = selectedFoodCount;
  updateFeedingSummary();
}

function updateFeedingSummary() {
  const price = foodPrices[selectedFoodType];
  const totalPrice = price * selectedFoodCount;
  const points = Math.floor(totalPrice / 10 * 10) / 10; // 10元=1积分
  
  document.getElementById('feeding-summary').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span>选择：${selectedFoodType} × ${selectedFoodCount}</span>
      <span>${totalPrice}元</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-weight:600;color:#F2994A;">
      <span>获得积分</span>
      <span>${points}分</span>
    </div>
  `;
}

function selectFeeding(el, points) {
  document.querySelectorAll('.feeding-option').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  selectedFeedingPoints = points;
}

async function submitFeeding() {
  try {
    const price = foodPrices[selectedFoodType];
    const totalPrice = price * selectedFoodCount;
    const points = Math.floor(totalPrice / 10 * 10) / 10;
    
    await api('/api/feeding', {
      method: 'POST',
      body: JSON.stringify({
        cat_id: currentCatId,
        points: points,
        food_type: selectedFoodType,
        food_count: selectedFoodCount,
        amount: totalPrice
      })
    });
    alert(`已提交${selectedFoodType}×${selectedFoodCount}，花费${totalPrice}元，获得${points}积分，等待管理员确认`);
    switchTab('cats');
  } catch (err) {
    alert('提交失败: ' + err.message);
  }
}

function goBackToCatDetail() {
  if (currentCatId) showCatDetail(currentCatId);
  else switchTab('cats');
}

// ===== 救助计划 =====
async function loadTasks() {
  try {
    const tasks = await api('/api/tasks');
    const list = document.getElementById('task-list');
    
    // 按今天/本周分组
    const today = new Date().toISOString().split('T')[0];
    const todayTasks = tasks.filter(t => t.task_date === today && !t.done);
    const otherTasks = tasks.filter(t => !(t.task_date === today && !t.done));
    
    let html = '';
    if (todayTasks.length > 0) {
      html += '<div class="section-title" style="margin-top:8px;">今天</div>';
      html += todayTasks.map(t => renderTask(t)).join('');
    }
    if (otherTasks.length > 0) {
      html += '<div class="section-title" style="margin-top:16px;">其他</div>';
      html += otherTasks.map(t => renderTask(t)).join('');
    }
    if (!html) {
      html = '<div class="empty-text">暂无任务</div>';
    }
    
    list.innerHTML = html;
  } catch (err) {
    console.error('加载任务失败:', err);
  }
}

function renderTask(t) {
  return `
    <div class="task-item">
      <div class="task-check ${t.done ? 'done' : ''}" onclick="toggleTask(${t.id}, ${!t.done})"></div>
      <div>
        <div class="task-title ${t.done ? 'done-text' : ''}">${t.title}</div>
        <div class="task-meta">
          <span class="task-tag">${t.category}</span>
          ${t.task_date}
        </div>
      </div>
    </div>
  `;
}

async function toggleTask(id, done) {
  await api(`/api/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ done })
  });
  loadTasks();
  loadHomeData();
}

document.getElementById('task-add-btn').addEventListener('click', async () => {
  const title = document.getElementById('task-title-input').value.trim();
  const task_date = document.getElementById('task-date-input').value;
  const category = document.getElementById('task-category').value;
  
  if (!title || !task_date) {
    alert('请填写任务标题和日期');
    return;
  }
  
  await api('/api/tasks', {
    method: 'POST',
    body: JSON.stringify({ title, task_date, category })
  });
  
  document.getElementById('task-title-input').value = '';
  loadTasks();
  loadHomeData();
});

// ===== 我的页面 =====
async function loadProfile() {
  try {
    const user = await api('/api/me');
    currentUser = user;
    
    document.getElementById('profile-nickname').textContent = user.nickname;
    document.getElementById('profile-desc').textContent = user.is_admin ? '管理员' : '领养人';
    document.getElementById('profile-points').textContent = user.points;
    
    // 管理员显示后台入口
    document.querySelectorAll('.admin-only').forEach(el => {
      el.style.display = user.is_admin ? 'flex' : 'none';
    });
  } catch (err) {
    console.error('加载用户信息失败:', err);
  }
}

function showMyFeedings() {
  switchTab('my-feedings');
}

async function loadMyFeedings() {
  try {
    const records = await api('/api/feeding/my');
    const list = document.getElementById('my-feeding-list');
    
    if (records.length === 0) {
      list.innerHTML = '<div class="empty-text">还没有投喂记录</div>';
      return;
    }
    
    list.innerHTML = records.map(r => `
      <div class="feeding-record-item">
        <div>
          <div>${r.cat_name}</div>
          <div style="font-size:11px;color:#8A8178;">${r.created_at}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:#F2994A;font-weight:600;">+${r.points}分</div>
          <div style="font-size:11px;color:#8A8178;">${r.status}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('加载投喂记录失败:', err);
  }
}

function showMyCats() {
  alert('开发中');
}

// ===== 管理员后台 =====
function showAdminPanel() {
  switchTab('admin');
}

async function loadAdminData() {
  try {
    const records = await api('/api/feeding/pending');
    const list = document.getElementById('pending-feeding-list');
    
    if (records.length === 0) {
      list.innerHTML = '<div class="empty-text">暂无待确认投喂</div>';
      return;
    }
    
    list.innerHTML = records.map(r => `
      <div class="feeding-record-item">
        <div>
          <div>${r.user_name} → ${r.cat_name}</div>
          <div style="font-size:11px;color:#8A8178;">${r.created_at}</div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span style="color:#F2994A;font-weight:600;">+${r.points}分</span>
          <button class="btn-small" onclick="confirmFeeding(${r.id})">确认</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('加载待确认投喂失败:', err);
  }
}

async function confirmFeeding(id) {
  try {
    await api(`/api/feeding/${id}/confirm`, { method: 'POST' });
    loadAdminData();
    loadProfile();
  } catch (err) {
    alert('确认失败: ' + err.message);
  }
}

function showAddCatForm() {
  alert('开发中');
}

// ===== 数据导出导入 =====
async function exportData() {
  try {
    const data = await api('/api/admin/export');
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `llmrj-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  } catch (err) {
    alert('导出失败: ' + err.message);
  }
}

async function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  if (!confirm('导入将覆盖当前所有数据，确认继续？')) return;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      await api('/api/admin/import', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      alert('导入成功');
      loadAdminData();
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// ===== 附近猫窝 =====
function showCatHouses() {
  switchTab('cat-houses');
}

async function loadCatHouses() {
  try {
    const houses = await api('/api/cat-houses');
    const list = document.getElementById('cat-house-list');
    
    if (houses.length === 0) {
      list.innerHTML = '<div class="empty-text">暂无猫窝信息</div>';
      return;
    }
    
    list.innerHTML = houses.map(h => `
      <div class="house-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div class="house-name">${h.name}</div>
          <button class="btn-nav" onclick="openNavigation('${h.location}')">🧭 导航</button>
        </div>
        <div class="house-row">📍 位置：${h.location}</div>
        ${h.manager ? `<div class="house-row">👤 负责人：${h.manager}</div>` : ''}
        ${h.feed_frequency ? `<div class="house-row">🍽️ 投喂频率：${h.feed_frequency}</div>` : ''}
        ${h.notes ? `<div class="house-row">📝 备注：${h.notes}</div>` : ''}
      </div>
    `).join('');
  } catch (err) {
    console.error('加载猫窝失败:', err);
  }
}

// 摸猫咪
function patCat() {
  const cat = document.getElementById('walking-cat');
  cat.querySelector('.cat-body').textContent = '😻';
  setTimeout(() => {
    cat.querySelector('.cat-body').textContent = '🐱';
  }, 1000);
  
  // 随机跑一下
  const randomX = Math.random() * 100 - 50;
  cat.style.transform = `translateX(${randomX}px)`;
}

// 快捷放粮
function quickFeed() {
  alert('已记录：操场边猫窝放粮一次！🐱');
}

// 打开地图导航
function openNavigation(location) {
  // 用高德地图网页版搜索位置
  const url = `https://uri.amap.com/search?keyword=${encodeURIComponent(location)}&callnative=1`;
  window.open(url, '_blank');
}

// ===== 积分商城 =====
const shopItems = [
  { name: '猫窝', icon: '🏠', price: 3, desc: '柔软保暖猫窝一个' },
  { name: '逗猫棒', icon: '🎣', price: 1, desc: '羽毛逗猫棒一根' },
  { name: '猫薄荷', icon: '🌿', price: 2, desc: '天然猫薄荷一包' },
  { name: '猫抓板', icon: '📦', price: 2, desc: '瓦楞纸猫抓板' },
  { name: '小老鼠玩具', icon: '🐭', price: 1, desc: '毛绒小老鼠玩具' },
  { name: '猫罐头', icon: '🥫', price: 3, desc: '诚实一口主食罐' },
  { name: '猫条', icon: '🥩', price: 1, desc: '诚实一口猫条3根' },
  { name: '围巾', icon: '🧣', price: 2, desc: '可爱猫咪小围巾' }
];

async function loadShopPage() {
  try {
    const user = await api('/api/me');
    const content = document.getElementById('shop-content');
    
    let html = `
      <div style="background:linear-gradient(135deg,#FFF8E1,#FFECB3);border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;">
        <div style="font-size:13px;color:#8A8178;">我的积分</div>
        <div style="font-size:28px;font-weight:700;color:#F2994A;">${user.points} 分</div>
      </div>
    `;
    
    html += '<div class="shop-grid">';
    shopItems.forEach(item => {
      const enough = user.points >= item.price;
      html += `
        <div class="shop-item">
          <div class="shop-icon">${item.icon}</div>
          <div class="shop-name">${item.name}</div>
          <div class="shop-desc">${item.desc}</div>
          <div class="shop-price">${item.price} 积分</div>
          <button class="btn-exchange" ${enough ? '' : 'disabled'} onclick="${enough ? `exchangeItem('${item.name}', ${item.price})` : ''}">
            ${enough ? '兑换' : '积分不足'}
          </button>
        </div>
      `;
    });
    html += '</div>';
    
    content.innerHTML = html;
  } catch (err) {
    alert('加载商城失败: ' + err.message);
  }
}

function exchangeItem(name, price) {
  alert(`兑换成功！${name} 将在3个工作日内寄出，扣除${price}积分`);
  switchTab('home');
}

// ===== 积分兑换领养 =====
function showAdoptionApply() {
  switchTab('adoption-apply');
  loadAdoptionPage();
}

async function loadAdoptionPage() {
  try {
    const cats = await api('/api/cats?status=可领养');
    const user = await api('/api/me');
    
    let html = '';
    
    if (cats.length === 0) {
      html = '<div class="empty-text">暂时没有可领养的猫咪</div>';
    } else {
      html = cats.map(c => {
        const enough = user.points >= c.threshold_points;
        return `
          <div class="adopt-cat-item">
            <div class="adopt-cat-photo" style="background-image: url('${c.photo || ''}');">
              ${c.photo ? '' : '猫'}
            </div>
            <div class="adopt-cat-info">
              <div class="adopt-cat-name">${c.name}</div>
              <div class="adopt-cat-meta">${c.gender} · ${c.age || '年龄未知'} · ${c.neutered} · 需要${c.threshold_points}分</div>
            </div>
            <button class="btn-adopt" ${enough ? '' : 'disabled'} onclick="${enough ? `confirmApply(${c.id})` : ''}">
              ${enough ? '申请领养' : '积分不足'}
            </button>
          </div>
        `;
      }).join('');
    }
    
    document.getElementById('adoption-content').innerHTML = html;
  } catch (err) {
    alert('加载失败: ' + err.message);
  }
}

async function confirmApply(catId) {
  if (!confirm('确认提交领养申请？提交后管理员会审核')) return;
  try {
    await api('/api/adoption/apply', {
      method: 'POST',
      body: JSON.stringify({ cat_id: catId, message: '' })
    });
    alert('申请已提交，等待管理员审核');
    switchTab('home');
  } catch (err) {
    alert('提交失败: ' + err.message);
  }
}

// ===== 志愿者填报 =====
function showVolunteerApply() {
  switchTab('volunteer');
}

async function submitVolunteer() {
  const name = document.getElementById('vol-name').value.trim();
  const phone = document.getElementById('vol-phone').value.trim();
  const available_time = document.getElementById('vol-time').value.trim();
  const skills = document.getElementById('vol-skills').value.trim();
  const notes = document.getElementById('vol-notes').value.trim();
  
  if (!name || !phone) {
    alert('请填写称呼和联系方式');
    return;
  }
  
  try {
    await api('/api/volunteer/apply', {
      method: 'POST',
      body: JSON.stringify({ name, phone, available_time, skills, notes })
    });
    alert('志愿者申请已提交，我们会尽快联系你~');
    switchTab('home');
  } catch (err) {
    alert('提交失败: ' + err.message);
  }
}

// ===== 初始化 =====
window.onload = function() {
  const savedUserId = localStorage.getItem('userId');
  if (savedUserId) {
    // 尝试自动登录
    fetch('/api/me', { headers: { 'x-user-id': savedUserId } })
      .then(r => r.json())
      .then(user => {
        if (user.id) {
          loginSuccess(user);
        }
      })
      .catch(() => {
        localStorage.removeItem('userId');
      });
  }
};
