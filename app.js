'use strict';
(function () {
  var KEY = 'hesabman.v1';
  var DEF = ['خوراکی', 'نوشابه', 'خرید', 'حمل‌ونقل', 'قبض', 'اجاره', 'درمان', 'تفریح', 'رستوران', 'کافه', 'سایر'];
  var db = { tx: [], cats: DEF.slice() };
  var per = 'day', editId = null, ftype = 'expense', rec = null;
  var $ = function (s) { return document.querySelector(s); };
  var pad = function (n) { return String(n).padStart(2, '0'); };

  /* ---------- storage ---------- */
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && Array.isArray(d.tx)) { db = d; if (!Array.isArray(db.cats)) db.cats = DEF.slice(); }
    } catch (e) {}
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
    catch (e) { toast('ذخیره‌سازی ناموفق بود. از داده‌ها پشتیبان بگیرید.'); return false; }
  }
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }

  /* ---------- helpers ---------- */
  function norm(s) {
    return String(s).replace(/[۰-۹]/g, function (d) { return d.charCodeAt(0) - 1776; })
      .replace(/[٠-٩]/g, function (d) { return d.charCodeAt(0) - 1632; })
      .replace(/٫/g, '.').replace(/[٬,،]/g, '');
  }
  var toFa = function (s) { return String(s).replace(/\d/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[d]; }); };
  var fmt = function (n) { return Math.round(n).toLocaleString('en-US'); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove('on'); }, 2600); }

  function g2j(gy, gm, gd) {
    var g = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var gy2 = gm > 2 ? gy + 1 : gy;
    var days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + g[gm - 1];
    var jy = -1595 + 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    var jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    var jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return [jy, jm, jd];
  }
  function j2g(jy, jm, jd) {
    jy += 1595;
    var days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    var gy = 400 * Math.floor(days / 146097); days %= 146097;
    if (days > 36524) { gy += 100 * Math.floor(--days / 36524); days %= 36524; if (days >= 365) days++; }
    gy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { gy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    var gd = days + 1;
    var sal = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    var gm = 0;
    while (gm < 13 && gd > sal[gm]) { gd -= sal[gm]; gm++; }
    return [gy, gm, gd];
  }
  function jstr(s) { var p = s.split('-').map(Number), j = g2j(p[0], p[1], p[2]); return j[0] + '/' + pad(j[1]) + '/' + pad(j[2]); }
  function parseJ(str) {
    var m = norm(str).trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    if (y > 1700) return y + '-' + pad(mo) + '-' + pad(d);
    var g = j2g(y, mo, d);
    return g[0] + '-' + pad(g[1]) + '-' + pad(g[2]);
  }
  function bounds(p) {
    var n = new Date(), s, e;
    if (p === 'day') { s = e = iso(n); }
    else if (p === 'week') {
      var a = new Date(n); a.setDate(a.getDate() - ((a.getDay() + 1) % 7));
      var b = new Date(a); b.setDate(b.getDate() + 6); s = iso(a); e = iso(b);
    } else if (p === 'month') {
      var j = g2j(n.getFullYear(), n.getMonth() + 1, n.getDate());
      var a1 = j2g(j[0], j[1], 1), nj = j[1] === 12 ? [j[0] + 1, 1] : [j[0], j[1] + 1], b1 = j2g(nj[0], nj[1], 1);
      s = a1[0] + '-' + pad(a1[1]) + '-' + pad(a1[2]); e = iso(new Date(b1[0], b1[1] - 1, b1[2] - 1));
    } else { s = '0000-00-00'; e = '9999-99-99'; }
    return [s, e];
  }
  var sum = function (arr, type) { return arr.reduce(function (a, t) { return t.type === type ? a + t.amount : a; }, 0); };
  var sortTx = function (a) { return a.slice().sort(function (x, y) { return (y.date + (y.time || '')).localeCompare(x.date + (x.time || '')); }); };

  /* ---------- rendering ---------- */
  function rowHtml(t) {
    var inc = t.type === 'income';
    return '<div class="r"><div class="rt"><span>' + toFa(jstr(t.date)) + ' ' + toFa(t.time || '') + '</span><b class="' + (inc ? 'inc' : 'exp') + '">' + (inc ? '+' : '−') + fmt(t.amount) + ' تومان</b></div>' +
      '<div>' + (inc ? 'درآمد' : 'هزینه ' + esc(t.cat)) + '</div>' +
      (t.title ? '<div>' + esc(t.title) + '</div>' : '') + (t.note ? '<div class="rn">' + esc(t.note) + '</div>' : '') +
      '<div class="ra"><button data-edit="' + esc(t.id) + '">ویرایش</button><button class="d" data-del="' + esc(t.id) + '">حذف</button></div></div>';
  }
  function renderHome() {
    var td = iso(new Date()), all = db.tx, today = all.filter(function (t) { return t.date === td; });
    var bal = sum(all, 'income') - sum(all, 'expense');
    $('#bal').textContent = fmt(bal) + ' تومان';
    $('#ti').textContent = fmt(sum(today, 'income'));
    $('#te').textContent = fmt(sum(today, 'expense'));
    var r = sortTx(all).slice(0, 5);
    $('#recent').innerHTML = r.length ? r.map(rowHtml).join('') : '<div class="empty">هنوز تراکنشی ثبت نشده است. با «ثبت هزینه» شروع کنید.</div>';
  }
  function filtered() {
    var b = bounds(per), s = b[0], e = b[1];
    var f = parseJ($('#ffrom').value), t2 = parseJ($('#fto').value);
    if (f) s = f; if (t2) e = t2;
    var q = $('#q').value.trim(), ty = $('#ft').value, c = $('#fc').value;
    var mn = parseFloat(norm($('#fmin').value)), mx = parseFloat(norm($('#fmax').value));
    return sortTx(db.tx.filter(function (t) {
      if (t.date < s || t.date > e) return false;
      if (ty && t.type !== ty) return false;
      if (c && t.cat !== c) return false;
      if (!isNaN(mn) && t.amount < mn) return false;
      if (!isNaN(mx) && t.amount > mx) return false;
      if (q && (t.title + ' ' + t.note + ' ' + t.cat).indexOf(q) < 0) return false;
      return true;
    }));
  }
  function renderRep() {
    document.querySelectorAll('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.p === per); });
    var l = filtered(), i = sum(l, 'income'), e = sum(l, 'expense');
    $('#ri').textContent = fmt(i); $('#re').textContent = fmt(e);
    $('#rb').textContent = fmt(i - e); $('#rb').className = i - e < 0 ? 'exp' : 'inc';
    var by = {};
    l.forEach(function (t) { if (t.type === 'expense') by[t.cat] = (by[t.cat] || 0) + t.amount; });
    var ks = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; });
    $('#cb').innerHTML = ks.length ? ks.map(function (k) {
      return '<div class="cbr"><div><span>' + esc(k) + '</span><b>' + fmt(by[k]) + ' تومان</b></div><i style="width:' + Math.max(3, by[k] / e * 100) + '%"></i></div>';
    }).join('') : '<div class="empty">هزینه‌ای در این بازه نیست.</div>';
    $('#cnt').textContent = '(' + toFa(l.length) + ')';
    $('#list').innerHTML = l.length ? l.map(rowHtml).join('') : '<div class="empty">تراکنشی پیدا نشد.</div>';
  }
  function catOptions(sel, withAll) {
    var cur = sel.value;
    sel.innerHTML = (withAll ? '<option value="">همه دسته‌ها</option>' : '') + db.cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + (withAll ? '<option>درآمد</option>' : '');
    sel.value = cur;
  }
  function render() { renderHome(); catOptions($('#fc'), true); if ($('#rep').classList.contains('on')) renderRep(); }

  /* ---------- form ---------- */
  function setType(t) {
    ftype = t;
    document.querySelectorAll('#seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === t); });
    $('#ftl').textContent = t === 'income' ? 'منبع درآمد' : 'عنوان / شرح';
    $('#fcw').style.display = t === 'income' ? 'none' : 'block';
  }
  function openForm(tx, pre) {
    var o = tx || pre || {}, n = new Date();
    editId = tx ? tx.id : null;
    setType(o.type || 'expense');
    catOptions($('#fcs'), false);
    $('#st').textContent = tx ? 'ویرایش تراکنش' : 'ثبت تراکنش';
    $('#fa').value = o.amount || '';
    $('#ftt').value = o.title || '';
    $('#fcs').value = o.cat && db.cats.indexOf(o.cat) >= 0 ? o.cat : 'سایر';
    $('#fd').value = toFa(jstr(o.date || iso(n)));
    $('#fh').value = o.time || pad(n.getHours()) + ':' + pad(n.getMinutes());
    $('#fn').value = o.note || '';
    $('#fdel').hidden = !tx;
    $('#sh').classList.add('on');
    if (!o.amount) setTimeout(function () { $('#fa').focus(); }, 150);
  }
  function saveForm() {
    var amt = parseFloat(norm($('#fa').value));
    if (!(amt > 0)) { toast('مبلغ را درست وارد کنید'); $('#fa').focus(); return; }
    var date = parseJ($('#fd').value);
    if (!date) { toast('تاریخ را مثل 1405/07/17 وارد کنید'); $('#fd').focus(); return; }
    var inc = ftype === 'income', cat = inc ? 'درآمد' : $('#fcs').value || 'سایر';
    var title = $('#ftt').value.trim() || (inc ? 'درآمد' : cat);
    var t = { id: editId || Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type: ftype, amount: amt, title: title, cat: cat, date: date, time: $('#fh').value || '00:00', note: $('#fn').value.trim() };
    var i = db.tx.findIndex(function (x) { return x.id === editId; });
    if (editId && i >= 0) db.tx[i] = t; else db.tx.push(t);
    if (save()) { $('#sh').classList.remove('on'); render(); toast('ذخیره شد'); }
  }
  function del(id) {
    if (!confirm('این تراکنش حذف شود؟')) return;
    db.tx = db.tx.filter(function (t) { return t.id !== id; });
    save(); $('#sh').classList.remove('on'); render(); toast('حذف شد');
  }

  /* ---------- voice ---------- */
  var W = { 'صفر': 0, 'یک': 1, 'دو': 2, 'سه': 3, 'چهار': 4, 'پنج': 5, 'شش': 6, 'هفت': 7, 'هشت': 8, 'نه': 9, 'ده': 10, 'یازده': 11, 'دوازده': 12, 'سیزده': 13, 'چهارده': 14, 'پانزده': 15, 'شانزده': 16, 'هفده': 17, 'هجده': 18, 'نوزده': 19, 'بیست': 20, 'سی': 30, 'چهل': 40, 'پنجاه': 50, 'شصت': 60, 'هفتاد': 70, 'هشتاد': 80, 'نود': 90, 'صد': 100, 'دویست': 200, 'سیصد': 300, 'چهارصد': 400, 'پانصد': 500, 'ششصد': 600, 'هفتصد': 700, 'هشتصد': 800, 'نهصد': 900 };
  var M = { 'هزار': 1e3, 'میلیون': 1e6, 'میلیارد': 1e9 };
  var isNum = function (t) { return /^\d+(\.\d+)?$/.test(t) || W.hasOwnProperty(t) || M.hasOwnProperty(t); };
  var CATS = [['نوشابه', ['نوشابه', 'نوشیدنی', 'دلستر', 'آبمیوه']], ['کافه', ['کافه', 'قهوه', 'کافی‌شاپ', 'کافی شاپ']], ['رستوران', ['رستوران', 'کباب', 'پیتزا', 'برگر', 'فست‌فود']], ['خوراکی', ['خوراکی', 'مواد غذایی', 'غذا', 'میوه', 'نان', 'سبزی', 'گوشت', 'مرغ', 'برنج', 'لبنیات', 'تنقلات']], ['حمل‌ونقل', ['تاکسی', 'بنزین', 'اسنپ', 'تپسی', 'مترو', 'اتوبوس', 'کرایه', 'پارکینگ', 'عوارض']], ['قبض', ['قبض', 'برق', 'گاز', 'آب', 'اینترنت', 'تلفن', 'شارژ']], ['اجاره', ['اجاره', 'رهن', 'ودیعه']], ['درمان', ['درمان', 'دکتر', 'دارو', 'بیمارستان', 'دندان', 'ویزیت', 'آزمایش']], ['تفریح', ['تفریح', 'سینما', 'سفر', 'بازی', 'کنسرت']], ['خرید', ['خرید', 'لباس', 'کفش', 'پوشاک']]];
  var INC = ['درآمد', 'حقوق', 'فروش', 'دریافت', 'واریز', 'سود', 'پاداش', 'عیدی', 'کسب'];
  var EXP = ['هزینه', 'خرید', 'پرداخت', 'خرج', 'دادم', 'پول دادم'];
  var STOP = ['امروز', 'دیروز', 'پریروز', 'من', 'را', 'رو', 'به', 'از', 'برای', 'بابت', 'هزینه', 'کردم', 'کرده', 'داشتم', 'درآمد', 'دریافت', 'پرداخت', 'خرج', 'کرد', 'تومان', 'تومن', 'ریال', 'دادم', 'شد'];

  function parseSpeech(raw) {
    var text = norm(raw).replace(/[،؛؟?!:;«»"]/g, ' ').replace(/\.(\s|$)/g, ' ').trim();
    var tk = text.split(/\s+/).filter(Boolean), runs = [], i = 0;
    while (i < tk.length) {
      var j = i, cur = 0, tot = 0, seen = false, last = i - 1;
      while (j < tk.length) {
        var t = tk[j];
        if (/^\d+(\.\d+)?$/.test(t)) { cur += parseFloat(t); seen = true; last = j; j++; }
        else if (W.hasOwnProperty(t)) { cur += W[t]; seen = true; last = j; j++; }
        else if (M.hasOwnProperty(t)) { tot += (cur || 1) * M[t]; cur = 0; seen = true; last = j; j++; }
        else if (t === 'و' && seen && j + 1 < tk.length && isNum(tk[j + 1])) { j++; }
        else break;
      }
      if (seen && tot + cur > 0) runs.push({ v: tot + cur, s: i, e: last });
      i = Math.max(j, i + 1);
    }
    var best = runs.sort(function (a, b) { return b.v - a.v; })[0], amount = '', skip = {};
    if (best) {
      amount = best.v;
      if (tk[best.e + 1] === 'ریال') amount = best.v / 10;
      for (var k = best.s; k <= best.e; k++) skip[k] = 1;
    }
    var inc = INC.filter(function (k) { return text.indexOf(k) >= 0; }).length, ex = EXP.filter(function (k) { return text.indexOf(k) >= 0; }).length;
    var type = inc > ex ? 'income' : 'expense';
    var cat = 'سایر', custom = db.cats.filter(function (c) { return DEF.indexOf(c) < 0 && text.indexOf(c) >= 0; })[0];
    if (custom) cat = custom;
    else for (var c = 0; c < CATS.length; c++) {
      var hit = CATS[c][1].some(function (k) { return k.length <= 3 ? tk.indexOf(k) >= 0 : text.indexOf(k) >= 0; });
      if (hit && db.cats.indexOf(CATS[c][0]) >= 0) { cat = CATS[c][0]; break; }
    }
    var from = tk.indexOf('بابت'), words = tk.filter(function (w, idx) { return !skip[idx] && STOP.indexOf(w) < 0 && !(isNum(w)); });
    var title = words.join(' ');
    if (from >= 0) title = tk.slice(from + 1).filter(function (w, idx) { return !skip[from + 1 + idx] && STOP.indexOf(w) < 0 && !isNum(w); }).join(' ');
    var d = new Date();
    if (text.indexOf('پریروز') >= 0) d.setDate(d.getDate() - 2); else if (text.indexOf('دیروز') >= 0) d.setDate(d.getDate() - 1);
    return { type: type, amount: amount, cat: cat, title: title, date: iso(d), note: 'ثبت صوتی: ' + raw.trim() };
  }
  function analyze() {
    var v = $('#vtext').value.trim();
    if (!v) { toast('ابتدا چیزی بگویید یا تایپ کنید'); return; }
    var p = parseSpeech(v);
    $('#vs').classList.remove('on');
    openForm(null, p);
    if (!p.amount) toast('مبلغ تشخیص داده نشد؛ لطفاً وارد کنید');
    else toast('اطلاعات را بررسی و ذخیره کنید');
  }
  function toggleVoice() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition, st = $('#vstat');
    if (rec) { rec.stop(); return; }
    if (!SR) { st.textContent = 'تشخیص گفتار در این حالت در دسترس نیست. متن را تایپ کنید یا از میکروفون کیبورد گوشی استفاده کنید.'; $('#vtext').focus(); return; }
    try {
      rec = new SR(); rec.lang = 'fa-IR'; rec.interimResults = true; rec.continuous = false;
      rec.onresult = function (e) { var t = ''; for (var i = 0; i < e.results.length; i++) t += e.results[i][0].transcript; $('#vtext').value = t; };
      rec.onerror = function (e) { st.textContent = 'خطا در تشخیص گفتار (' + e.error + '). اجازه میکروفون و اینترنت را بررسی کنید یا متن را تایپ کنید.'; };
      rec.onend = function () { rec = null; $('#vm').classList.remove('rec'); if ($('#vtext').value.trim()) st.textContent = 'متن را بررسی کنید و «تحلیل و ادامه» را بزنید.'; };
      rec.start(); $('#vm').classList.add('rec'); st.textContent = 'در حال گوش دادن...';
    } catch (e) { rec = null; st.textContent = 'شروع تشخیص گفتار ممکن نشد. متن را تایپ کنید.'; }
  }

  /* ---------- backup ---------- */
  function exportData() {
    var data = JSON.stringify({ app: 'hesab-man', v: 1, exported: new Date().toISOString(), tx: db.tx, cats: db.cats }, null, 1);
    var name = 'hesab-man-' + iso(new Date()) + '.json';
    try {
      var f = new File([data], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        navigator.share({ files: [f], title: name }).catch(function () {});
        return;
      }
    } catch (e) {}
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
  }
  function importData(file) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        if (!d || !Array.isArray(d.tx)) throw 0;
        var ids = {}, n = 0;
        db.tx.forEach(function (t) { ids[t.id] = 1; });
        d.tx.forEach(function (t) {
          if (t && t.id && +t.amount > 0 && /^\d{4}-\d\d-\d\d$/.test(t.date) && !ids[t.id]) {
            var c = String(t.cat || 'سایر');
            db.tx.push({ id: String(t.id), type: t.type === 'income' ? 'income' : 'expense', amount: +t.amount, title: String(t.title || ''), cat: c, date: t.date, time: String(t.time || ''), note: String(t.note || '') });
            if (t.type !== 'income' && db.cats.indexOf(c) < 0) db.cats.push(c);
            ids[t.id] = 1; n++;
          }
        });
        (d.cats || []).forEach(function (c) { if (typeof c === 'string' && c && db.cats.indexOf(c) < 0) db.cats.push(c); });
        save(); render(); $('#bs').classList.remove('on'); toast(toFa(n) + ' تراکنش جدید وارد شد');
      } catch (e) { toast('فایل پشتیبان معتبر نیست'); }
    };
    r.readAsText(file);
  }

  /* ---------- events ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.new) openForm(null, { type: b.dataset.new });
    else if (b.dataset.edit) { var t = db.tx.filter(function (x) { return x.id === b.dataset.edit; })[0]; if (t) openForm(t); }
    else if (b.dataset.del) del(b.dataset.del);
    else if (b.dataset.t) setType(b.dataset.t);
    else if (b.dataset.p) { per = b.dataset.p; renderRep(); }
  });
  $('#gr').onclick = function () { $('#home').classList.remove('on'); $('#rep').classList.add('on'); renderRep(); window.scrollTo(0, 0); };
  $('#back').onclick = function () { $('#rep').classList.remove('on'); $('#home').classList.add('on'); renderHome(); };
  $('#fs').onclick = saveForm;
  $('#fx').onclick = function () { $('#sh').classList.remove('on'); };
  $('#fdel').onclick = function () { if (editId) del(editId); };
  $('#addc').onclick = function () {
    var n = (prompt('نام دسته‌بندی جدید:') || '').trim();
    if (!n) return;
    if (db.cats.indexOf(n) < 0) { db.cats.push(n); save(); }
    catOptions($('#fcs'), false); $('#fcs').value = n; render();
  };
  $('#mic').onclick = function () { $('#vtext').value = ''; $('#vstat').textContent = 'میکروفون را بزنید و بگویید: «امروز ۳۰۰ هزار تومان بابت خرید مواد غذایی هزینه کردم»'; $('#vs').classList.add('on'); };
  $('#vm').onclick = toggleVoice;
  $('#va').onclick = function () { if (rec) rec.stop(); analyze(); };
  $('#vx').onclick = function () { if (rec) rec.stop(); $('#vs').classList.remove('on'); };
  $('#bk').onclick = function () { $('#bs').classList.add('on'); };
  $('#bx').onclick = function () { $('#bs').classList.remove('on'); };
  $('#exp').onclick = exportData;
  $('#imp').onchange = function (e) { if (e.target.files[0]) importData(e.target.files[0]); e.target.value = ''; };
  $('#wipe').onclick = function () {
    if (confirm('همه تراکنش‌ها حذف شوند؟ این کار برگشت‌پذیر نیست.') && confirm('مطمئن هستید؟ بهتر است ابتدا پشتیبان بگیرید.')) {
      db = { tx: [], cats: DEF.slice() }; save(); render(); $('#bs').classList.remove('on'); toast('همه داده‌ها حذف شد');
    }
  };
  ['q', 'ft', 'fc', 'fmin', 'fmax', 'ffrom', 'fto'].forEach(function (id) { $('#' + id).addEventListener('input', renderRep); });
  $('#fr').onclick = function () { ['q', 'ft', 'fc', 'fmin', 'fmax', 'ffrom', 'fto'].forEach(function (id) { $('#' + id).value = ''; }); renderRep(); };
  document.querySelectorAll('.sheet').forEach(function (s) { s.addEventListener('click', function (e) { if (e.target === s && s.id !== 'sh') s.classList.remove('on'); }); });

  load(); render();
  if ('serviceWorker' in navigator) window.addEventListener('load', function () { navigator.serviceWorker.register('service-worker.js').catch(function () {}); });
})();
