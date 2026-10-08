/* حساب من — Personal Accounting PWA */

'use strict';

const DB_NAME = 'hesabman-db';
const DB_VERSION = 1;
const STORE = 'kv';

const Storage = {
  _db: null,
  _useLocal: false,

  async init() {
    if (!('indexedDB' in window)) {
      this._useLocal = true;
      return;
    }
    try {
      this._db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      console.warn('IndexedDB unavailable, using localStorage', e);
      this._useLocal = true;
    }
  },

  async get(key) {
    if (this._useLocal || !this._db) {
      const v = localStorage.getItem(key);
      return v == null ? null : JSON.parse(v);
    }
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result === undefined ? null : req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async set(key, value) {
    if (this._useLocal || !this._db) {
      localStorage.setItem(key, JSON.stringify(value));
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
};

const DEFAULT_CATEGORIES = [
  'خوراکی', 'نوشابه', 'خرید', 'حمل‌ونقل', 'قبض',
  'اجاره', 'درمان', 'تفریح', 'رستوران', 'کافه', 'سایر'
];

const INCOME_SOURCES = [
  'حقوق', 'فروش', 'هدیه', 'سرمایه‌گذاری', 'سایر'
];

const State = {
  transactions: [],
  categories: [...DEFAULT_CATEGORIES],
  editingId: null,
  currentPeriod: 'daily',
  filters: { search: '', type: '', category: '', min: 0, max: Infinity },
  voiceParsed: null
};

function toLatinDigits(str) {
  if (str == null) return '';
  return String(str)
    .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
    .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
}

function toFaDigits(str) {
  const fa = '۰۱۲۳۴۵۶۷۸۹';
  return String(str).replace(/\d/g, d => fa[+d]);
}

function formatNumber(n) {
  if (n == null || isNaN(n)) return '0';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(Math.round(n));
  return sign + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatMoney(n) {
  return toFaDigits(formatNumber(n)) + ' تومان';
}

function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
    + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
  return [jy, jm, jd];
}

function jalaliToGregorian(jy, jm, jd) {
  jy += 1595;
  let days = -355668 + (365 * jy) + (Math.floor(jy / 33) * 8) + Math.floor(((jy % 33) + 3) / 4) + jd
    + ((jm < 7) ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || (gy % 400 === 0)) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return [gy, gm, gd];
}

function todayJalali() {
  const now = new Date();
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate())
    .map((v, i) => i === 0 ? v : String(v).padStart(2, '0'))
    .join('/');
}

function todayTime() {
  const d = new Date();
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function toast(msg, ms) {
  ms = ms || 2000;
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), ms);
}

async function loadState() {
  try {
    const txs = await Storage.get('transactions');
    if (Array.isArray(txs)) State.transactions = txs;
    const cats = await Storage.get('categories');
    if (Array.isArray(cats) && cats.length) State.categories = cats;
  } catch (e) {
    console.error('خطا در بارگذاری:', e);
  }
}

async function saveTransactions() {
  await Storage.set('transactions', State.transactions);
}

async function saveCategories() {
  await Storage.set('categories', State.categories);
}

function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.body.classList.toggle('voice-view', name === 'voice');
  document.body.classList.toggle('form-view', name === 'form');
  const nav = document.getElementById('bottom-nav');
  nav.classList.toggle('hidden', name !== 'home' && name !== 'reports');
  nav.querySelectorAll('button').forEach(b => {
    b.classList.toggle('active', b.dataset.action === name);
  });
  window.scrollTo(0, 0);
}

function computeBalance() {
  let bal = 0;
  for (const t of State.transactions) {
    bal += t.type === 'income' ? +t.amount : -t.amount;
  }
  return bal;
}

function computeToday() {
  const today = todayJalali();
  let inc = 0, exp = 0;
  for (const t of State.transactions) {
    if (t.date === today) {
      if (t.type === 'income') inc += +t.amount;
      else exp += +t.amount;
    }
  }
  return { inc: inc, exp: exp };
}

function renderHome() {
  document.getElementById('balance-value').textContent = formatMoney(computeBalance());
  const today = computeToday();
  document.getElementById('today-income').textContent = formatMoney(today.inc);
  document.getElementById('today-expense').textContent = formatMoney(today.exp);

  const sorted = [...State.transactions].sort(function (a, b) {
    return (b.createdAt || 0) - (a.createdAt || 0);
  }).slice(0, 5);
  renderTxList(document.getElementById('recent-list'), sorted, 'هنوز تراکنشی ثبت نشده است');
}

function renderTxList(container, list, emptyMsg) {
  container.innerHTML = '';
  if (!list.length) {
    const p = document.createElement('div');
    p.className = 'empty-state';
    p.textContent = emptyMsg;
    container.appendChild(p);
    return;
  }
  const sorted = [...list].sort(function (a, b) {
    const d = (b.date || '').localeCompare(a.date || '');
    if (d !== 0) return d;
    return (b.time || '').localeCompare(a.time || '');
  });

  for (const t of sorted) {
    container.appendChild(buildTxItem(t));
  }
}

function buildTxItem(t) {
  const div = document.createElement('div');
  div.className = 'tx-item';
  div.dataset.id = t.id;

  const info = document.createElement('div');
  info.className = 'tx-info';

  const title = document.createElement('div');
  title.className = 'tx-title';
  title.textContent = t.title || (t.type === 'income' ? 'درآمد' : 'هزینه');

  const meta = document.createElement('div');
  meta.className = 'tx-meta';
  const parts = [];
  if (t.date) parts.push(toFaDigits(t.date));
  if (t.time) parts.push(toFaDigits(t.time));
  if (t.category) parts.push(t.category);
  meta.textContent = parts.join(' • ');

  info.appendChild(title);
  info.appendChild(meta);

  const amount = document.createElement('div');
  amount.className = 'tx-amount ' + t.type;
  amount.textContent = (t.type === 'income' ? '+' : '−') + formatMoney(t.amount).replace(' تومان', '');
  const unit = document.createElement('small');
  unit.style.marginRight = '4px';
  unit.style.fontSize = '11px';
  unit.style.opacity = '.7';
  unit.textContent = 'تومان';
  amount.appendChild(unit);

  div.appendChild(info);
  div.appendChild(amount);

  div.addEventListener('click', function () { openEditForm(t.id); });
  return div;
}

function openAddForm(type) {
  State.editingId = null;
  document.getElementById('tx-id').value = '';
  document.getElementById('tx-type').value = type;
  document.getElementById('form-title').textContent = type === 'expense' ? 'ثبت هزینه' : 'ثبت درآمد';
  document.getElementById('tx-title-label').textContent = type === 'expense' ? 'عنوان / شرح' : 'منبع درآمد';
  document.getElementById('tx-amount').value = '';
  document.getElementById('tx-title').value = '';
  document.getElementById('tx-date').value = todayJalali();
  document.getElementById('tx-time').value = todayTime();
  document.getElementById('tx-note').value = '';
  document.getElementById('delete-tx-btn').classList.add('hidden');

  const catField = document.getElementById('category-field');
  const catSelect = document.getElementById('tx-category');
  catField.classList.remove('hidden');
  catSelect.innerHTML = '';

  if (type === 'expense') {
    for (const c of State.categories) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      catSelect.appendChild(opt);
    }
  } else {
    for (const c of INCOME_SOURCES) {
      const opt = document.createElement('option');
      opt.value = c; opt.textContent = c;
      catSelect.appendChild(opt);
    }
  }

  showView('form');
}

function openEditForm(id) {
  const t = State.transactions.find(function (x) { return x.id === id; });
  if (!t) return;
  State.editingId = id;
  document.getElementById('tx-id').value = id;
  document.getElementById('tx-type').value = t.type;
  document.getElementById('form-title').textContent = t.type === 'expense' ? 'ویرایش هزینه' : 'ویرایش درآمد';
  document.getElementById('tx-title-label').textContent = t.type === 'expense' ? 'عنوان / شرح' : 'منبع درآمد';
  document.getElementById('tx-amount').value = String(t.amount);
  document.getElementById('tx-title').value = t.title || '';
  document.getElementById('tx-date').value = t.date || todayJalali();
  document.getElementById('tx-time').value = t.time || todayTime();
  document.getElementById('tx-note').value = t.note || '';
  document.getElementById('delete-tx-btn').classList.remove('hidden');

  const catSelect = document.getElementById('tx-category');
  catSelect.innerHTML = '';
  const list = t.type === 'expense' ? State.categories : INCOME_SOURCES;
  for (const c of list) {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    if (c === t.category) opt.selected = true;
    catSelect.appendChild(opt);
  }

  showView('form');
}

async function submitForm(e) {
  e.preventDefault();
  const amountRaw = toLatinDigits(document.getElementById('tx-amount').value).replace(/[^\d.-]/g, '');
  const amount = Math.abs(parseFloat(amountRaw));
  if (!amount || isNaN(amount)) { toast('مبلغ معتبر وارد کنید'); return; }

  const title = document.getElementById('tx-title').value.trim();
  if (!title) { toast('عنوان را وارد کنید'); return; }

  const category = document.getElementById('tx-category').value;
  const date = toLatinDigits(document.getElementById('tx-date').value).trim() || todayJalali();
  const time = toLatinDigits(document.getElementById('tx-time').value).trim() || todayTime();
  const note = document.getElementById('tx-note').value.trim();
  const type = document.getElementById('tx-type').value;

  if (State.editingId) {
    const t = State.transactions.find(function (x) { return x.id === State.editingId; });
    if (t) {
      t.amount = amount;
      t.title = title;
      t.category = category;
      t.date = date;
      t.time = time;
      t.note = note;
      t.type = type;
    }
    toast('تراکنش ویرایش شد');
  } else {
    State.transactions.push({
      id: uid(), type: type, amount: amount, title: title,
      category: category, date: date, time: time, note: note,
      createdAt: Date.now()
    });
    toast('تراکنش ثبت شد');
  }

  await saveTransactions();
  renderHome();
  showView('home');
}

async function deleteCurrentTx() {
  if (!State.editingId) return;
  if (!confirm('این تراکنش حذف شود؟')) return;
  State.transactions = State.transactions.filter(function (x) { return x.id !== State.editingId; });
  await saveTransactions();
  toast('حذف شد');
  renderHome();
  showView('home');
}

function getPeriodRange(period) {
  const today = todayJalali();
  const parts = today.split('/').map(Number);
  const jy = parts[0], jm = parts[1];

  if (period === 'daily') return { from: today, to: today };
  if (period === 'weekly') {
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
    const j = gregorianToJalali(from.getFullYear(), from.getMonth() + 1, from.getDate());
    return {
      from: j[0] + '/' + String(j[1]).padStart(2, '0') + '/' + String(j[2]).padStart(2, '0'),
      to: today
    };
  }
  if (period === 'monthly') {
    return {
      from: jy + '/' + String(jm).padStart(2, '0') + '/01',
      to: today
    };
  }
  return { from: '0000/00/00', to: '9999/99/99' };
}

function applyFilters(list) {
  const f = State.filters;
  return list.filter(function (t) {
    if (f.type && t.type !== f.type) return false;
    if (f.category && t.category !== f.category) return false;
    if (f.min && +t.amount < f.min) return false;
    if (f.max !== Infinity && +t.amount > f.max) return false;
    if (f.search) {
      const s = f.search.toLowerCase();
      const hay = ((t.title || '') + ' ' + (t.note || '') + ' ' + (t.category || '')).toLowerCase();
      if (hay.indexOf(s) === -1) return false;
    }
    return true;
  });
}

function renderReports() {
  const catFilter = document.getElementById('filter-category');
  const current = catFilter.value;
  catFilter.innerHTML = '<option value="">همه دسته‌ها</option>';
  for (const c of State.categories) {
    const opt = document.createElement('option');
    opt.value = c; opt.textContent = c;
    catFilter.appendChild(opt);
  }
  if (current) catFilter.value = current;

  const range = getPeriodRange(State.currentPeriod);
  const inPeriod = State.transactions.filter(function (t) {
    return t.date >= range.from && t.date <= range.to;
  });
  const filtered = applyFilters(inPeriod);

  let inc = 0, exp = 0;
  for (const t of filtered) {
    if (t.type === 'income') inc += +t.amount;
    else exp += +t.amount;
  }

  document.getElementById('rep-income').textContent = formatMoney(inc);
  document.getElementById('rep-expense').textContent = formatMoney(exp);
  document.getElementById('rep-balance').textContent = formatMoney(inc - exp);

  renderCategoryBreakdown(filtered);
  renderTxList(document.getElementById('report-list'), filtered, 'تراکنشی در این بازه یافت نشد');
}

function renderCategoryBreakdown(list) {
  const container = document.getElementById('category-breakdown');
  const byCat = {};
  let total = 0;
  for (const t of list) {
    if (t.type !== 'expense') continue;
    byCat[t.category] = (byCat[t.category] || 0) + +t.amount;
    total += +t.amount;
  }
  container.innerHTML = '';
  if (!total) return;
  const h = document.createElement('h3');
  h.textContent = 'هزینه بر اساس دسته‌بندی';
  container.appendChild(h);
  const entries = Object.keys(byCat).map(function (k) { return [k, byCat[k]]; })
    .sort(function (a, b) { return b[1] - a[1]; });
  for (const pair of entries) {
    const cat = pair[0], amt = pair[1];
    const row = document.createElement('div');
    row.className = 'cat-row';
    const left = document.createElement('div');
    left.style.flex = '1';
    left.style.minWidth = '0';
    const catName = document.createElement('div');
    catName.textContent = cat;
    const bar = document.createElement('div');
    bar.className = 'cat-bar';
    bar.style.width = (amt / total * 100).toFixed(0) + '%';
    left.appendChild(catName);
    left.appendChild(bar);
    const right = document.createElement('div');
    right.textContent = formatMoney(amt);
    right.style.fontWeight = '600';
    right.style.marginRight = '10px';
    row.appendChild(left);
    row.appendChild(right);
    container.appendChild(row);
  }
}

function parseVoiceText(rawText) {
  const text = toLatinDigits(rawText);
  const lower = text.toLowerCase();

  let type = 'expense';
  const incomeWords = ['درآمد', 'دریافت', 'فروش', 'حقوق', 'گرفتم', 'واریز', 'درامد'];
  const expenseWords = ['هزینه', 'خرید', 'پرداخت', 'دادم', 'خرج', 'خریدم'];
  let hasIncome = false, hasExpense = false;
  for (const w of incomeWords) if (lower.indexOf(w) !== -1) hasIncome = true;
  for (const w of expenseWords) if (lower.indexOf(w) !== -1) hasExpense = true;

  if (hasIncome && !hasExpense) type = 'income';
  else if (hasExpense && !hasIncome) type = 'expense';
  else if (hasIncome) type = 'income';

  let amount = 0;
  const numMatch = text.match(/(\d[\d,\.]*)/g);
  if (numMatch) {
    const candidates = numMatch.map(function (s) {
      return { raw: s, v: parseFloat(s.replace(/[,\.]/g, '')) };
    }).filter(function (o) { return !isNaN(o.v) && o.v > 0; });
    if (candidates.length) {
      candidates.sort(function (a, b) { return b.v - a.v; });
      amount = candidates[0].v;
    }
  }

  const wordNums = {
    'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5,
    'شش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10,
    'صد': 100, 'هزار': 1000, 'میلیون': 1000000, 'میلیارد': 1000000000
  };

  if (!amount) {
    let temp = 0, total = 0;
    const tokens = text.split(/\s+/);
    for (const tk of tokens) {
      if (wordNums[tk] != null) {
        const val = wordNums[tk];
        if (val === 1000 || val === 1000000 || val === 1000000000) {
          temp = (temp || 1) * val;
          total += temp;
          temp = 0;
        } else if (val === 100) {
          temp = (temp || 1) * 100;
        } else {
          temp += val;
        }
      }
    }
    total += temp;
    if (total > 0) amount = total;
  }

  if (amount > 0) {
    if (/میلیارد/.test(text)) amount *= 1000000000;
    else if (/میلیون/.test(text)) amount *= 1000000;
    else if (/هزار/.test(text)) amount *= 1000;
  }

  let category = '';
  const catKeywords = {
    'خوراکی': ['خوراکی', 'غذا', 'میوه', 'سبزی', 'گوشت', 'مرغ', 'برنج', 'نان', 'مواد غذایی', 'موادغذایی', 'سوپر'],
    'نوشابه': ['نوشابه', 'آبمیوه', 'دوغ', 'نوشیدنی'],
    'خرید': ['خرید', 'لباس', 'کفش', 'پوشاک'],
    'حمل‌ونقل': ['تاکسی', 'اسنپ', 'بنزین', 'مترو', 'اتوبوس', 'حمل', 'کرایه'],
    'قبض': ['قبض', 'برق', 'گاز', 'آب', 'تلفن', 'اینترنت'],
    'اجاره': ['اجاره', 'رهن'],
    'درمان': ['دارو', 'دکتر', 'پزشک', 'درمان', 'بیمارستان', 'داروخانه'],
    'تفریح': ['تفریح', 'سینما', 'بازی', 'پارک', 'سفر'],
    'رستوران': ['رستوران', 'غذاخوری'],
    'کافه': ['کافه', 'قهوه', 'چای']
  };

  for (const cat in catKeywords) {
    const words = catKeywords[cat];
    for (const w of words) {
      if (lower.indexOf(w) !== -1) { category = cat; break; }
    }
    if (category) break;
  }

  if (type === 'income') {
    const srcs = ['حقوق', 'فروش', 'هدیه', 'سرمایه‌گذاری', 'درآمد'];
    for (const src of srcs) {
      if (lower.indexOf(src) !== -1) { category = src; break; }
    }
    if (category === 'درآمد') category = 'سایر';
    if (!category) category = 'سایر';
  } else if (!category) {
    category = 'سایر';
  }

  let title = '';
  const aboutMatch = text.match(/بابت\s+(.+?)(?:\s+(?:هزینه|خرید|پرداخت|دادم|کردم|درآمد|دریافت|داشتم)|$)/);
  if (aboutMatch) title = aboutMatch[1].trim();
  if (!title) {
    const afterMatch = text.match(/(?:هزینه|خرید|پرداخت|درآمد|دریافت)\s+(.+?)(?:\s+(?:کردم|دادم|داشتم)|$)/);
    if (afterMatch) title = afterMatch[1].trim();
  }
  if (!title) title = category;
  title = title.replace(/\s*(کردم|دادم|داشتم|هزینه|خرید|پرداخت)\s*$/g, '').trim() || category;

  return {
    type: type,
    amount: amount,
    title: title,
    category: category,
    date: todayJalali(),
    time: todayTime()
  };
}

function handleVoiceResult(text) {
  document.getElementById('voice-status').textContent = 'متن تشخیص داده شد:';
  const result = document.getElementById('voice-result');
  result.classList.remove('hidden');
  document.getElementById('voice-text').textContent = '«' + text + '»';

  const parsed = parseVoiceText(text);
  State.voiceParsed = parsed;

  const preview = document.getElementById('voice-preview');
  preview.innerHTML = '';
  const rows = [
    ['نوع', parsed.type === 'income' ? 'درآمد' : 'هزینه'],
    ['مبلغ', parsed.amount ? formatMoney(parsed.amount) : '—'],
    ['عنوان', parsed.title || '—'],
    ['دسته/منبع', parsed.category || '—'],
    ['تاریخ', parsed.date || '—'],
    ['ساعت', parsed.time || '—']
  ];
  for (const pair of rows) {
    const div = document.createElement('div');
    div.innerHTML = '<span style="color:var(--muted)">' + pair[0] + ': </span><b>' + pair[1] + '</b>';
    preview.appendChild(div);
  }
}

async function confirmVoice() {
  const p = State.voiceParsed;
  if (!p || !p.amount) {
    toast('مبلغ تشخیص داده نشد. لطفاً دستی وارد کنید.');
    const type = p ? p.type : 'expense';
    openAddForm(type);
    if (p) {
      setTimeout(function () {
        document.getElementById('tx-title').value = p.title || '';
      }, 50);
    }
    return;
  }

  State.transactions.push({
    id: uid(),
    type: p.type,
    amount: p.amount,
    title: p.title,
    category: p.category,
    date: p.date,
    time: p.time,
    note: 'ثبت صوتی',
    createdAt: Date.now()
  });
  await saveTransactions();
  renderHome();
  toast('تراکنش صوتی ثبت شد');

  State.voiceParsed = null;
  document.getElementById('voice-result').classList.add('hidden');
  document.getElementById('voice-status').textContent = 'برای شروع صحبت، دکمه را لمس کنید';
  showView('home');
}

function initVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    document.getElementById('voice-status').textContent =
      'مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند. لطفاً از Safari در iPhone استفاده کنید.';
    document.getElementById('mic-btn').disabled = true;
    document.getElementById('mic-btn').style.opacity = '.4';
    return;
  }

  const rec = new SR();
  rec.lang = 'fa-IR';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.continuous = false;

  const micBtn = document.getElementById('mic-btn');
  const status = document.getElementById('voice-status');
  let listening = false;

  micBtn.addEventListener('click', function () {
    if (listening) { rec.stop(); return; }
    document.getElementById('voice-result').classList.add('hidden');
    try { rec.start(); } catch (e) { toast('خطا در شروع ضبط'); }
  });

  rec.onstart = function () {
    listening = true;
    micBtn.classList.add('listening');
    status.textContent = '🎙 در حال گوش دادن...';
  };

  rec.onerror = function (e) {
    listening = false;
    micBtn.classList.remove('listening');
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      status.textContent = 'دسترسی به میکروفون داده نشد';
    } else if (e.error === 'no-speech') {
      status.textContent = 'صدایی شنیده نشد، دوباره تلاش کنید';
    } else {
      status.textContent = 'خطا: ' + e.error;
    }
  };

  rec.onend = function () {
    listening = false;
    micBtn.classList.remove('listening');
    if (status.textContent.indexOf('🎙') === 0) {
      status.textContent = 'برای شروع صحبت، دکمه را لمس کنید';
    }
  };

  rec.onresult = function (e) {
    const text = e.results[0][0].transcript;
    handleVoiceResult(text);
  };
}

async function exportBackup() {
  const data = {
    app: 'hesab-man',
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions: State.transactions,
    categories: State.categories
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = todayJalali().replace(/\//g, '-');
  a.download = 'hesab-man-backup-' + stamp + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(function () {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
  toast('فایل پشتیبان ساخته شد');
}

async function importBackup(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.transactions)) {
      toast('فایل نامعتبر است');
      return;
    }
    if (!confirm('اطلاعات فعلی با فایل پشتیبان جایگزین شود؟')) return;
    State.transactions = data.transactions.map(function (t) {
      return {
        id: t.id || uid(),
        type: t.type === 'income' ? 'income' : 'expense',
        amount: Math.abs(+t.amount) || 0,
        title: t.title || '',
        category: t.category || 'سایر',
        date: t.date || todayJalali(),
        time: t.time || '',
        note: t.note || '',
        createdAt: t.createdAt || Date.now()
      };
    });
    if (Array.isArray(data.categories) && data.categories.length) {
      const set = {};
      for (const c of DEFAULT_CATEGORIES) set[c] = true;
      for (const c of data.categories) set[c] = true;
      State.categories = Object.keys(set);
    }
    await saveTransactions();
    await saveCategories();
    renderHome();
    renderReports();
    toast('اطلاعات وارد شد');
  } catch (e) {
    console.error(e);
    toast('خطا در خواندن فایل');
  }
}

async function clearAll() {
  if (!confirm('تمام تراکنش‌ها حذف شوند؟ این کار قابل بازگشت نیست.')) return;
  if (!confirm('مطمئن هستید؟ یک بار دیگر تأیید کنید.')) return;
  State.transactions = [];
  await saveTransactions();
  renderHome();
  renderReports();
  toast('همه اطلاعات حذف شد');
}

async function addNewCategory() {
  const name = prompt('نام دسته‌بندی جدید:');
  if (!name) return;
  const clean = name.trim();
  if (!clean) return;
  if (State.categories.indexOf(clean) !== -1) { toast('این دسته قبلاً وجود دارد'); return; }
  State.categories.push(clean);
  await saveCategories();
  const sel = document.getElementById('tx-category');
  const opt = document.createElement('option');
  opt.value = clean; opt.textContent = clean;
  opt.selected = true;
  sel.appendChild(opt);
  toast('دسته‌بندی اضافه شد');
}

async function init() {
  await Storage.init();
  await loadState();

  document.body.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'home') { renderHome(); showView('home'); }
    else if (action === 'add-expense') openAddForm('expense');
    else if (action === 'add-income') openAddForm('income');
