/**
 * 发货信息解析
 * 粘贴一段或多段收货文本，自动解析出收货人、联系电话、收货地址、商品、规格、数量
 * 纯前端实现
 */
(function () {
  'use strict';

  /* ==================== 常量 ==================== */
  var PRODUCT = { name: '玉露香梨', spec: '12枚', unit: '箱' };

  var ADDR_KEYS = ['省', '市', '区', '县', '旗', '镇', '乡', '街道', '街', '路', '巷', '号', '楼',
    '室', '栋', '幢', '单元', '小区', '花园', '广场', '大厦', '公寓', '村', '组', '队', '工业园',
    '科技园', '产业园', '大道', '开发区', '新区', '州', '园', '城'];

  var STOP_WORDS = ['地址', '收货', '发货', '备注', '联系', '电话', '手机', '单位', '公司',
    '日期', '时间', '名称', '姓名', '编号', '订单', '快递', '物流', '清单', '单号', '数量',
    '驿站', '菜鸟', '小区', '花园', '大厦', '公寓'];

  /* ==================== 工具 ==================== */
  var $ = function (id) { return document.getElementById(id); };

  function escHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /** 单位归一化：件 → 箱，枚 → 颗 */
  function normalizeUnit(u) {
    u = String(u || '').trim();
    if (u === '件') return '箱';
    if (u === '枚') return '颗';
    return u;
  }

  /** 规格单位归一化：规格里的「枚」统一为「颗」 */
  function normalizeSpec(s) {
    return String(s || '').replace(/枚/g, '颗');
  }

  /* ==================== 文本解析（保持不变） ==================== */
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

  /* ==================== UI ==================== */
  var lastRecords = [];

  function openModal() { $('modal-mask').classList.add('show'); }
  function closeModal() { $('modal-mask').classList.remove('show'); }

  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2000);
  }

  function renderEmpty(msg) {
    $('modal-body').innerHTML = '<div class="empty">' + escHtml(msg) + '</div>';
  }

  /** 渲染解析结果列表：收货人 / 联系电话 / 收货地址 / 商品 / 规格 / 数量 */
  function renderResult(records) {
    lastRecords = records;
    if (!records.length) { renderEmpty('未解析到内容'); openModal(); return; }

    var hasValid = records.some(function (r) {
      return r.name || r.phone || r.address || r.items.length;
    });
    if (!hasValid) { renderEmpty('未解析到有效的收货信息'); openModal(); return; }

    var html = '<table class="result-table">';
    html += '<thead><tr>' +
      '<th>收货人</th><th>联系电话</th><th>收货地址</th><th>商品</th><th>规格</th><th>数量</th>' +
      '</tr></thead><tbody>';

    records.forEach(function (rec) {
      var items = rec.items.length ? rec.items : [{}];
      items.forEach(function (it, i) {
        html += '<tr>';
        if (i === 0) {
          html += '<td class="r-name" rowspan="' + items.length + '">' + escHtml(rec.name || '') + '</td>';
          html += '<td class="r-phone" rowspan="' + items.length + '">' + escHtml(rec.phone || '') + '</td>';
          html += '<td rowspan="' + items.length + '">' + escHtml(rec.address || '') + '</td>';
        }
        html += '<td class="r-product">' + escHtml(it.name || PRODUCT.name) + '</td>';
        html += '<td class="r-spec">' + escHtml(normalizeSpec(it.spec || PRODUCT.spec)) + '</td>';
        var qty = it.qty || '1';
        var unit = normalizeUnit(it.unit || PRODUCT.unit);
        html += '<td class="r-qty">' + escHtml(qty + unit) + '</td>';
        html += '</tr>';
      });
    });

    html += '</tbody></table>';
    $('modal-body').innerHTML = html;
    openModal();
  }

  /** 生成可复制的文本：商品/规格/数量 */
  function buildResultText(records) {
    var lines = [];
    records.forEach(function (rec, ri) {
      if (ri > 0) lines.push('');
      lines.push('【收货人 ' + (ri + 1) + '】');
      lines.push('收货人：' + (rec.name || ''));
      lines.push('联系电话：' + (rec.phone || ''));
      lines.push('收货地址：' + (rec.address || ''));
      var items = rec.items.length ? rec.items : [{}];
      items.forEach(function (it, i) {
        var product = it.name || PRODUCT.name;
        var spec = normalizeSpec(it.spec || PRODUCT.spec);
        var qty = (it.qty || '1') + normalizeUnit(it.unit || PRODUCT.unit);
        lines.push((i + 1) + '. ' + product + '/' + spec + '/' + qty);
      });
    });
    return lines.join('\n');
  }

  function copyResult() {
    var text = buildResultText(lastRecords);
    if (!text.trim()) { toast('暂无内容可复制'); return; }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast('已复制到剪贴板'); }
      catch (e) { toast('复制失败，请手动复制'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        toast('已复制到剪贴板');
      }).catch(fallback);
    } else {
      fallback();
    }
  }

  /* ==================== 事件 ==================== */
  function bindEvents() {
    $('btn-parse').addEventListener('click', function () {
      var text = $('input-text').value;
      if (!text.trim()) { renderEmpty('请先粘贴需要解析的内容'); openModal(); return; }
      renderResult(parseMultiReceiver(text));
    });

    $('btn-clear').addEventListener('click', function () {
      $('input-text').value = '';
      closeModal();
      $('input-text').focus();
    });

    $('modal-copy').addEventListener('click', copyResult);
    $('modal-close').addEventListener('click', closeModal);
    $('modal-close-btn').addEventListener('click', closeModal);
    $('modal-mask').addEventListener('click', function (e) {
      if (e.target === $('modal-mask')) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeModal();
    });

    // Ctrl/Cmd + Enter 快捷解析
    $('input-text').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        $('btn-parse').click();
      }
    });
  }

  function init() {
    bindEvents();
  }

  init();
})();
