/* ETF Flows dashboard — alex
   Scheme A (owner decision, 2026-11-05): at page load, fetch the JSON
   published by the etf-flows data repository and render in the browser.
   This site never writes to that repository and it never writes here. */
(function () {
  'use strict';
  var SOURCES = {
    cn: 'https://raw.githubusercontent.com/newmymujian-hash/etf-flows/main/data/cn.json',
    us: 'https://raw.githubusercontent.com/newmymujian-hash/etf-flows/main/data/us.json'
  };
  var INFLOW = '#B3402A', OUTFLOW = '#3E7C59', GRAY = '#6B727A';
  var PALETTE = ['#5A6D86', '#B3402A', '#3E7C59', '#C29B40', '#7A5C8F', '#4E7E8C',
                 '#A05C7A', '#6B8E4E', '#8C6A4E', '#546E7A', '#2E5E6E', '#96503F'];
  /* English display labels for China A-share ETFs (renderings of the
     exchange short names delivered in the data; codes are authoritative). */
  var CN_LABELS = {
    '588200': 'STAR Chip ETF', '159516': 'Guotai Semiconductor Equipment ETF',
    '159995': 'ChinaAMC Chip ETF', '512480': 'Semiconductor ETF',
    '512880': 'Brokerage ETF', '512000': 'Brokerage ETF', '159841': 'Tianhong Brokerage ETF',
    '512800': 'Bank ETF', '515290': 'Bank ETF',
    '512170': 'Healthcare ETF', '159992': 'Yinhua Innovative Drug ETF',
    '512010': 'Pharmaceutical ETF', '515120': 'Innovative Drug ETF',
    '159755': 'GF Battery ETF', '515790': 'Solar ETF',
    '159796': 'China Universal Battery ETF', '561910': 'Battery ETF',
    '512660': 'Defense ETF', '512710': 'Defense Leaders ETF', '512680': 'Defense ETF',
    '159819': 'E Fund AI ETF', '159852': 'Harvest Software ETF', '515070': 'AI ETF',
    '515230': 'Software ETF', '515980': 'Artificial Intelligence ETF',
    '159928': 'China Universal Consumer ETF', '512690': 'Liquor ETF', '515170': 'Food & Beverage ETF',
    '512400': 'Nonferrous Metals ETF', '515220': 'Coal ETF', '159157': 'Tianhong Nonferrous Metals ETF'
  };

  function sym(cur) { return cur === 'CNY' ? '¥' : '$'; }
  function fmtMoney(v, cur) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    var a = Math.abs(v), s = v < 0 ? '-' : (v > 0 ? '+' : '');
    if (a >= 1e9) return s + sym(cur) + (a / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return s + sym(cur) + (a / 1e6).toFixed(1) + 'M';
    return s + sym(cur) + a.toFixed(0);
  }
  function fmtBn(v) { /* billions, for chart axes / heatmap cells */
    if (v === null || v === undefined || isNaN(v)) return '—';
    var b = v / 1e9;
    return (b > 0 ? '+' : '') + b.toFixed(Math.abs(b) >= 10 ? 1 : 2);
  }
  function fmtShares(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    return String(v);
  }
  function fmtPct(v) {
    if (v === null || v === undefined || isNaN(v)) return '—';
    return (v > 0 ? '+' : '') + Number(v).toFixed(2) + '%';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function labelFor(market, e) {
    if (market === 'cn' && CN_LABELS[e.code]) return CN_LABELS[e.code];
    return e.name || e.code;
  }

  var store = {};   // market -> data
  var charts = {};  // element id -> echarts instance

  function renderMeta(m, d) {
    var el = document.getElementById(m + '-meta');
    var upd = '';
    if (d.updated_at) {
      var t = String(d.updated_at).replace('T', ' ').slice(0, 16);
      upd = ' · Updated ' + esc(t) + ' (UTC' + esc(String(d.updated_at).slice(19)) + ')';
    }
    el.textContent = 'Data date: ' + d.data_date + upd;
  }

  function renderStats(m, d) {
    var el = document.getElementById(m + '-stats');
    var secs = d.sectors.slice();
    var nIn = secs.filter(function (s) { return s.net_inflow_today > 0; }).length;
    var top = secs.slice().sort(function (a, b) { return b.net_inflow_today - a.net_inflow_today; })[0];
    var bot = secs.slice().sort(function (a, b) { return a.net_inflow_today - b.net_inflow_today; })[0];
    el.innerHTML =
      '<div class="etf-stat"><div class="etf-stat-label">Total net flow</div>' +
      '<div class="etf-stat-value ' + (d.total_net_inflow >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(d.total_net_inflow, d.currency) + '</div></div>' +
      '<div class="etf-stat"><div class="etf-stat-label">Largest inflow</div>' +
      '<div class="etf-stat-value sm">' + esc(top.name) + ' <span class="pos">' + fmtMoney(top.net_inflow_today, d.currency) + '</span></div></div>' +
      '<div class="etf-stat"><div class="etf-stat-label">Largest outflow</div>' +
      '<div class="etf-stat-value sm">' + esc(bot.name) + ' <span class="neg">' + fmtMoney(bot.net_inflow_today, d.currency) + '</span></div></div>' +
      '<div class="etf-stat"><div class="etf-stat-label">Sectors in / out</div>' +
      '<div class="etf-stat-value sm">' + nIn + ' in · ' + (secs.length - nIn) + ' out</div></div>';
  }

  function renderBar(m, d) {
    var el = document.getElementById(m + '-bar');
    if (!window.echarts) { el.innerHTML = '<p class="etf-status">Chart library unavailable — see the tables below.</p>'; return; }
    var secs = d.sectors.slice().sort(function (a, b) { return a.net_inflow_today - b.net_inflow_today; });
    var chart = echarts.init(el);
    charts[m + '-bar'] = chart;
    chart.setOption({
      grid: { left: 8, right: 60, top: 8, bottom: 8, containLabel: true },
      xAxis: { type: 'value', axisLabel: { color: GRAY, formatter: function (v) { return (v / 1e9).toFixed(0); } },
               splitLine: { lineStyle: { color: '#E6E3DA' } } },
      yAxis: { type: 'category', inverse: true,
               data: secs.map(function (s) { return s.name + (s.signal_95 ? ' ◆' : ''); }),
               axisLabel: { color: '#2C3135', fontSize: 12.5 } },
      tooltip: { trigger: 'item', formatter: function (p) {
        var s = secs[p.dataIndex];
        return esc(s.name) + '<br/>Net flow: ' + fmtMoney(s.net_inflow_today, d.currency) +
               (s.signal_95 ? '<br/>◆ Extreme flow day' : '');
      } },
      series: [{ type: 'bar', data: secs.map(function (s) {
        return { value: s.net_inflow_today, itemStyle: { color: s.net_inflow_today >= 0 ? INFLOW : OUTFLOW } };
      }), label: { show: true, position: 'right', color: GRAY, fontSize: 11.5,
                   formatter: function (p) { return fmtBn(p.value); } } }]
    });
  }

  function cumSeries(d, win) {
    var dates = d.history.dates, n = dates.length, start = 0;
    if (win === 'ytd') {
      var yr = d.data_date.slice(0, 4);
      start = dates.findIndex(function (x) { return x.slice(0, 4) === yr; });
      if (start < 0) start = 0;
    } else if (win !== 'all') {
      start = Math.max(0, n - Number(win));
    }
    var outDates = dates.slice(start);
    var series = d.sectors.map(function (s, i) {
      var daily = d.history.daily_by_sector[s.name] || [];
      var run = 0, vals = [];
      for (var j = start; j < n; j++) {
        var v = daily[j];
        run += (v === null || v === undefined ? 0 : v);
        vals.push(run);
      }
      return { name: s.name, type: 'line', smooth: true, symbol: 'none',
               lineStyle: { width: 1.6, color: PALETTE[i % PALETTE.length] },
               itemStyle: { color: PALETTE[i % PALETTE.length] }, data: vals };
    });
    return { dates: outDates, series: series };
  }

  function renderCum(m, win) {
    var d = store[m]; if (!d) return;
    var el = document.getElementById(m + '-cum');
    if (!window.echarts) { el.innerHTML = '<p class="etf-status">Chart library unavailable.</p>'; return; }
    var chart = charts[m + '-cum'];
    if (!chart) { chart = echarts.init(el); charts[m + '-cum'] = chart; }
    var c = cumSeries(d, win);
    chart.setOption({
      grid: { left: 8, right: 16, top: 30, bottom: 4, containLabel: true },
      legend: { top: 0, textStyle: { color: GRAY, fontSize: 11 }, itemWidth: 14 },
      xAxis: { type: 'category', data: c.dates, axisLabel: { color: GRAY, fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { color: GRAY, formatter: function (v) { return (v / 1e9).toFixed(0); } },
               splitLine: { lineStyle: { color: '#E6E3DA' } } },
      tooltip: { trigger: 'axis', valueFormatter: function (v) { return fmtBn(v) + 'B'; } },
      series: c.series
    }, true);
  }

  function renderHeat(m, d) {
    var el = document.getElementById(m + '-heat');
    var dates = d.history.dates.slice(-20);
    var off = d.history.dates.length - dates.length;
    var maxAbs = 0;
    d.sectors.forEach(function (s) {
      var arr = d.history.daily_by_sector[s.name] || [];
      for (var j = off; j < arr.length; j++) {
        if (arr[j] !== null && arr[j] !== undefined) maxAbs = Math.max(maxAbs, Math.abs(arr[j]));
      }
    });
    var html = '<table class="heat"><thead><tr><th>Sector</th>';
    dates.forEach(function (dt) { html += '<th>' + esc(dt.slice(5)) + '</th>'; });
    html += '</tr></thead><tbody>';
    d.sectors.forEach(function (s) {
      var arr = d.history.daily_by_sector[s.name] || [];
      html += '<tr><th>' + esc(s.name) + '</th>';
      for (var j = off; j < d.history.dates.length; j++) {
        var v = arr[j];
        if (v === null || v === undefined) { html += '<td class="heat-na">—</td>'; continue; }
        var a = maxAbs ? (0.07 + 0.55 * Math.abs(v) / maxAbs).toFixed(2) : 0.07;
        var bg = v >= 0 ? 'rgba(179,64,42,' + a + ')' : 'rgba(62,124,89,' + a + ')';
        html += '<td style="background:' + bg + '">' + fmtBn(v) + '</td>';
      }
      html += '</tr>';
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function renderTable(m, d) {
    var el = document.getElementById(m + '-table');
    var html = '<table class="etf-table"><thead><tr><th>Code</th><th>ETF</th><th>Shares</th><th>AUM</th><th>Net flow</th><th>Change %</th></tr></thead><tbody>';
    var secs = d.sectors.slice().sort(function (a, b) { return b.net_inflow_today - a.net_inflow_today; });
    secs.forEach(function (s) {
      html += '<tr class="etf-sector-row"><td colspan="4">' + esc(s.name) +
        (s.signal_95 ? ' <span class="badge-extreme">◆ extreme</span>' : '') +
        '</td><td class="' + (s.net_inflow_today >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(s.net_inflow_today, d.currency) + '</td><td></td></tr>';
      var etfs = s.etfs.slice().sort(function (a, b) { return b.net_inflow_today - a.net_inflow_today; });
      etfs.forEach(function (e) {
        html += '<tr><td>' + esc(e.code) + '</td><td title="' + esc(e.name) + '">' + esc(labelFor(m, e)) + '</td>' +
          '<td>' + fmtShares(e.shares) + '</td><td>' + fmtMoney(e.aum, d.currency).replace('+', '') + '</td>' +
          '<td class="' + (e.net_inflow_today >= 0 ? 'pos' : 'neg') + '">' + fmtMoney(e.net_inflow_today, d.currency) + '</td>' +
          '<td>' + fmtPct(e.change_pct) + '</td></tr>';
      });
    });
    html += '</tbody></table>';
    el.innerHTML = html;
  }

  function renderMarket(m, d) {
    store[m] = d;
    renderMeta(m, d); renderStats(m, d); renderBar(m, d);
    renderCum(m, '21'); renderHeat(m, d); renderTable(m, d);
  }

  var pending = 2;
  function done() {
    pending--;
    if (pending === 0) {
      var st = document.getElementById('etf-status');
      if (st) st.style.display = 'none';
    }
  }
  ['cn', 'us'].forEach(function (m) {
    fetch(SOURCES[m]).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      renderMarket(m, d); done();
    }).catch(function (err) {
      var meta = document.getElementById(m + '-meta');
      if (meta) meta.textContent = 'Live data is temporarily unavailable (' + err.message + ').';
      done();
    });
  });

  document.querySelectorAll('.etf-win').forEach(function (w) {
    w.addEventListener('click', function (ev) {
      if (ev.target.tagName !== 'BUTTON') return;
      w.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
      ev.target.classList.add('active');
      renderCum(w.getAttribute('data-market'), ev.target.getAttribute('data-win'));
    });
  });

  window.addEventListener('resize', function () {
    Object.keys(charts).forEach(function (k) { charts[k].resize(); });
  });
})();
