(function () {
  'use strict';

  var CHART_WEEKDAYS = 10;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function seoulToday() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  }

  function toUtc(iso) {
    var p = iso.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }

  function toIso(date) {
    return date.toISOString().slice(0, 10);
  }

  function shortDate(iso) {
    var p = iso.split('-').map(Number);
    return p[1] + '.' + p[2];
  }

  function mondayOf(iso) {
    var date = toUtc(iso);
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
    return toIso(date);
  }

  function total(days, from, to) {
    return days.reduce(function (sum, day) {
      if (day.date >= from && day.date <= to) {
        sum.commits += day.commits;
        sum.issues += day.issues;
        sum.claude += tokensOf(day).claude;
        sum.codex += tokensOf(day).codex;
      }
      return sum;
    }, { commits: 0, issues: 0, claude: 0, codex: 0 });
  }

  function tokensOf(day) {
    return day.tokens || { claude: 0, codex: 0 };
  }

  function compact(value) {
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return Math.round(value / 1000) + 'K';
    return String(value);
  }

  function recentWeekdays(last) {
    var result = [];
    var date = toUtc(last);
    while (result.length < CHART_WEEKDAYS) {
      var weekday = date.getUTCDay();
      if (weekday !== 0 && weekday !== 6) result.unshift(toIso(date));
      date.setUTCDate(date.getUTCDate() - 1);
    }
    return result;
  }

  function addRow(body, label, tag, counts) {
    var row = document.createElement('tr');
    var head = document.createElement('th');
    head.scope = 'row';
    head.textContent = label;
    if (tag) {
      var mark = document.createElement('span');
      mark.className = 'today-tag';
      mark.textContent = tag;
      head.appendChild(mark);
    }
    row.appendChild(head);
    [counts.commits, counts.issues].forEach(function (value) {
      var cell = document.createElement('td');
      cell.textContent = value + '건';
      row.appendChild(cell);
    });
    [counts.claude, counts.codex].forEach(function (value) {
      var cell = document.createElement('td');
      cell.className = 'token';
      cell.title = value.toLocaleString('ko-KR') + ' 토큰';
      cell.textContent = compact(value);
      row.appendChild(cell);
    });
    body.appendChild(row);
  }

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVG_NS, name);
    Object.keys(attrs).forEach(function (key) { el.setAttribute(key, attrs[key]); });
    return el;
  }

  // 위쪽 모서리만 둥근 막대. 아래쪽은 기준선에 맞닿는다.
  function barPath(x, y, width, height, rounded) {
    var r = rounded ? Math.min(4, height, width / 2) : 0;
    return 'M' + x + ' ' + (y + height) + 'V' + (y + r) +
      (r ? 'Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y : '') +
      'H' + (x + width - r) +
      (r ? 'Q' + (x + width) + ' ' + y + ' ' + (x + width) + ' ' + (y + r) : '') +
      'V' + (y + height) + 'Z';
  }

  function drawChart(days, lastDate) {
    var container = document.getElementById('chart');
    var tip = document.getElementById('chart-tip');
    var tableBody = document.getElementById('chart-table');
    var width = 304, height = 92, top = 16, bottom = 18, barWidth = 16, gap = 2;
    var plot = height - top - bottom;
    var slots = recentWeekdays(lastDate);
    var slotWidth = width / slots.length;
    var byDate = {};
    days.forEach(function (day) { byDate[day.date] = day; });
    var peak = slots.reduce(function (max, iso) {
      var day = byDate[iso];
      return day ? Math.max(max, day.commits + day.issues) : max;
    }, 1);
    var peakLabeled = false;

    var svg = svgEl('svg', { viewBox: '0 0 ' + width + ' ' + height });
    svg.appendChild(svgEl('line', {
      'class': 'axis', x1: 0, x2: width, y1: height - bottom + 0.5, y2: height - bottom + 0.5
    }));

    slots.forEach(function (iso, index) {
      var day = byDate[iso] || { commits: 0, issues: 0 };
      var x = index * slotWidth + (slotWidth - barWidth) / 2;
      var hit = svgEl('rect', { 'class': 'hit', x: index * slotWidth, y: 0, width: slotWidth, height: height - bottom, rx: 3 });
      svg.appendChild(hit);

      var sum = day.commits + day.issues;
      var base = height - bottom;
      var commitH = day.commits ? Math.max(3, plot * day.commits / peak) : 0;
      var issueH = day.issues ? Math.max(3, plot * day.issues / peak) : 0;
      var stackGap = commitH && issueH ? gap : 0;
      if (commitH + stackGap + issueH > plot) {
        var scale = (plot - stackGap) / (commitH + issueH);
        commitH *= scale;
        issueH *= scale;
      }
      if (commitH) {
        svg.appendChild(svgEl('path', {
          'class': 'bar-commits', 'pointer-events': 'none',
          d: barPath(x, base - commitH, barWidth, commitH, !issueH)
        }));
      }
      if (issueH) {
        svg.appendChild(svgEl('path', {
          'class': 'bar-issues', 'pointer-events': 'none',
          d: barPath(x, base - commitH - stackGap - issueH, barWidth, issueH, true)
        }));
      }

      // 숫자는 가장 많은 날 하나에만 표시한다.
      if (sum === peak && sum > 0 && !peakLabeled) {
        peakLabeled = true;
        var label = svgEl('text', {
          'class': 'peak', x: x + barWidth / 2, 'text-anchor': 'middle',
          y: base - commitH - stackGap - issueH - 4, 'pointer-events': 'none'
        });
        label.textContent = sum;
        svg.appendChild(label);
      }

      if (index === 0 || index === slots.length - 1) {
        var tick = svgEl('text', {
          x: index === 0 ? 0 : width, y: height - 4,
          'text-anchor': index === 0 ? 'start' : 'end'
        });
        tick.textContent = shortDate(iso);
        svg.appendChild(tick);
      }

      var tipText = shortDate(iso) + ' · 커밋 ' + day.commits + '건 · 이슈 ' + day.issues + '건';
      hit.addEventListener('pointerenter', function () {
        var svgBox = svg.getBoundingClientRect();
        var scale = svgBox.width / width;
        tip.textContent = tipText;
        tip.hidden = false;
        var half = tip.offsetWidth / 2;
        var left = (index + 0.5) * slotWidth * scale;
        tip.style.left = Math.min(Math.max(left, half), svgBox.width - half) + 'px';
        tip.style.top = '0';
      });
      hit.addEventListener('pointerleave', function () { tip.hidden = true; });

      var row = document.createElement('tr');
      [shortDate(iso), day.commits + '건', day.issues + '건'].forEach(function (text) {
        var cell = document.createElement('td');
        cell.textContent = text;
        row.appendChild(cell);
      });
      tableBody.appendChild(row);
    });

    container.appendChild(svg);
  }

  function fillSummary(latest, isToday) {
    var title = document.getElementById('summary-title');
    var list = document.getElementById('summary-list');
    title.textContent = (isToday ? '오늘' : shortDate(latest.date)) + ' 한 일 요약 자세히 보기';
    var groups = latest.summary || [];
    if (!groups.length) {
      var empty = document.createElement('li');
      empty.className = 'empty';
      empty.textContent = '이 날의 요약은 없습니다.';
      list.appendChild(empty);
      return;
    }
    groups.forEach(function (group) {
      var item = document.createElement('li');
      var name = document.createElement('strong');
      name.textContent = group.project;
      item.appendChild(name);
      var counts = document.createElement('span');
      counts.className = 'group-counts';
      counts.textContent = '커밋 ' + group.commits + '건 · 이슈 ' + group.issues + '건';
      item.appendChild(counts);
      if (group.lines.length) {
        var lines = document.createElement('ul');
        group.lines.forEach(function (line) {
          var entry = document.createElement('li');
          entry.textContent = line;
          lines.appendChild(entry);
        });
        item.appendChild(lines);
      }
      list.appendChild(item);
    });
  }

  function render(data) {
    var days = (data.days || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (!days.length) throw new Error('no data');

    var today = seoulToday();
    var latest = days[days.length - 1];
    var isToday = latest.date === today;
    var rows = document.getElementById('status-rows');

    addRow(rows, shortDate(latest.date), isToday ? 'Today' : '', total(days, latest.date, latest.date));
    addRow(rows, '이번 주', '', total(days, mondayOf(today), today));
    addRow(rows, '이번 달', '', total(days, today.slice(0, 7) + '-01', today));
    drawChart(days, latest.date > today ? latest.date : today);
    fillSummary(latest, isToday);

    if (data.updatedAt) {
      var iso = data.updatedAt.slice(0, 10);
      document.getElementById('status-updated').textContent =
        shortDate(iso) + ' ' + data.updatedAt.slice(11, 16) + ' 업데이트';
    }
    document.getElementById('status-body').hidden = false;
  }

  document.querySelectorAll('.company').forEach(function (company) {
    var button = company.querySelector('.toggle-all');
    var items = Array.prototype.slice.call(company.querySelectorAll('details.item'));
    function allOpen() {
      return items.every(function (item) { return item.open; });
    }
    function updateLabel() {
      button.textContent = allOpen() ? '모두 접기' : '모두 펼치기';
    }
    button.addEventListener('click', function () {
      var open = !allOpen();
      items.forEach(function (item) { item.open = open; });
      updateLabel();
    });
    items.forEach(function (item) { item.addEventListener('toggle', updateLabel); });
    updateLabel();
  });

  var openBeforePrint = [];

  fetch('data.json?v=' + Date.now(), { cache: 'no-store' })
    .then(function (response) {
      if (!response.ok) throw new Error(response.status);
      return response.json();
    })
    .then(render)
    .catch(function () {
      document.getElementById('status-error').hidden = false;
    });

  window.addEventListener('beforeprint', function () {
    openBeforePrint = Array.prototype.map.call(document.querySelectorAll('main details'), function (el) { return el.open; });
    document.querySelectorAll('main details').forEach(function (el) { el.open = true; });
  });

  window.addEventListener('afterprint', function () {
    document.querySelectorAll('main details').forEach(function (el, index) { el.open = openBeforePrint[index]; });
  });
})();
