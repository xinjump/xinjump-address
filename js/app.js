/**
 * 发货信息整理单（多收货人 / 多规格）
 * 一次粘贴可识别多段「地址 + 收货人 + 电话 + 发货数量(可多规格)」
 * 品名默认「玉露香梨」、规格默认「12枚」、单位默认「箱」，均可修改或从文本识别
 * 纯前端实现，数据保存在浏览器 localStorage
 */
(function () {
  'use strict';

  /* ==================== 常量 ==================== */
  var STORE_KEY = 'xinjump-address-docs-v1';
  var DARK_KEY = 'xinjump-address-dark';

  var PRODUCT = { name: '玉露香梨', spec: '12枚', unit: '箱' };

  var ADDR_KEYS = ['省', '市', '区', '县', '旗', '镇', '乡', '街道', '街', '路', '巷', '号', '楼',
    '室', '栋', '幢', '单元', '小区', '花园', '广场', '大厦', '公寓', '村', '组', '队', '工业园',
    '科技园', '产业园', '大道', '开发区', '新区', '州', '园', '城'];

  var STOP_WORDS = ['地址', '收货', '发货', '备注', '联系', '电话', '手机', '单位', '公司',
    '日期', '时间', '名称', '姓名', '编号', '订单', '快递', '物流', '清单', '单号', '数量',
    '驿站', '菜鸟', '小区', '花园', '大厦', '公寓'];

  /* ==================== 工具 ==================== */
  var $ = function (id) { return document.getElementById(id); };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function escAttr(s) {
    return escHtml(s).replace(/"/g, '&quot;');
  }

  function fmtNum(n) {
    if (!isFinite(n)) return '0';
    return String(Math.round(n * 1000) / 1000);
  }

  function numOf(v) {
    if (v == null) return null;
    var m = String(v).match(/-?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function nowText() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) +
      ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2400);
  }

  /* ==================== 数据模型 ==================== */
  function newItem(data) {
    data = data || {};
    return {
      id: data.id || uid(),
      name: data.name || PRODUCT.name,
      spec: data.spec || PRODUCT.spec,
      unit: data.unit || PRODUCT.unit,
      qty: data.qty || '',
      remark: data.remark || ''
    };
  }

  function newRecipient() {
    return { id: uid(), name: '', phone: '', address: '', items: [newItem()] };
  }

  function newDoc(name) {
    return {
      id: uid(),
      name: name || '新单据',
      recipients: [newRecipient()],
      updatedAt: Date.now()
    };
  }

  var state = { docs: [], currentId: null };

  function currentDoc() {
    var doc = state.docs.filter(function (d) { return d.id === state.currentId; })[0];
    if (!doc) {
      doc = state.docs[0];
      state.currentId = doc ? doc.id : null;
    }
    return doc;
  }

  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ docs: state.docs, currentId: state.currentId }));
    } catch (e) { /* 忽略 */ }
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && Array.isArray(data.docs) && data.docs.length) {
          state.docs = data.docs.map(function (d) {
            if (d.recipients && d.recipients.length) {
              d.recipients = d.recipients.map(function (r) {
                r.items = (Array.isArray(r.items) ? r.items : []).map(function (it) { return newItem(it); });
                if (!r.items.length) r.items.push(newItem());
                return r;
              });
            } else if (d.receiver) {
              // 旧版单收货人结构迁移
              d.recipients = [{
                id: uid(),
                name: d.receiver.name || '',
                phone: d.receiver.phone || '',
                address: d.receiver.address || '',
                items: (Array.isArray(d.items) ? d.items : []).map(function (it) { return newItem(it); })
              }];
              if (!d.recipients[0].items.length) d.recipients[0].items.push(newItem());
            } else {
              d.recipients = [newRecipient()];
            }
            return d;
          });
          state.currentId = (data.docs.some(function (d) { return d.id === data.currentId; }))
            ? data.currentId : state.docs[0].id;
          return;
        }
      }
    } catch (e) { /* 数据损坏时重建 */ }
    var doc = newDoc('发货单 1');
    state.docs = [doc];
    state.currentId = doc.id;
  }

  function hasContent(it) {
    return !!(it && (it.qty || it.remark));
  }

  function hasAnyRecipientInfo(rec) {
    return !!(rec && (rec.name || rec.phone || rec.address || rec.items.some(hasContent)));
  }

  /* ==================== 渲染 ==================== */
  function renderDocTabs() {
    $('doc-tabs').innerHTML = state.docs.map(function (d) {
      return '<button type="button" class="doc-tab' + (d.id === state.currentId ? ' active' : '') +
        '" data-id="' + d.id + '" title="' + escAttr(d.name) + '">' +
        '<span class="doc-dot"></span>' + escHtml(d.name || '未命名单据') + '</button>';
    }).join('');
  }

  var ITEM_TABLE_HEAD =
    '<div class="table-wrap"><table class="items-table">' +
    '<thead><tr>' +
    '<th class="col-idx">#</th>' +
    '<th class="col-name">品名</th>' +
    '<th class="col-spec">规格型号</th>' +
    '<th class="col-unit">单位</th>' +
    '<th class="col-qty">数量</th>' +
    '<th class="col-remark">备注</th>' +
    '<th class="col-op row-op-cell">操作</th>' +
    '</tr></thead>' +
    '<tbody>';

  var ITEM_TABLE_FOOT =
    '</tbody><tfoot><tr>' +
    '<td colspan="4" class="foot-label">合计数量</td>' +
    '<td class="foot-total">0</td>' +
    '<td colspan="2" class="foot-summary"></td>' +
    '</tr></tfoot></table></div>';

  function itemRowHTML(item, idx) {
    return '<tr data-id="' + item.id + '">' +
      '<td class="col-idx">' + (idx + 1) + '</td>' +
      '<td><input type="text" data-field="name" value="' + escAttr(item.name) + '" placeholder="品名"></td>' +
      '<td><input type="text" data-field="spec" value="' + escAttr(item.spec) + '" placeholder="规格型号"></td>' +
      '<td><input type="text" data-field="unit" value="' + escAttr(item.unit) + '" placeholder="单位"></td>' +
      '<td><input type="text" data-field="qty" value="' + escAttr(item.qty) + '" placeholder="0" inputmode="decimal" class="qty-input"></td>' +
      '<td><input type="text" data-field="remark" value="' + escAttr(item.remark) + '" placeholder="备注"></td>' +
      '<td class="col-op row-op-cell">' +
      '<button type="button" class="row-btn" data-act="dup" title="复制此行">⧉</button>' +
      '<button type="button" class="row-btn danger" data-act="del" title="删除此行">✕</button>' +
      '</td></tr>';
  }

  function recipientHTML(rec, idx) {
    var rows = rec.items.map(itemRowHTML).join('');
    var total = 0;
    rec.items.forEach(function (it) { var q = numOf(it.qty); if (q !== null) total += q; });
    var su = summaryByUnit(rec.items);

    return '<div class="recipient" data-rid="' + rec.id + '">' +
      '<div class="recipient-head">' +
      '<span class="recipient-no">收货人 ' + (idx + 1) + '</span>' +
      '<button type="button" class="link-btn danger" data-act="del-recipient">删除</button>' +
      '</div>' +
      '<div class="form-grid">' +
      '<label class="field"><span>收货人</span>' +
      '<input type="text" data-field="name" value="' + escAttr(rec.name) + '" placeholder="联系人姓名" autocomplete="off"></label>' +
      '<label class="field"><span>联系电话</span>' +
      '<input type="text" data-field="phone" value="' + escAttr(rec.phone) + '" placeholder="手机号 / 座机" autocomplete="off" inputmode="tel"></label>' +
      '<label class="field field-full"><span>收货地址</span>' +
      '<textarea data-field="address" rows="2" placeholder="省 / 市 / 区 / 街道门牌 等详细地址">' + escHtml(rec.address) + '</textarea></label>' +
      '</div>' +
      ITEM_TABLE_HEAD + rows + ITEM_TABLE_FOOT.replace('class="foot-total">0<', 'class="foot-total">' + fmtNum(total) + '<')
        .replace('class="foot-summary"><', 'class="foot-summary">' + escHtml(su) + '<') +
      '<div class="table-actions">' +
      '<button type="button" class="btn-soft" data-act="add-row">＋ 添加一行</button>' +
      '<span class="hint">品名默认「玉露香梨」· 规格 12 枚 · 单位 箱</span>' +
      '</div>' +
      '</div>';
  }

  function renderRecipients() {
    var doc = currentDoc();
    $('recipients').innerHTML = doc.recipients.map(recipientHTML).join('');
  }

  /* ==================== 汇总 ==================== */
  function summaryByUnit(items) {
    var map = {}, order = [];
    items.forEach(function (it) {
      var q = numOf(it.qty);
      if (q === null) return;
      var u = String(it.unit || '').trim() || PRODUCT.unit;
      if (map[u] === undefined) { map[u] = 0; order.push(u); }
      map[u] += q;
    });
    return order.map(function (u) { return fmtNum(map[u]) + u; }).join(' + ');
  }

  function updateRecipientSummary(rec) {
    var el = $('recipients').querySelector('.recipient[data-rid="' + rec.id + '"]');
    if (!el) return;
    var total = 0;
    rec.items.forEach(function (it) { var q = numOf(it.qty); if (q !== null) total += q; });
    el.querySelector('.foot-total').textContent = fmtNum(total);
    el.querySelector('.foot-summary').textContent = summaryByUnit(rec.items);
  }

  /* ==================== 整理结果文本 ==================== */
  function buildText() {
    var doc = currentDoc();
    var lines = [];
    var hasAny = false;

    doc.recipients.forEach(function (rec, ri) {
      if (!hasAnyRecipientInfo(rec)) return;
      hasAny = true;
      lines.push('【收货人 ' + (ri + 1) + '】');
      lines.push('收货人：' + (rec.name || '—'));
      lines.push('联系电话：' + (rec.phone || '—'));
      lines.push('收货地址：' + (rec.address || '—'));

      var items = rec.items.filter(hasContent);
      if (items.length) {
        items.forEach(function (it, i) {
          var parts = [it.name || '（未填品名）'];
          parts.push('规格：' + (it.spec || '—'));
          parts.push('数量：' + (it.qty || '0') + (it.unit || ''));
          if (it.remark) parts.push('备注：' + it.remark);
          lines.push('  ' + (i + 1) + '. ' + parts.join('　'));
        });
        var su = summaryByUnit(rec.items);
        lines.push('  小计：共 ' + items.length + ' 项' + (su ? '，' + su : ''));
      } else {
        lines.push('  （暂无明细）');
      }
      lines.push('');
    });

    if (!hasAny) lines.push('（暂无内容，点击「智能解析」粘贴文本，或手动填写）');
    return lines.join('\n');
  }

  /* ==================== 打印视图 ==================== */
  function renderPrintView() {
    var doc = currentDoc();
    var html = '<h1 class="pv-title">发 货 信 息 整 理 单</h1>' +
      '<div class="pv-meta">单据：' + escHtml(doc.name || '') + '　｜　打印时间：' + nowText() + '</div>';

    doc.recipients.forEach(function (rec, ri) {
      if (!hasAnyRecipientInfo(rec)) return;
      var items = rec.items.filter(hasContent);
      var bodyRows = items.length
        ? items.map(function (it, i) {
          return '<tr><td class="pv-idx">' + (i + 1) + '</td>' +
            '<td>' + escHtml(it.name) + '</td>' +
            '<td class="pv-spec">' + escHtml(it.spec) + '</td>' +
            '<td class="pv-unit">' + escHtml(it.unit) + '</td>' +
            '<td class="pv-qty">' + escHtml(it.qty || '') + '</td>' +
            '<td>' + escHtml(it.remark || '') + '</td></tr>';
        }).join('')
        : '<tr><td colspan="6" style="text-align:center;color:#888;">（暂无明细）</td></tr>';

      var total = 0;
      rec.items.forEach(function (it) { var q = numOf(it.qty); if (q !== null) total += q; });

      html +=
        '<div class="pv-block">' +
        '<div class="pv-block-title">收货人 ' + (ri + 1) + '</div>' +
        '<table class="pv-info">' +
        '<tr><th>收货人</th><td>' + escHtml(rec.name || '—') + '</td>' +
        '<th>联系电话</th><td>' + escHtml(rec.phone || '—') + '</td></tr>' +
        '<tr><th>收货地址</th><td colspan="3">' + escHtml(rec.address || '—') + '</td></tr>' +
        '</table>' +
        '<table class="pv-items">' +
        '<thead><tr><th class="pv-idx">#</th><th>品名</th><th class="pv-spec">规格型号</th>' +
        '<th class="pv-unit">单位</th><th class="pv-qty">数量</th><th>备注</th></tr></thead>' +
        '<tbody>' + bodyRows + '</tbody>' +
        '<tfoot><tr><td colspan="4" style="text-align:right;">合计</td>' +
        '<td class="pv-qty">' + fmtNum(total) + '</td><td>' + escHtml(summaryByUnit(rec.items)) + '</td></tr></tfoot>' +
        '</table></div>';
    });

    html += '<p class="pv-sign">收货人签收：______________　　签收日期：______________</p>';
    $('print-view').innerHTML = html;
  }

  /* ==================== 统一刷新 ==================== */
  function refreshPreview() {
    $('preview').textContent = buildText();
    renderPrintView();
  }

  function renderAll() {
    renderDocTabs();
    renderRecipients();
    refreshPreview();
  }

  /* ==================== 收货人 / 明细操作 ==================== */
  function findRecipient(rid) {
    return currentDoc().recipients.filter(function (r) { return r.id === rid; })[0];
  }

  function addRecipient(focus) {
    var doc = currentDoc();
    var rec = newRecipient();
    doc.recipients.push(rec);
    doc.updatedAt = Date.now();
    renderRecipients();
    save();
    refreshPreview();
    if (focus) {
      var el = $('recipients').querySelector('.recipient[data-rid="' + rec.id + '"]');
      var inp = el && el.querySelector('input[data-field="name"]');
      if (inp) inp.focus();
    }
  }

  function removeRecipient(rid) {
    var doc = currentDoc();
    if (doc.recipients.length <= 1) { toast('至少保留一个收货人'); return; }
    if (!window.confirm('确定删除该收货人及其明细吗？')) return;
    doc.recipients = doc.recipients.filter(function (r) { return r.id !== rid; });
    doc.updatedAt = Date.now();
    renderRecipients();
    save();
    refreshPreview();
    toast('已删除收货人');
  }

  function addRow(rec, focus) {
    rec.items.push(newItem());
    renderRecipients();
    save();
    refreshPreview();
    if (focus) {
      var el = $('recipients').querySelector('.recipient[data-rid="' + rec.id + '"]');
      var rows = el.querySelectorAll('tbody tr');
      var last = rows[rows.length - 1];
      var inp = last && last.querySelector('input[data-field="qty"]');
      if (inp) inp.focus();
    }
  }

  /* ==================== 文本解析 ==================== */
  function hasKeyWord(w) {
    if (STOP_WORDS.some(function (k) { return w.indexOf(k) > -1; })) return true;
    return ADDR_KEYS.some(function (k) { return w.indexOf(k) > -1; });
  }

  function countAddrKeys(s) {
    var c = 0;
    ADDR_KEYS.forEach(function (k) { if (s.indexOf(k) > -1) c++; });
    return c;
  }

  /** 截掉地址前粘连的姓名等前缀 */
  function cutAddressHead(seg) {
    var m = seg.match(/[\u4e00-\u9fa5A-Za-z]{1,10}?(?:省|自治区|特别行政区|市|州|区|县|旗|镇|街道|路|街|巷|大道|村|乡|开发区|新区)/);
    if (m && m.index > 0) return seg.slice(m.index);
    return seg;
  }

  /** 地址末尾可能粘连姓名（如 "...1号张三"），剥离姓名 */
  function splitTailName(seg) {
    var m = seg.match(/[\u4e00-\u9fa5]{2,4}$/);
    if (!m) return { addr: seg, name: '' };
    var tail = m[0];
    var before = seg.slice(0, -tail.length);
    if (hasKeyWord(tail)) return { addr: seg, name: '' };
    if (!/[0-9栋幢室号楼单元座层]/.test(before)) return { addr: seg, name: '' };
    return { addr: before, name: tail };
  }

  var CN_NUM = { '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9 };

  /** 中文数字转阿拉伯数字（支持 一~九、十、十几、几十几） */
  function cnToNum(s) {
    s = String(s || '').trim();
    if (!s) return null;
    if (/^\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
    var m = s.match(/^([一二两三四五六七八九])?([十])?([一二三四五六七八九])?$/);
    if (!m) return null;
    if (m[1] && m[2] && m[3]) return CN_NUM[m[1]] * 10 + CN_NUM[m[3]];
    if (m[2] && m[3]) return 10 + CN_NUM[m[3]];
    if (m[1] && m[2]) return CN_NUM[m[1]] * 10;
    if (m[2]) return 10;
    if (m[1]) return CN_NUM[m[1]];
    return null;
  }

  function normalizeProductName(n) {
    n = String(n || '').trim();
    if (!n) return PRODUCT.name;
    if (/^(梨|香梨|梨子|玉露香梨)$/.test(n)) return PRODUCT.name;
    return n;
  }

  /** 清理地址中的 emoji / 特殊字符与多余空格 */
  function cleanAddress(s) {
    return String(s || '')
      .replace(/[^\u4e00-\u9fa5A-Za-z0-9（）()\-—·.、#/\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 解析一段「地址 + 姓名 + 电话 + 明细」文本 */
  function parseOneRecord(text) {
    var out = { name: '', phone: '', address: '', items: [] };
    if (!text) return out;

    var work = String(text).replace(/\r/g, '');
    // 仅合并手机号中间的空格/横线（如「138 0013 8000」），避免误伤门牌号与数量
    work = work.replace(/(1[3-9]\d)[\s-]+(\d{4})[\s-]+(\d{4})/g, '$1$2$3');

    // 1. 电话 + 电话前的姓名（姓名可 1~6 字，可带「先生/女士」，后跟逗号）
    var pm = work.match(/(?:联系电话|联系方式|电话|手机号码|手机号|手机|Tel|TEL|tel|Mobile)\s*[:：]?\s*(1[3-9]\d{9}|0\d{2,3}-?\d{7,8})/);
    if (!pm) pm = work.match(/(1[3-9]\d{9})/);
    if (!pm) pm = work.match(/(0\d{2,3}-?\d{7,8})/);
    if (pm) {
      out.phone = pm[1];
      var before = work.slice(0, pm.index);
      var after = work.slice(pm.index + pm[0].length);
      var nm = before.match(/([\u4e00-\u9fa5·]{1,6}(?:先生|女士|小姐)?)[,，、\s]*$/);
      if (nm && nm[1] && !hasKeyWord(nm[1])) {
        out.name = nm[1];
        before = before.slice(0, before.length - nm[0].length) + ' ';
      }
      // 电话后紧跟姓名（如「13700137000 王女士」）
      if (!out.name) {
        var afterNm = after.match(/^[\s,，、]*([\u4e00-\u9fa5·]{1,6}(?:先生|女士|小姐)?)/);
        if (afterNm && afterNm[1] && !hasKeyWord(afterNm[1])) {
          out.name = afterNm[1];
          after = after.slice(afterNm[0].length);
        }
      }
      work = before + ' ' + after;
    }

    // 2. 标签式姓名
    if (!out.name) {
      var tm = work.match(/(?:收件人|收货人|联系人|姓名|客户|收件人姓名)\s*[:：]\s*([\u4e00-\u9fa5·]{1,6}(?:先生|女士|小姐)?|[A-Za-z][A-Za-z.\s]{1,20})/);
      if (tm) { out.name = tm[1].trim(); work = work.replace(tm[0], ' '); }
    }

    // 3. 发货明细（多规格，支持多种顺序）
    // 3.0 中文/数字数量 + 单位 + 规格（如「一箱18颗」）
    work = work.replace(/([一二两三四五六七八九十\d]+)\s*(箱|件|提|盒|袋|套|车|托|板|批)\s*(\d+(?:\.\d+)?)\s*(颗|枚|粒|只)/g, function (m, n, u, sn, su) {
      var q = cnToNum(n);
      out.items.push({ qty: String(q == null ? n : q), unit: u, spec: sn + su, name: PRODUCT.name });
      return ' ';
    });
    // 3.1 标签式数量
    work = work.replace(/(?:数量|发货数量|发货量|件数|箱数)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*([箱件个提盒袋套车托板批])?\s*([\u4e00-\u9fa5]{1,4})?/g, function (m, n, u, p) {
      out.items.push({ qty: n, unit: u || PRODUCT.unit, name: normalizeProductName(p) });
      return ' ';
    });
    // 3.2 品名 + 数量 + 单位（如「苹果10箱」）
    work = work.replace(/([\u4e00-\u9fa5]{1,4})(\d+(?:\.\d+)?)\s*([箱件个提盒袋套车托板批])/g, function (m, p, n, u) {
      out.items.push({ qty: n, unit: u, name: normalizeProductName(p) });
      return ' ';
    });
    // 3.3 数量 + 单位 + 品名（如「3件梨」）
    work = work.replace(/(\d+(?:\.\d+)?)\s*([箱件个提盒袋套车托板批])([\u4e00-\u9fa5]{1,4})/g, function (m, n, u, p) {
      out.items.push({ qty: n, unit: u, name: normalizeProductName(p) });
      return ' ';
    });
    // 3.4 数量 + 单位（阿拉伯或中文数字，如「2箱」「一箱」）
    work = work.replace(/(\d+(?:\.\d+)?|[一二两三四五六七八九十]+)\s*([箱件个提盒袋套车托板批])/g, function (m, n, u) {
      var q = cnToNum(n);
      out.items.push({ qty: String(q == null ? n : q), unit: u, name: PRODUCT.name });
      return ' ';
    });

    // 4. 标签式地址（所在地区 + 详细地址 + 邮寄/收货地址 + 通用地址）
    var addrParts = [];
    var regionM = work.match(/所在地区\s*[:：]\s*([^\s,，;；\n]+)/);
    if (regionM) { addrParts.push(regionM[1]); work = work.replace(regionM[0], ' '); }
    var detailM = work.match(/详细地址\s*[:：]\s*([^\s,，;；\n]+)/);
    if (detailM) { addrParts.push(detailM[1]); work = work.replace(detailM[0], ' '); }
    var postM = work.match(/(?:邮寄地址|收货地址|收件地址|快递地址)\s*[:：]\s*([^\s,，;；\n]+)/);
    if (postM) { addrParts.push(postM[1]); work = work.replace(postM[0], ' '); }
    var addrM = work.match(/地址\s*[:：]\s*([^\s,，;；\n]+)/);
    if (addrM) { addrParts.push(addrM[1]); work = work.replace(addrM[0], ' '); }
    if (addrParts.length) out.address = cleanAddress(addrParts.join(''));

    // 5. 打分式地址（无标签的地址）
    if (!out.address) {
      var segs = work.split(/[\n,，;；。!！?？\t|]/).map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length >= 4; });
      var best = '', bestScore = 0, bestHead = '';
      segs.forEach(function (seg) {
        var score = 0;
        ADDR_KEYS.forEach(function (k) { if (seg.indexOf(k) > -1) score += k.length + 1; });
        if (/\d/.test(seg)) score += 1;
        if (score > bestScore) {
          bestScore = score;
          best = seg;
          bestHead = cutAddressHead(seg);
        }
      });
      if (best) {
        var tail = splitTailName(bestHead);
        out.address = cleanAddress(tail.addr.replace(/^(?:收货地址|详细地址|地址|收货)\s*[:：]?\s*/, ''));
        if (!out.name && tail.name) out.name = tail.name;
        var prefix = best.slice(0, best.length - bestHead.length);
        work = work.replace(best, ' ' + prefix + ' ');
      }
    }

    // 6. 姓名兜底
    if (!out.name) {
      var cands = work.match(/[\u4e00-\u9fa5]{2,4}/g) || [];
      for (var i = 0; i < cands.length; i++) {
        var w = cands[i];
        if (hasKeyWord(w)) continue;
        out.name = w;
        break;
      }
    }

    return out;
  }

  /** 判断一行是否是新记录的开始 */
  function isRecordStart(line) {
    if (/^(邮寄地址|收货地址|收件地址|快递地址)/.test(line)) return true;
    if (/^(收件人|收货人|联系人|联系人|姓名|客户)/.test(line)) return true;
    if (/^[\u4e00-\u9fa5]{0,4}(省|自治区|特别行政区|市)/.test(line)) return true;
    return false;
  }

  /** 多地址分段解析：优先按空行切分，块内再按「记录起始行」切分 */
  function parseMultiReceiver(text) {
    var blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/);
    var records = [];

    blocks.forEach(function (block) {
      var lines = block.split('\n').map(function (s) { return s.trim(); })
        .filter(function (s) { return s; });
      if (!lines.length) return;

      var seg = [];
      lines.forEach(function (line) {
        if (seg.length && isRecordStart(line)) {
          records.push(parseOneRecord(seg.join(' ')));
          seg = [];
        }
        seg.push(line);
      });
      if (seg.length) records.push(parseOneRecord(seg.join(' ')));
    });

    return records;
  }

  /* ==================== 模态框 ==================== */
  function openModal(opts) {
    $('modal-title').textContent = opts.title || '';
    $('modal-body').innerHTML = opts.body || '';
    var foot = $('modal-foot');
    foot.innerHTML = '';
    (opts.buttons || []).forEach(function (b) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = 'm-btn ' + (b.cls || 'ghost');
      el.textContent = b.text;
      el.addEventListener('click', function () { if (b.onClick) b.onClick(); });
      foot.appendChild(el);
    });
    $('modal-mask').classList.add('show');
  }

  function closeModal() { $('modal-mask').classList.remove('show'); }

  /* ==================== 智能解析 ==================== */
  function openParseModal() {
    openModal({
      title: '✨ 智能解析（多地址 / 多规格）',
      body: '<p class="modal-tip">一次粘贴多段收货信息，自动拆分成多个收货人。<br>' +
        '每段包含 <b>收货地址 + 收货人 + 联系电话 + 发货数量</b>，数量可带品名（如 <b>3件梨</b>、<b>1件苹果</b>）。<br>' +
        '<textarea id="parse-text" placeholder="在此粘贴文本…" spellcheck="false"></textarea>',
      buttons: [
        { text: '取消', cls: 'ghost', onClick: closeModal },
        {
          text: '识别并填充', cls: 'primary', onClick: function () {
            var el = $('parse-text');
            var text = el ? el.value : '';
            if (!text.trim()) { toast('请先粘贴需要解析的内容'); return; }
            var records = parseMultiReceiver(text);
            var valid = records.filter(function (r) { return r.name || r.phone || r.address || r.items.length; });
            if (!valid.length) { toast('未识别到有效的收货信息'); return; }
            applyParsedRecords(valid);
            closeModal();
            toast('已识别 ' + valid.length + ' 个收货人，共 ' +
              valid.reduce(function (s, r) { return s + r.items.length; }, 0) + ' 条明细');
          }
        }
      ]
    });
    setTimeout(function () { var t = $('parse-text'); if (t) t.focus(); }, 220);
  }

  function applyParsedRecords(records) {
    var doc = currentDoc();
    // 若当前仅一个空收货人，则清空后重新填充
    if (doc.recipients.length === 1 && !hasAnyRecipientInfo(doc.recipients[0])) {
      doc.recipients = [];
    }
    records.forEach(function (r) {
      var rec = newRecipient();
      rec.name = r.name || '';
      rec.phone = r.phone || '';
      rec.address = r.address || '';
      rec.items = r.items.length ? r.items.map(function (it) {
        return newItem({ name: it.name, spec: it.spec || PRODUCT.spec, unit: it.unit || PRODUCT.unit, qty: it.qty });
      }) : [newItem()];
      doc.recipients.push(rec);
    });
    doc.updatedAt = Date.now();
    renderRecipients();
    save();
    refreshPreview();
  }

  /* ==================== 导出 ==================== */
  function td(v, style) {
    return '<td style="' + (style || 'text-align:left;') + '">' + escHtml(v) + '</td>';
  }

  /** 导出带样式的 Excel（HTML 表格 .xls）：间隔放宽，关键信息醒目 */
  function exportExcel() {
    var doc = currentDoc();
    var cols = ['序号', '收货人', '联系电话', '收货地址', '品名', '规格型号', '单位', '数量', '备注'];
    var widths = [52, 115, 145, 360, 125, 105, 72, 85, 135];

    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
      'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
      'xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="UTF-8">' +
      '<!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
      '<x:Name>发货单</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>' +
      '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]-->' +
      '<style>td{vertical-align:middle;}</style>' +
      '</head><body>';

    html += '<table border="1" cellspacing="0" cellpadding="8">';

    // 列宽
    html += '<colgroup>';
    widths.forEach(function (w) { html += '<col width="' + w + '">'; });
    html += '</colgroup>';

    // 大标题
    html += '<tr><td colspan="9" style="font-size:18px;font-weight:bold;text-align:center;height:44px;background:#2563eb;color:#ffffff;letter-spacing:6px;">发货信息整理单</td></tr>';
    // 副标题
    html += '<tr><td colspan="9" style="font-size:12px;text-align:center;color:#64748b;height:30px;">' +
      '单据：' + escHtml(doc.name || '') + '　｜　导出时间：' + nowText() + '</td></tr>';

    // 表头
    html += '<tr>';
    cols.forEach(function (h) {
      html += '<td style="font-weight:bold;text-align:center;background:#dbeafe;color:#1e3a8a;height:32px;font-size:12px;">' + h + '</td>';
    });
    html += '</tr>';

    // 数据：按收货人分组，分组间用醒目标题行隔开
    var idx = 0;
    doc.recipients.forEach(function (rec, ri) {
      var items = rec.items.filter(hasContent);

      html += '<tr><td colspan="9" style="font-weight:bold;background:#eff6ff;color:#1d4ed8;height:30px;font-size:12px;">' +
        '收货人 ' + (ri + 1) + '　姓名：' + escHtml(rec.name || '—') +
        '　电话：' + escHtml(rec.phone || '—') +
        '　地址：' + escHtml(rec.address || '—') +
        '</td></tr>';

      if (!items.length && hasAnyRecipientInfo(rec)) {
        idx++;
        html += '<tr style="height:32px;">' +
          td(idx, 'text-align:center;color:#64748b;') +
          td(rec.name || '', 'font-weight:bold;color:#1d4ed8;') +
          td(rec.phone || '', "font-weight:bold;color:#2563eb;mso-number-format:'\\@';") +
          td(rec.address || '', 'color:#334155;') + td('') + td('', 'text-align:center;') +
          td('', 'text-align:center;') + td('', 'text-align:right;') + td('') + '</tr>';
      }
      items.forEach(function (it) {
        idx++;
        html += '<tr style="height:34px;">' +
          td(idx, 'text-align:center;color:#64748b;') +
          td(rec.name || '', 'font-weight:bold;color:#1d4ed8;') +
          td(rec.phone || '', "font-weight:bold;color:#2563eb;mso-number-format:'\\@';") +
          td(rec.address || '', 'color:#334155;') +
          td(it.name || '', 'font-weight:bold;color:#0f172a;') +
          td(it.spec || '', 'text-align:center;color:#334155;') +
          td(it.unit || '', 'text-align:center;color:#334155;') +
          td(it.qty || '', 'text-align:center;font-weight:bold;font-size:13px;color:#dc2626;') +
          td(it.remark || '', 'color:#64748b;') + '</tr>';
      });
    });

    html += '</table></body></html>';

    var d = new Date();
    var stamp = d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
    var safeName = (doc.name || '发货信息整理单');
    download('\ufeff' + html, safeName + '_' + stamp + '.xls', 'application/vnd.ms-excel');
    toast('已导出 Excel 文件');
  }

  function download(content, filename, mime) {
    var blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ==================== 复制结果 ==================== */
  function copyResult() {
    var text = buildText();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('整理结果已复制到剪贴板'); }
      catch (e) { toast('复制失败，请手动选择预览内容复制'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('整理结果已复制到剪贴板');
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  /* ==================== 单据操作 ==================== */
  function switchDoc(id) {
    if (id === state.currentId) return;
    state.currentId = id;
    save();
    renderAll();
  }

  function addDoc() {
    var doc = newDoc('发货单 ' + (state.docs.length + 1));
    state.docs.push(doc);
    state.currentId = doc.id;
    save();
    renderAll();
    toast('已新建单据');
  }

  function renameDoc() {
    var doc = currentDoc();
    var name = window.prompt('请输入单据名称', doc.name || '');
    if (name === null) return;
    name = name.trim();
    if (!name) return;
    doc.name = name;
    doc.updatedAt = Date.now();
    save();
    renderDocTabs();
    refreshPreview();
    toast('已重命名');
  }

  function duplicateDoc() {
    var doc = currentDoc();
    var copy = JSON.parse(JSON.stringify(doc));
    copy.id = uid();
    copy.name = (doc.name || '单据') + ' 副本';
    copy.recipients = doc.recipients.map(function (r) {
      return {
        id: uid(), name: r.name, phone: r.phone, address: r.address,
        items: r.items.map(function (it) { return newItem(it); })
      };
    });
    copy.updatedAt = Date.now();
    state.docs.push(copy);
    state.currentId = copy.id;
    save();
    renderAll();
    toast('已复制为新单据');
  }

  function removeDoc() {
    if (state.docs.length <= 1) { toast('至少保留一份单据'); return; }
    var doc = currentDoc();
    if (!window.confirm('确定删除单据「' + (doc.name || '未命名') + '」吗？删除后不可恢复。')) return;
    state.docs = state.docs.filter(function (d) { return d.id !== doc.id; });
    state.currentId = state.docs[0].id;
    save();
    renderAll();
    toast('已删除单据');
  }

  function clearAllData() {
    if (!window.confirm('确定清除所有数据吗？\n将删除全部单据及其收货信息、发货明细，且不可恢复。')) return;
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 忽略 */ }
    var doc = newDoc('发货单 1');
    state.docs = [doc];
    state.currentId = doc.id;
    save();
    renderAll();
    toast('已清除所有数据');
  }

  /* ==================== 事件绑定 ==================== */
  function bindEvents() {
    /* --- 单据标签 --- */
    $('doc-tabs').addEventListener('click', function (e) {
      var tab = e.target.closest('.doc-tab');
      if (tab) switchDoc(tab.getAttribute('data-id'));
    });
    $('doc-add').addEventListener('click', addDoc);
    $('doc-rename').addEventListener('click', renameDoc);
    $('doc-duplicate').addEventListener('click', duplicateDoc);
    $('doc-remove').addEventListener('click', removeDoc);

    $('btn-parse').addEventListener('click', openParseModal);
    $('btn-add-recipient').addEventListener('click', function () { addRecipient(true); });

    var box = $('recipients');

    /* --- 收货人 / 明细输入（事件委托） --- */
    box.addEventListener('input', function (e) {
      var el = e.target;
      var field = el.getAttribute && el.getAttribute('data-field');
      if (!field) return;
      var recEl = el.closest('.recipient');
      if (!recEl) return;
      var rec = findRecipient(recEl.getAttribute('data-rid'));
      if (!rec) return;

      var tr = el.closest('tr');
      if (tr) {
        // 明细字段
        var item = rec.items.filter(function (it) { return it.id === tr.getAttribute('data-id'); })[0];
        if (item) item[field] = el.value;
        updateRecipientSummary(rec);
      } else {
        // 收货人字段
        rec[field] = el.value;
      }
      rec.updatedAt = Date.now();
      currentDoc().updatedAt = Date.now();
      save();
      refreshPreview();
    });

    /* --- 点击操作（添加行 / 删除收货人 / 行复制删除） --- */
    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-act]');
      if (!btn) return;
      var act = btn.getAttribute('data-act');
      var recEl = btn.closest('.recipient');
      var rec = recEl ? findRecipient(recEl.getAttribute('data-rid')) : null;

      if (act === 'add-row' && rec) {
        addRow(rec, true);
      } else if (act === 'del-recipient' && rec) {
        removeRecipient(rec.id);
      } else if ((act === 'dup' || act === 'del') && rec) {
        var tr = btn.closest('tr');
        var id = tr.getAttribute('data-id');
        var idx = -1;
        rec.items.forEach(function (it, i) { if (it.id === id) idx = i; });
        if (idx < 0) return;
        if (act === 'del') {
          rec.items.splice(idx, 1);
          if (!rec.items.length) rec.items.push(newItem());
        } else {
          rec.items.splice(idx + 1, 0, newItem(rec.items[idx]));
        }
        renderRecipients();
        save();
        refreshPreview();
      }
    });

    /* --- 回车：跳到下一行同列，末行则新增 --- */
    box.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var input = e.target;
      if (!input || (input.tagName !== 'INPUT' && input.tagName !== 'TEXTAREA')) return;
      var tr = input.closest('tr');
      if (!tr) return;
      e.preventDefault();
      var field = input.getAttribute('data-field');
      var recEl = input.closest('.recipient');
      var rec = findRecipient(recEl.getAttribute('data-rid'));
      var rows = Array.prototype.slice.call(recEl.querySelectorAll('tbody tr'));
      var i = rows.indexOf(tr);
      if (i === rows.length - 1) {
        addRow(rec, true);
      } else {
        var next = rows[i + 1].querySelector('input[data-field="' + field + '"]');
        if (next) next.focus();
      }
    });

    /* --- 顶部操作 --- */
    $('btn-copy').addEventListener('click', copyResult);
    $('btn-csv').addEventListener('click', exportExcel);
    $('btn-print').addEventListener('click', function () {
      renderPrintView();
      window.print();
    });
    $('btn-clear').addEventListener('click', clearAllData);

    /* --- 模态框 --- */
    $('modal-close').addEventListener('click', closeModal);
    $('modal-mask').addEventListener('click', function (e) {
      if (e.target === $('modal-mask')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    /* --- 夜间模式 --- */
    var dark = false;
    try { dark = localStorage.getItem(DARK_KEY) === '1'; } catch (e) { /* 忽略 */ }
    applyDark(dark);
    $('btn-dark').addEventListener('click', function () {
      applyDark(!document.body.classList.contains('dark'));
    });
  }

  function applyDark(on) {
    if (on) document.body.classList.add('dark');
    else document.body.classList.remove('dark');
    $('btn-dark').textContent = on ? '☀️' : '🌙';
    try { localStorage.setItem(DARK_KEY, on ? '1' : '0'); } catch (e) { /* 忽略 */ }
  }

  /* ==================== 初始化 ==================== */
  function init() {
    load();
    bindEvents();
    renderAll();
  }

  init();
})();
