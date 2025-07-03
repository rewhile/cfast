(function () {
  const contestMeta = {};
  const TTL_MS      = 24 * 60 * 60 * 1000;
  const standingsInfo = {};

  (() => {
    try {
      const raw = localStorage.getItem('cfast_contest_list');
      const ts  = +localStorage.getItem('cfast_contest_list_ts') || 0;
      if (raw && Date.now() - ts < TTL_MS) {
        JSON.parse(raw).forEach(c => {
          contestMeta[c.id] = { name:c.name, start:c.start, dur:c.dur };
        });
      }
    } catch {}
  })();

  let metaPromise = null;
  function refreshContestMeta () {
    if (metaPromise) return metaPromise;
    metaPromise = fetch('https://codeforces.com/api/contest.list')
      .then(r => r.json())
      .then(j => {
        if (j.status !== 'OK') return;
        const arr = j.result.map(c => ({
          id: c.id, name: c.name,
          start: c.startTimeSeconds, dur: c.durationSeconds
        }));
        arr.forEach(c => { contestMeta[c.id] = {name:c.name,start:c.start,dur:c.dur}; });
        try{
          localStorage.setItem('cfast_contest_list', JSON.stringify(arr));
          localStorage.setItem('cfast_contest_list_ts', Date.now().toString());
        }catch{}
      })
      .catch(console.error);
    return metaPromise;
  }

  function ensureContest(cid){
    if (contestMeta[cid]) return;
    const ts  = +localStorage.getItem('cfast_contest_list_ts') || 0;
    if (Date.now() - ts > TTL_MS) metaPromise = null;
    refreshContestMeta();
  }

  function parseSubmissionTs(row) {
    const td  = row.querySelector('td:nth-child(2)');
    if (!td) return 0;
    const raw = td.childNodes[0].wholeText.trim();
    const sup = td.querySelector('sup')?.textContent || '';
    const m   = sup.match(/UTC([+-]?\d+)/);
    const off = m ? Number(m[1]) : 0;
    const date = new Date(`${raw} UTC${off >= 0 ? '+' : ''}${off}`);
    return Math.floor(date.getTime() / 1000);
  }

  function contestLabel(cid, ts) {
    const meta = contestMeta[cid];
    if (!meta) { ensureContest(); return 'loading'; }
    const during =
      ts && meta.start && meta.dur &&
      ts >= meta.start && ts <= meta.start + meta.dur;
    const tag   = during
        ? '<span style="color:green">DURING</span>'
        : '<span style="color:red">PRACTICE</span>';
    return `${tag} ${meta.name}`;
  }

  const path = location.pathname;
  const mStatus = path.match(/^\/contest\/(\d+)\/status\b/);
  const mStand = path.match(/^\/(gym|contest)\/(\d+)\/standings\b/);
  const mFav   = path.match(/^\/favourite\/submissions\b/);
  const mPersonal = path.match(/^\/submissions\//);
  const pageType = mStatus ? 'status'
    : mStand ? 'standings'
      : mPersonal ? 'personal'
        :  mFav        ? 'status'
          : null;
  console.log(mStand)
  let pageCid = mStatus ? mStatus[1]
    : mStand ? mStand[2]
      : null;
  if (mFav && !pageCid) {
    pageCid = new URLSearchParams(location.search).get('contest');
  }
  if (pageCid) ensureContest(pageCid);

  let currentSid = '';
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, a, b, c) {
    this._u = u; this._a = a; this._b = b; this._c = c;
    return _open.apply(this, arguments);
  };
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
    if (this._u.includes('/data/standings')) {
      this.addEventListener('load', () => {
        try {
          const arr   = JSON.parse(this.responseText);
          let lastSid = '';
          for (const item of arr) {
            if (item.type !== 'SUBMIT') continue;
            const sid = String(item.submissionId);

            let problemName = '';
            const pm = item.problem.match(/title="([^"]+)"[^>]*>([^<]+)<\/a>/);
            if (pm) problemName = `(${pm[2]}) ${pm[1]}`;

          let ctSec, ctAbs;
          if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(item.contestTime)) {
            const p = item.contestTime.split(':').map(Number);
            ctSec   = p[0] * 3600 + p[1] * 60 + (p[2] ?? 0);
          } else {
            const d = new Date(item.contestTime.replace(/\u00a0/g, ' '));
            if (!isNaN(d)) ctAbs = Math.floor(d.getTime() / 1000);
          }
            standingsInfo[sid] = {
              prevId   : lastSid,
              verdict  : item.verdict,
              problem  : problemName,
              partyHTML: item.party,
              ctSec,
              ctAbs
            };
            lastSid = sid;
          }
        } catch(e) { console.error('[cfast] standings parse failed', e); }
      })
    }
    if (this._u.includes('/data/submitSource')) {
      try {
        let sid, csrf;
        if (body instanceof FormData) {
          sid = body.get('submissionId');
          csrf = body.get('csrf_token');
        } else {
          const p = new URLSearchParams(body);
          sid = p.get('currentSubmissionId') || p.get('submissionId');
          csrf = p.get('csrf_token');
        }
        this._sid = sid;
        currentSid = sid;
        const qs = [
          'action=getDiff',
          'previousSubmissionId=20033',
          `currentSubmissionId=${encodeURIComponent(sid)}`,
          `csrf_token=${encodeURIComponent(csrf)}`
        ].join('&');
        _open.call(this, 'POST', `https://codeforces.com/data/submissionsDiff?${qs}`, this._a, this._b, this._c);
      } catch { }
    }

    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    Object.defineProperty(this, 'responseText', {
      configurable: true,
      get: () => {
        const raw = desc.get.call(this);
        if (!this._u.includes('/data/submitSource')) return raw;
        try {
          const j = JSON.parse(raw);
          const dh = j.diffHtml || '';
          const src = dh
            .replace(/<del[\s\S]*?<\/del>/gi, '')
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<(ins|span)[^>]*>/gi, '')
            .replace(/<\/(ins|span)>/gi, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'");
          const sid = this._sid;
          const offerChallenge = 'true';

          if (pageType === 'standings') {
            ensureContest(pageCid);

          let cell =
            document.querySelector(`td[acceptedsubmissionid="${sid}"], td[submissionid="${sid}"]`);
          if (!cell) {
            const linkEl = document.querySelector(`a[href*="/submission/${sid}"]`);
            cell = linkEl ? linkEl.closest('td') : null;
          }
          const row = cell ? cell.closest('tr') : (document.querySelector(`a[href*="/submission/${sid}"]`)?.closest('tr') ?? null);

          const cached = standingsInfo[sid] || {};

          let partyName = '';
          let handle    = '';
          if (row) {
            const ua = row.querySelector('.contestant-cell a, a[href^="/profile/"]');
            if (ua) {
              handle    = ua.textContent.trim();
              partyName = `<span title="${ua.title}" class="${ua.className}">${handle}</span>`;
            }
          }
          if (!partyName && cached.partyHTML) {
            partyName = cached.partyHTML;
            const mH  = cached.partyHTML.match(/\/profile\/([^"]+)/);
            if (mH) handle = mH[1];
          }

            const meta = contestMeta[pageCid];
            let contestName = meta ? meta.name : document.querySelector('.contest-name').childNodes[1].textContent.trim();
            if (contestName && handle) {
              const url = `/submissions/${encodeURIComponent(handle)}/contest/${pageCid}`;
              contestName = `<a href="${url}" target="_blank">${contestName}</a>`;
            }

          let problemName = '';

          if (!problemName && cell && cell.cellIndex !== undefined) {
            const th = cell.closest('table')?.rows[0]?.cells[cell.cellIndex];
            const a  = th?.querySelector('a');
            if (a) {
              const t = (a.getAttribute('title') || a.textContent).trim();
              const m = t.match(/^([A-Z])\s*-\s*(.*)$/);
              problemName = m ? `(${m[1]}) ${m[2]}` : t;
            }
          }
          if (!problemName && cached.problem) problemName = cached.problem;

          let verdict = cached.verdict || '—';
          if (verdict === '—' && cell) {
            const ok  = cell.querySelector('.cell-accepted');
            const bad = cell.querySelector('.cell-rejected');
            verdict   = ok ? ok.outerHTML : bad ? bad.outerHTML : 'Compilation error';
          }

            const href          = `/contest/${pageCid}/submission/${sid}`;
            const challengeLink = `/contest/${pageCid}/challenge/${sid}`;
            return JSON.stringify({
              contestName,
              problemName,
              partyName,
              verdict,
              source: src,
              href,
              challengeLink,
              offerChallenge
            });
          }

          const row = document.querySelector(`tr[data-submission-id="${sid}"]`);
          if (!row) throw 0;
          const prob = row.querySelector('td[data-problemid] a');
          const prHref = prob.getAttribute('href');
          const parts = prHref.split('/');
          let effectiveCid = pageType === 'status'
            ? pageCid
            : pageType === 'personal'
              ? ((parts[1] === 'contest' || parts[1] === 'gym') ? parts[2] : pageCid)
              : pageCid;
          ensureContest(effectiveCid);
          const subTs       = parseSubmissionTs(row);
          const meta        = contestMeta[effectiveCid];
          let   contestName = contestLabel(effectiveCid, subTs);
          let href = (row.querySelector(`a.view-source[submissionid="${sid}"]`) || {}).getAttribute('href') || '';
          if (!href.startsWith(`/contest/${effectiveCid}/submission/`) && !href.startsWith(`/gym/${effectiveCid}/submission/`)) {
            href = `/contest/${parts[2]}/submission/${sid}`;
          }
          const challengeLink = `/contest/${effectiveCid}/challenge/${sid}`;
          const t = prob.textContent.trim();
          const m2 = t.match(/^([^\s-]+)\s*-\s*(.*)$/);
          const problemName = m2 ? `(${m2[1]}) ${m2[2]}` : t;
          const ua = row.querySelector('td.status-party-cell a');
          const partyName = ua ? `<span title="${ua.title}" class="${ua.className}">${ua.textContent.trim()}</span>` : '';
          const handle    = ua ? ua.textContent.trim() : '';
          const ve = row.querySelector('.submissionVerdictWrapper>span') || row.querySelector('td.status-verdict-cell span');
          const verdict = ve ? ve.outerHTML : 'Compilation error';

          if (handle && meta?.name) {
            const url  = `/submissions/${encodeURIComponent(handle)}/contest/${effectiveCid}`;
            const link = `<a href="${url}" target="_blank">${meta.name}</a>`;
            contestName = contestName.replace(meta.name, link);
          }

          return JSON.stringify({
            offerChallenge, source: src, href, challengeLink,
            contestName, problemName, partyName, verdict
          });
        } catch (e1) {
          try {
            const j = JSON.parse(raw);
            const dh = j.diffHtml || '';
            const src = dh
              .replace(/<del[\s\S]*?<\/del>/gi, '')
              .replace(/<br\s*\/?>/gi, '\n')
              .replace(/<(ins|span)[^>]*>/gi, '')
              .replace(/<\/(ins|span)>/gi, '')
              .replace(/&nbsp;/g, ' ')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&amp;/g, '&')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'");
            return JSON.stringify({ source: src });
          } catch {
            return JSON.stringify({ source: '' });
          }
        }
      }
    });
    return _send.apply(this, arguments);
  };

  let compareModeActive = false;
  document.addEventListener('keydown', function(e) {
    if (!/^\/submissions\//.test(location.pathname)
      && !/^\/favourite\/submissions/.test(location.pathname)
      && !/^\/contest\/\d+\/status/.test(location.pathname)) return;
    const popupHeaders = document.querySelectorAll('.source-popup-header');
    const popupSources = document.querySelectorAll('.source-popup-source');
    const popupHeader = popupHeaders[1] || popupHeaders[0];
    const popupSource = popupSources[1] || popupSources[0];
    if (!popupHeader || !popupSource || popupSource.innerHTML.trim() === '') return;
    if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
      if (e.repeat) return;
      e.preventDefault();
      compareModeActive = !compareModeActive;
      console.log('[cfast] Compare Mode:', compareModeActive ? 'ON' : 'OFF');
      if (compareModeActive) {
        const btn = document.getElementById('compare-btn');
        if (btn) btn.click();
      } else {
        const curRow = document.querySelector(`tr[data-submission-id=\"${currentSid}\"]`);
        if (curRow) {
          const link = curRow.querySelector('a.view-source');
          if (link) link.click();
        }
      }
      return;
    }
    if (!e.shiftKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    if (e.repeat) return;
    e.preventDefault();
    const curRow = document.querySelector(`tr[data-submission-id="${currentSid}"]`);
    if (!curRow) return;
    let targetRow = null;
    if (e.key === 'ArrowLeft') {
      let prev = curRow.previousElementSibling;
      while (prev && !prev.hasAttribute('data-submission-id')) prev = prev.previousElementSibling;
      targetRow = prev;
    } else if (e.key === 'ArrowRight') {
      let next = curRow.nextElementSibling;
      while (next && !next.hasAttribute('data-submission-id')) next = next.nextElementSibling;
      targetRow = next;
    }
    if (targetRow) {
      const link = targetRow.querySelector('a.view-source');
      if (link) link.click();
      setTimeout(() => {
        if (compareModeActive) {
          const btn = document.getElementById('compare-btn');
          if (btn) btn.click();
        }
      }, 200);
    }
  });

  function startObserver() {
    const cb = () => {
      const codeEls = document.querySelectorAll('.source-popup-source');
      if (codeEls.length > 1 && codeEls[1].innerHTML.trim() !== '') addCompareUI();
    };

    (function attach() {
      const target = document.body || document.documentElement;
      if (!target) {
        requestAnimationFrame(attach);
        return;
      }
      new MutationObserver(cb).observe(target, { childList: true, subtree: true });
    })();
  }
  startObserver();

  function favouriteAndOpen() {
    if (!location.pathname.startsWith('/favourite/submissions')) return;

    const qs           = new URLSearchParams(location.search);
    const contestId    = qs.get('contest');
    const submissionId = qs.get('submission');
    if (!contestId || !submissionId) return;

    const csrf = document.querySelector('meta[name="X-Csrf-Token"]')?.content;
    if (!csrf) {
      console.warn('[cfast] CSRF token not found; aborting.');
      return;
    }

    const row = document.querySelector(`tr[data-submission-id="${submissionId}"]`);

    if (row) {
      fetch('/data/favourite', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body:
          'entityId='    + encodeURIComponent(submissionId) +
          '&type=SUBMISSION&isFavourite=false' +
          '&csrf_token=' + encodeURIComponent(csrf),
      }).catch(console.error);

      history.replaceState(null, '', `/contest/${contestId}/submission/${submissionId}`);
      const link = row.querySelector('a.view-source');
      if (link) link.click();
      return;
    }

    fetch('/data/favourite', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body:
        'entityId=' + encodeURIComponent(submissionId) +
        '&type=SUBMISSION&isFavourite=true' +
        '&csrf_token=' + encodeURIComponent(csrf),
    }).then(r => r.json()).then(j => {
        if (j.success !== 'true') {
          console.error('[cfast] favourite failed', j);
          return;
        }
        location.reload();
      }).catch(console.error);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', favouriteAndOpen, { once: true });
  } else {
    favouriteAndOpen();
  }

  function addCompareUI(force) {
    const header = document.querySelectorAll('.source-popup-header')[1] || document.querySelectorAll('.source-popup-header')[0];
    if (!header) return;
    let box = header.querySelector('#compare-box');
    if (box && !force) return;
    if (box && force) box.remove();

    const hackLink = header.querySelector('a[href*="/challenge/"]');
    header.style.whiteSpace = 'nowrap';
    header.style.overflow = 'visible';

    let prevId = '';
    if (pageType === 'standings') {
      const cell =
        document.querySelector(`td[acceptedsubmissionid="${currentSid}"], td[submissionid="${currentSid}"]`) ||
        document.querySelector(`a[href*="/submission/${currentSid}"]`)?.closest('td');
      const aid = cell?.getAttribute('acceptedsubmissionid');
      if (aid && aid !== currentSid) prevId = aid;
      if (!prevId && standingsInfo[currentSid]?.prevId) {
        prevId = standingsInfo[currentSid].prevId;
      }
    } else {
      const currentRow = document.querySelector(`tr[data-submission-id="${currentSid}"]`);
      if (currentRow) {
        const prevRow = currentRow.nextElementSibling;
        if (prevRow && prevRow.hasAttribute('data-submission-id')) {
          prevId = prevRow.getAttribute('data-submission-id');
        }
      }
    }

    box = document.createElement('span');
    box.id = 'compare-box';
    box.innerHTML = `
      <button id="compare-btn" style="vertical-align:middle">Compare</button>
      <input id="compare-prev" placeholder="Previous ID" value="${prevId}" style="width:9ch;vertical-align:middle">
      <input id="compare-cur"  placeholder="Current ID" value="${currentSid}" style="width:9ch;vertical-align:middle">
    `;
    if (hackLink) {
      hackLink.insertAdjacentElement('afterend', box);
    } else {
      header.appendChild(box);
    }

    const compareBtn = document.getElementById('compare-btn');
    compareBtn.addEventListener('click', () => {
      let prev = document.getElementById('compare-prev').value.trim();
      if (!prev) prev = '20033';
      const cur   = document.getElementById('compare-cur').value.trim();
      const token = document.querySelector('input[name="csrf_token"]').value;

      (function updateBtnWithDiff () {
        let diff = null;

        const prevRow = document.querySelector(`tr[data-submission-id="${prev}"]`);
        const curRow  = document.querySelector(`tr[data-submission-id="${cur}"]`);
        if (prevRow && curRow) {
          const prevTs = parseSubmissionTs(prevRow);
          const curTs  = parseSubmissionTs(curRow);
          if (prevTs && curTs) diff = Math.abs(curTs - prevTs);
        }

        if (diff === null && pageType === 'standings') {
          const pInfo = standingsInfo[prev] || {};
          const cInfo = standingsInfo[cur]  || {};
          if (pInfo.ctSec !== undefined && cInfo.ctSec !== undefined) {
            diff = Math.abs(cInfo.ctSec - pInfo.ctSec);
          } else if (pInfo.ctAbs !== undefined && cInfo.ctAbs !== undefined) {
            diff = Math.abs(cInfo.ctAbs - pInfo.ctAbs);
          }
        }

        if (diff === null) return;

        const mm = Math.floor(diff / 60);
        const ss = diff % 60;
        compareBtn.textContent = `${mm}:${ss.toString().padStart(2,'0')} diff`;
      })();

      fetch(
        `/data/submissionsDiff?${new URLSearchParams({
          action:               'getDiff',
          previousSubmissionId: prev,
          currentSubmissionId:  cur,
          csrf_token:           token
        })}`,
        { method: 'POST', credentials: 'same-origin' }
      )
      .then(r => r.json())
      .then(j => {
        const code = document.querySelectorAll('.source-popup-source')[1] || document.querySelectorAll('.source-popup-source')[0];
        code.innerHTML = j.diffHtml;
        if (window.PR) PR.prettyPrint();
      })
      .catch(console.error);
    });
  }
})();
