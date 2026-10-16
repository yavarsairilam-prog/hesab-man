/* حساب من — نسخه ساده و مطمئن */
(function () {
  'use strict';

  var STORAGE_KEY = 'hesabman_transactions_v1';
  var CATS_KEY = 'hesabman_categories_v1';

  var DEFAULT_CATEGORIES = [
    'خوراکی', 'نوشابه', 'خرید', 'حمل‌ونقل', 'قبض',
    'اجاره', 'درمان', 'تفریح', 'رستوران', 'کافه', 'سایر'
  ];

  var INCOME_SOURCES = [
    'حقوق', 'فروش', 'هدیه', 'سرمایه‌گذاری', 'سایر'
  ];

  var state = {
    transactions: [],
    categories: DEFAULT_CATEGORIES.slice(),
    editingId: null,
    currentPeriod: 'daily',
    filters: { search: '', type: '', category: '', min: 0, max: 0 }
  };

  /* ---------- ابزارها ---------- */

  function toLatinDigits(str) {
    if (str == null) return '';
    var s = String(str);
    var fa = '۰۱۲۳۴۵۶۷۸۹';
    var ar = '٠١٢٣٤٥٦٧٨٩';
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var fi = fa.indexOf(c);
      var ai = ar.indexOf(c);
      if (fi >= 0) out += fi;
      else if (ai >= 0) out += ai;
      else out += c;
    }
    return out;
  }

  function toFaDigits(str) {
    var fa = '۰۱۲۳۴۵۶۷۸۹';
    var s = String(str);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      var n = c.charCodeAt(0) - 48;
      if (n >= 0 && n <= 9) out += fa.charAt(n);
      else out += c;
    }
    return out;
  }

  function formatNumber(n) {
    if (n == null || isNaN(n)) return '0';
    var sign = n < 0 ? '-' : '';
    var abs = Math.abs(Math.round(n));
    var s = abs.toString();
    var out = '';
    var count = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      out = s.charAt(i) + out;
      count++;
      if (count === 3 && i > 0) {
        out = ',' + out;
        count = 0;
      }
    }
    return sign + out;
  }

  function formatMoney(n) {
    return toFaDigits(formatNumber(n)) + ' تومان';
  }

  /* ---------- تاریخ شمسی ---------- */

  function gregorianToJalali(gy, gm, gd) {
    var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    var gy2 = (gm > 2) ? (gy + 1) : gy;
    var days = (365 * gy) + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100)
      + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      jy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    var jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    var jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return [jy, jm, jd];
  }

  function todayJalali() {
    var now = new Date();
    var j = gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    return j[0] + '/' + pad2(j[1]) + '/' + pad2(j[2]);
  }

  function todayTime() {
    var d = new Date();
    return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  function pad2(n) {
    return n < 10 ? '0' + n : '' + n;
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- ذخیره‌سازی ---------- */

  function loadData() {
    try {
      var t = localStorage.getItem(STORAGE_KEY);
      if (t) {
        var parsed = JSON.parse(t);
        if (Array.isArray(parsed)) state.transactions = parsed;
      }
      var c = localStorage.getItem(CATS_KEY);
      if (c) {
        var cats = JSON.parse(c);
        if (Array.isArray(cats) && cats.length) state.categories = cats;
      }
    } catch (e) {
      console.error('خطا در بارگذاری:', e);
    }
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.transactions));
      localStorage.setItem(CATS_KEY, JSON.stringify(state.categories));
    } catch (e) {
      console.error('خطا در ذخیره:', e);
    }
  }

  /* ---------- کمکی ---------- */

  function $(id) { return document.getElementById(id); }

  function toast(msg) {
    var el = $('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  /* ---------- محاسبات ---------- */

  function computeBalance() {
    var bal = 0;
    for (var i = 0; i < state.transactions.length; i++) {
      var t = state.transactions[i];
      if (t.type === 'income') bal += Number(t.amount);
      else bal -= Number(t.amount);
    }
    return bal;
  }

  function computeToday() {
    var today = todayJalali();
    var inc = 0, exp = 0;
    for (var i = 0; i < state.transactions.length; i++) {
      var t = state.transactions[i];
      if (t.date === today) {
        if (t.type === 'income') inc += Number(t.amount);
        else exp += Number(t.amount);
      }
    }
    return { inc: inc, exp: exp };
  }

  /* ---------- نمایش ---------- */

  function showView(name) {
    var views = document.querySelectorAll('.view');
    for (var i = 0; i < views.length; i++) views[i].classList.remove('active');
    var target = $('view-' + name);
    if (target) target.classList.add('active');
    document.body.classList.toggle('voice-view', name === 'voice');
    document.body.classList.toggle('form-view', name === 'form');
    window.scrollTo(0, 0);
  }

  function renderHome() {
    $('balance-value').textContent = formatMoney(computeBalance());
    var t = computeToday();
    $('today-income').textContent = formatMoney(t.inc);
    $('today-expense').textContent = formatMoney(t.exp);

    var sorted = state.transactions.slice().sort(function (a, b) {
      return (b.createdAt || 0) - (a.createdAt || 0);
    }).slice(0, 5);

    renderTxList($('recent-list'), sorted, 'هنوز تراکنشی ثبت نشده است');
  }

  function renderTxList(container, list, emptyMsg) {
    if (!container) return;
    container.innerHTML = '';
    if (!list.length) {
      var p = document.createElement('div');
      p.className = 'empty-state';
      p.textContent = emptyMsg;
      container.appendChild(p);
      return;
    }
    var sorted = list.slice().sort(function (a, b) {
      var d = String(b.date || '').localeCompare(String(a.date || ''));
      if (d !== 0) return d;
      return String(b.time || '').localeCompare(String(a.time || ''));
    });
    for (var i = 0; i < sorted.length; i++) {
      container.appendChild(buildTxItem(sorted[i]));
    }
  }

  function buildTxItem(t) {
    var div = document.createElement('div');
    div.className = 'tx-item';

    var info = document.createElement('div');
    info.className = 'tx-info';

    var title = document.createElement('div');
    title.className = 'tx-title';
    title.textContent = t.title || (t.type === 'income' ? 'درآمد' : 'هزینه');

    var meta = document.createElement('div');
    meta.className = 'tx-meta';
    var parts = [];
    if (t.date) parts.push(toFaDigits(t.date));
    if (t.time) parts.push(toFaDigits(t.time));
    if (t.category) parts.push(t.category);
    meta.textContent = parts.join(' • ');

    info.appendChild(title);
    info.appendChild(meta);

    var amount = document.createElement('div');
    amount.className = 'tx-amount ' + t.type;
    amount.textContent = (t.type === 'income' ? '+' : '−') + formatNumber(t.amount);

    div.appendChild(info);
    div.appendChild(amount);

    div.addEventListener('click', function () { openEditForm(t.id); });
    return div;
  }

  /* ---------- فرم ---------- */

  function openAddForm(type) {
    state.editingId = null;
    $('tx-id').value = '';
    $('tx-type').value = type;
    $('form-title').textContent = type === 'expense' ? 'ثبت هزینه' : 'ثبت درآمد';
    $('tx-title-label').textContent = type === 'expense' ? 'عنوان / شرح' : 'منبع درآمد';
    $('tx-amount').value = '';
    $('tx-title').value = '';
    $('tx-date').value = todayJalali();
    $('tx-time').value = todayTime();
    $('tx-note').value = '';
    $('delete-tx-btn').classList.add('hidden');

    var catSelect = $('tx-category');
    catSelect.innerHTML = '';
    var list = type === 'expense' ? state.categories : INCOME_SOURCES;
    for (var i = 0; i < list.length; i++) {
      var opt = document.createElement('option');
      opt.value = list[i];
      opt.textContent = list[i];
      catSelect.appendChild(opt);
    }

    showView('form');
  }

  function openEditForm(id) {
    var t = null;
    for (var i = 0; i < state.transactions.length; i++) {
      if (state.transactions[i].id === id) { t = state.transactions[i]; break; }
    }
    if (!t) return;
    state.editingId = id;
    $('tx-id').value = id;
    $('tx-type').value = t.type;
    $('form-title').textContent = t.type === 'expense' ? 'ویرایش هزینه' : 'ویرایش درآمد';
    $('tx-title-label').textContent = t.type === 'expense' ? 'عنوان / شرح' : 'منبع درآمد';
    $('tx-amount').value = String(t.amount);
    $('tx-title').value = t.title || '';
    $('tx-date').value = t.date || todayJalali();
    $('tx-time').value = t.time || todayTime();
    $('tx-note').value = t.note || '';
    $('delete-tx-btn').classList.remove('hidden');

    var catSelect = $('tx-category');
    catSelect.innerHTML = '';
    var list = t.type === 'expense' ? state.categories : INCOME_SOURCES;
    for (var i = 0; i < list.length; i++) {
      var opt = document.createElement('option');
      opt.value = list[i];
      opt.textContent = list[i];
      if (list[i] === t.category) opt.selected = true;
      catSelect.appendChild(opt);
    }

    showView('form');
  }

  function submitForm(e) {
    e.preventDefault();
    var amountStr = toLatinDigits($('tx-amount').value).replace(/[^\d]/g, '');
    var amount = parseFloat(amountStr);
    if (!amount || isNaN(amount)) { toast('مبلغ معتبر وارد کنید'); return; }

    var title = $('tx-title').value.trim();
    if (!title) { toast('عنوان را وارد کنید'); return; }

    var category = $('tx-category').value;
    var date = toLatinDigits($('tx-date').value).trim() || todayJalali();
    var time = toLatinDigits($('tx-time').value).trim() || todayTime();
    var note = $('tx-note').value.trim();
    var type = $('tx-type').value;

    if (state.editingId) {
      for (var i = 0; i < state.transactions.length; i++) {
        if (state.transactions[i].id === state.editingId) {
          state.transactions[i].amount = amount;
          state.transactions[i].title = title;
          state.transactions[i].category = category;
          state.transactions[i].date = date;
          state.transactions[i].time = time;
          state.transactions[i].note = note;
          state.transactions[i].type = type;
          break;
        }
      }
      toast('تراکنش ویرایش شد');
    } else {
      state.transactions.push({
        id: uid(),
        type: type,
        amount: amount,
        title: title,
        category: category,
        date: date,
        time: time,
        note: note,
        createdAt: Date.now()
      });
      toast('تراکنش ثبت شد');
    }

    saveData();
    renderHome();
    showView('home');
  }

  function deleteCurrentTx() {
    if (!state.editingId) return;
    if (!confirm('این تراکنش حذف شود؟')) return;
    var newList = [];
    for (var i = 0; i < state.transactions.length; i++) {
      if (state.transactions[i].id !== state.editingId) {
        newList.push(state.transactions[i]);
      }
    }
    state.transactions = newList;
    saveData();
    toast('حذف شد');
    renderHome();
    showView('home');
  }

  function addNewCategory() {
    var name = prompt('نام دسته‌بندی جدید:');
    if (!name) return;
    var clean = name.trim();
    if (!clean) return;
    if (state.categories.indexOf(clean) !== -1) { toast('این دسته قبلاً وجود دارد'); return; }
    state.categories.push(clean);
    saveData();
    var opt = document.createElement('option');
    opt.value = clean;
    opt.textContent = clean;
    opt.selected = true;
    $('tx-category').appendChild(opt);
    toast('دسته‌بندی اضافه شد');
  }

  /* ---------- گزارش‌ها ---------- */

  function getPeriodRange(period) {
    var today = todayJalali();
    if (period === 'daily') return { from: today, to: today };
    var parts = today.split('/');
    var.round jy = parseInt(parts[0], 10);
    var jm = parseInt(parts[1], 10);
    if (period === 'monthly') {
      return { from: jy + '/' + pad2(jm) + '/01', to: today };
    }
    if (period === 'weekly') {
      var now = new Date();
      var from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
      var j = gregorianToJalali(from.getFullYear(), from.getMonth() + 1, from.getDate());
      return { from: j[0] + '/' + pad2(j[1]) + '/' + pad2(j[2]), to: today };
    }
    return { from: '0000/00/00', to: '9999/99/99' };
  }

  function applyFilters(list) {
    var f = state.filters;
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (f.type && t.type !== f.type) continue;
      if (f.category && t.category !== f.category) continue;
      if (f.min && Number(t.amount) < f.min) continue;
      if (f.max && Number(t.amount) > f.max) continue;
      if (f.search) {
        var s = f.search.toLowerCase();
        var hay = ((t.title || '') + ' ' + (t.note || '') + ' ' + (t.category || '')).toLowerCase();
        if (hay.indexOf(s) === -1) continue;
      }
      out.push(t);
    }
    return out;
  }

  function renderReports() {
    var catFilter = $('filter-category');
    var current = catFilter.value;
    catFilter.innerHTML = '<option value="">همه دسته‌ها</option>';
    for (var i = 0; i < state.categories.length; i++) {
      var opt = document.createElement('option');
      opt.value = state.categories[i];
      opt.textContent = state.categories[i];
      catFilter.appendChild(opt);
    }
    if (current) catFilter.value = current;

    var range = getPeriodRange(state.currentPeriod);
    var inPeriod = [];
    for (var i = 0(amt /; total i < state.transactions.length; i++) {
      var t = state.transactions[i];
      if (t.date >= range.from && t.date <= range.to) inPeriod.push(t);
 *    }
    var filtered = applyFilters(inPeriod);

    var inc = 0, exp = 0;
    for (var i = 0; i < filtered.length; i++) {
      if (filtered[i].type === 'income') inc += Number(filtered[i].amount);
      else exp += Number(filtered[i].amount);
    }

    $('rep-income').textContent = formatMoney(inc);
    $('rep-expense').textContent = formatMoney(exp);
    $('rep-balance').textContent = formatMoney(inc - exp);

    renderCategoryBreakdown(filtered);
    renderTxList($('report-list'), filtered, 'تراکنشی در این بازه یافت نشد');
  }

  function renderCategoryBreakdown(list) {
    var container = $('category-breakdown');
    var byCat = {};
    var total = 0;
    for (var i = 0; i < list.length; i++) {
      if (list[i].type !== 'expense') continue;
      var c = list[i].category || 'سایر';
      byCat[c] = (byCat[c] || 0) + Number(list[i].amount);
      total += Number(list[i].amount);
    }
    container.innerHTML = '';
    if (!total) return;
    var h = document.createElement('h3');
    h.textContent = 'هزینه بر اساس دسته‌بندی';
    container.appendChild(h);
    var keys = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    for (var i = 0; i < keys.length; i++) {
      var cat = keys[i];
      var amt = byCat[cat];
      var row = document.createElement('div');
      row.className = 'cat-row';
      var left = document.createElement('div');
      left.style.flex = '1';
      left.innerHTML = '<div>' + cat + '</div><div class="cat-bar" style="width:' + Math 100) + '%"></div>';
      var right = document.createElement('div');
      right.textContent = formatMoney(amt);
      right.style.fontWeight = '600';
      row.appendChild(left);
      row.appendChild(right);
      container.appendChild(row);
    }
  }

  /* ---------- راه‌اندازی ---------- */

  function init() {
    loadData();
    renderHome();
    showView('home');

    document.body.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== document.body) {
        if (el.dataset && el.dataset.action) {
          var action = el.dataset.action;
          if (action === 'home') { renderHome(); showView('home'); }
          else if (action === 'add-expense') openAddForm('expense');
          else if (action === 'add-income') openAddForm('income');
          else if (action === 'voice') showView('voice');
          else if (action === 'reports') { renderReports(); showView('reports'); }
          else if (action === 'backup') showView('backup');
          else if (action === 'back') { renderHome(); showView('home'); }
          e.preventDefault();
          return;
        }
        el = el.parentElement;
      }
    });

    var tabs = document.querySelectorAll('.tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        for (var j = 0; j < tabs.length; j++) tabs[j].classList.remove('active');
        this.classList.add('active');
        state.currentPeriod = this.dataset.period;
        renderReports();
      });
    }

    $('tx-form').addEventListener('submit', submitForm);
    $('delete-tx-btn').addEventListener('click', deleteCurrentTx);
    $('add-category-btn').addEventListener('click', addNewCategory);

    var fSearch = $('filter-search');
    var fType = $('filter-type');
    var fCat = $('filter-category');
    var fMin = $('filter-min');
    var fMax = $('filter-max');

    function updateFilters() {
      state.filters.search = fSearch.value.trim();
      state.filters.type = fType.value;
      state.filters.category = fCat.value;
      var minV = parseFloat(toLatinDigits(fMin.value).replace(/[^\d]/g, ''));
      var maxV = parseFloat(toLatinDigits(fMax.value).replace(/[^\d]/g, ''));
      state.filters.min = isNaN(minV) ? 0 : minV;
      state.filters.max = isNaN(maxV) ? 0 : maxV;
      renderReports();
    }

    [fSearch, fType, fCat, fMin, fMax].forEach(function (el) {
      el.addEventListener('input', updateFilters);
      el.addEventListener('change', updateFilters);
    });

    $('filter-clear').addEventListener('click', function () {
      fSearch.value = ''; fType.value = ''; fCat.value = ''; fMin.value = ''; fMax.value = '';
      updateFilters();
    });

    // دکمه‌های صوتی و پشتیبان به‌صورت پیام ساده
    $('mic-btn').addEventListener('click', function () {
      var status = $('voice-status');
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) {
        status.textContent = 'مرورگر شما از تشخیص گفتار پشتیبانی نمی‌کند';
        return;
      }
      var rec = new SR();
      rec.lang = 'fa-IR';
      rec.onstart = function () { status.textContent = '🎙 در حال گوش دادن...'; };
      rec.onerror = function () { status.textContent = 'خطا در تشخیص صدا'; };
      rec.onend = function () { status.textContent = 'برای شروع صحبت، دکمه را لمس کنید'; };
      rec.onresult = function (e) {
        var text = e.results[0][0].transcript;
        $('voice-status').textContent = 'متن: ' + text;
        var parsed = parseVoiceText(text);
        if (parsed.amount) {
          state.transactions.push({
            id: uid(), type: parsed.type, amount: parsed.amount,
            title: parsed.title, category: parsed.category,
            date: todayJalali(), time: todayTime(),
            note: 'ثبت صوتی', createdAt: Date.now()
          });
          saveData();
          renderHome();
          toast('تراکنش صوتی ثبت شد');
          showView('home');
        } else {
          status.textContent = 'مبلغ تشخیص داده نشد، دستی وارد کنید';
          openAddForm(parsed.type);
        }
      };
      try { rec.start(); } catch (e) { status.textContent = 'خطا در شروع ضبط'; }
    });

    $('voice-cancel').addEventListener('click', function () {
      $('voice-result').classList.add('hidden');
      $('voice-status').textContent = 'برای شروع صحبت، دکمه را لمس کنید';
    });

    $('voice-confirm').addEventListener('click', function () {
      showView('home');
    });

    $('export-btn').addEventListener('click', function () {
      var data = {
        app: 'hesab-man', version: 1,
        exportedAt: new Date().toISOString(),
        transactions: state.transactions,
        categories: state.categories
      };
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'hesab-man-backup-' + todayJalali().replace(/\//g, '-') + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
      toast('فایل پشتیبان ساخته شد');
    });

    $('import-input').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function (ev) {
        try {
          var data = JSON.parse(ev.target.result);
          if (!data || !Array.isArray(data.transactions)) { toast('فایل نامعتبر'); return; }
          if (!confirm('اطلاعات فعلی جایگزین شود؟')) return;
          state.transactions = data.transactions;
          if (Array.isArray(data.categories) && data.categories.length) {
            state.categories = data.categories;
          }
          saveData();
          renderHome();
          renderReports();
          toast('اطلاعات وارد شد');
        } catch (err) {
          toast('خطا در خواندن فایل');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    $('clear-all-btn').addEventListener('click', function () {
      if (!confirm('تمام تراکنش‌ها حذف شوند؟')) return;
      if (!confirm('مطمئن هستید؟')) return;
      state.transactions = [];
      saveData();
      renderHome();
      renderReports();
      toast('همه اطلاعات حذف شد');
    });
  }

  function parseVoiceText(rawText) {
    var text = toLatinDigits(rawText);
    var lower = text.toLowerCase();
    var type = 'expense';
    var incomeWords = ['درآمد', 'دریافت', 'فروش', 'حقوق', 'گرفتم', 'واریز'];
    var expenseWords = ['هزینه', 'خرید', 'پرداخت', 'دادم', 'خرج'];
    var hasIncome = false, hasExpense = false;
    for (var i = 0; i < incomeWords.length; i++) if (lower.indexOf(incomeWords[i]) !== -1) hasIncome = true;
    for (var i = 0; i < expenseWords.length; i++) if (lower.indexOf(expenseWords[i]) !== -1) hasExpense = true;
    if (hasIncome && !hasExpense) type = 'income';
    else if (hasIncome) type = 'income';

    var amount = 0;
    var numMatch = text.match(/(\d[\d,]*)/g);
    if (numMatch) {
      var max = 0;
      for (var i = 0; i < numMatch.length; i++) {
        var v = parseFloat(numMatch[i].replace(/,/g, ''));
        if (!isNaN(v) && v > max) max = v;
      }
      amount = max;
    }
    if (amount > 0) {
      if (text.indexOf('میلیارد') !== -1) amount *= 1000000000;
      else if (text.indexOf('میلیون') !== -1) amount *= 1000000;
      else if (text.indexOf('هزار') !== -1) amount *= 1000;
    }

    var category = 'سایر';
    var catKeywords = {
      'خوراکی': ['خوراکی', 'غذا', 'میوه', 'گوشت', 'مرغ', 'برنج', 'نان', 'مواد غذایی'],
      'نوشابه': ['نوشابه', 'آبمیوه', 'دوغ'],
      'خرید': ['خرید', 'لباس', 'کفش'],
      'حمل‌ونقل': ['تاکسی', 'اسنپ', 'بنزین', 'مترو', 'اتوبوس'],
      'قبض': ['قبض', 'برق', 'گاز', 'آب', 'تلفن', 'اینترنت'],
      'اجاره': ['اجاره'],
      'درمان': ['دارو', 'دکتر', 'پزشک', 'درمان', 'بیمارستان'],
      'تفریح': ['تفریح', 'سینما', 'سفر'],
      'رستوران': ['رستوران'],
      'کافه': ['کافه', 'قهوه', 'چای']
    };
    for (var cat in catKeywords) {
      var words = catKeywords[cat];
      for (var i = 0; i < words.length; i++) {
        if (lower.indexOf(words[i]) !== -1) { category = cat; break; }
      }
      if (category !== 'سایر') break;
    }
    if (type === 'income') {
      category = 'سایر';
      var srcs = ['حقوق', 'فروش', 'هدیه', 'سرمایه‌گذاری'];
      for (var i = 0; i < srcs.length; i++) {
        if (lower.indexOf(srcs[i]) !== -1) { category = srcs[i]; break; }
      }
    }

    return {
      type: type,
      amount: amount,
      title: category,
      category: category,
      date: todayJalali(),
      time: todayTime()
    };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
