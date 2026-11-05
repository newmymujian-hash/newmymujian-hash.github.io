/* Homepage ETF flow summary cards — fetches the same JSON as /etf/. */
(function () {
  'use strict';
  var SOURCES = {
    cn: 'https://raw.githubusercontent.com/newmymujian-hash/etf-flows/main/data/cn.json',
    us: 'https://raw.githubusercontent.com/newmymujian-hash/etf-flows/main/data/us.json'
  };
  function sym(cur) { return cur === 'CNY' ? '¥' : '$'; }
  function fmtMoney(v, cur) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var a = Math.abs(v), s = v < 0 ? '-' : (v > 0 ? '+' : '');
    if (a >= 1e9) return s + sym(cur) + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + sym(cur) + (a / 1e6).toFixed(1) + 'M';
    return s + sym(cur) + a.toFixed(0);
  }
  ['cn', 'us'].forEach(function (m) {
    var totalEl = document.getElementById('flow-' + m + '-total');
    if (!totalEl) return;
    fetch(SOURCES[m]).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      totalEl.textContent = fmtMoney(d.total_net_inflow, d.currency);
      totalEl.className = 'flow-total ' + (d.total_net_inflow >= 0 ? 'pos' : 'neg');
      var sorted = d.sectors.slice().sort(function (a, b) { return b.net_inflow_today - a.net_inflow_today; });
      var top = sorted.filter(function (s) { return s.net_inflow_today > 0; }).slice(0, 3);
      if (!top.length) top = sorted.slice(0, 1);
      document.getElementById('flow-' + m + '-top').textContent =
        'Top inflows: ' + top.map(function (s) { return s.name + ' ' + fmtMoney(s.net_inflow_today, d.currency); }).join(' · ');
      document.getElementById('flow-' + m + '-date').textContent = 'Data date: ' + d.data_date;
    }).catch(function () {
      totalEl.textContent = '—';
      document.getElementById('flow-' + m + '-top').textContent = 'Live data is temporarily unavailable.';
    });
  });
})();
