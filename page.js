(function () {
  const cache = {};
  function initContestName(cid) {
    if (!(cid in cache)) {
      cache[cid] = 'loading';
      if (cid) fetch(`https://codeforces.com/api/contest.standings?contestId=${cid}&from=1&count=1`)
        .then(r => r.json())
        .then(d => { cache[cid] = d.status === 'OK' ? d.result.contest.name : ''; })
        .catch(() => { cache[cid] = ''; });
    }
  }

  const path = location.pathname;
  const mStatus = path.match(/^\/contest\/(\d+)\/status\b/);
  const mStand = path.match(/^\/contest\/(\d+)\/standings\b/);
  const mPersonal = path.match(/^\/submissions\//);
  const pageType = mStatus ? 'status'
    : mStand ? 'standings'
      : mPersonal ? 'personal'
        : null;
  const pageCid = mStatus ? mStatus[1]
    : mStand ? mStand[1]
      : null;
  if (pageCid) initContestName(pageCid);

  let currentSid = '';
  const _open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (m, u, a, b, c) {
    this._u = u; this._a = a; this._b = b; this._c = c;
    return _open.apply(this, arguments);
  };
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (body) {
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
            if (!(pageCid in cache)) initContestName(pageCid);
            const name = cache[pageCid];
            const href = `/contest/${pageCid}/submission/${sid}`;
            const challengeLink = `/contest/${pageCid}/challenge/${sid}`;
            return JSON.stringify({ contestName: name, source: src, href, challengeLink, offerChallenge });
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
          if (!(effectiveCid in cache)) initContestName(effectiveCid);
          const contestName = cache[effectiveCid] || 'loading';
          let href = (row.querySelector(`a.view-source[submissionid="${sid}"]`) || {}).getAttribute('href') || '';
          if (!href.startsWith(`/contest/${effectiveCid}/submission/`) && !href.startsWith(`/gym/${effectiveCid}/submission/`)) {
            href = `/${parts[1]}/${parts[2]}/submission/${sid}`;
          }
          const challengeLink = `/contest/${effectiveCid}/challenge/${sid}`;
          const t = prob.textContent.trim();
          const m2 = t.match(/^([^\s-]+)\s*-\s*(.*)$/);
          const problemName = m2 ? `(${m2[1]}) ${m2[2]}` : t;
          const ua = row.querySelector('td.status-party-cell a');
          const partyName = ua ? `<span title="${ua.title}" class="${ua.className}">${ua.textContent.trim()}</span>` : '';
          const ve = row.querySelector('.submissionVerdictWrapper>span') || row.querySelector('td.status-verdict-cell span');
          const verdict = ve ? ve.outerHTML : 'Compilation error';

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

  function addCompareUI() {
    const header = document.querySelectorAll('.source-popup-header')[1];
    if (!header || header.querySelector('#compare-btn')) return;

    const hackLink = header.querySelector('a[href*="/challenge/"]');
    if (!hackLink) return;

    header.style.whiteSpace = 'nowrap';
    header.style.overflow = 'visible';

    const box = document.createElement('span');
    box.innerHTML = `
      <input id="compare-prev" placeholder="Previous ID" style="width:9ch;vertical-align:middle">
      <input id="compare-cur"  placeholder="Current ID" value="${currentSid}" style="width:9ch;vertical-align:middle">
      <button id="compare-btn" style="vertical-align:middle">Compare</button>
    `;
    hackLink.insertAdjacentElement('afterend', box);

    document.getElementById('compare-btn').addEventListener('click', () => {
      let prev = document.getElementById('compare-prev').value.trim();
      if (!prev) prev = '20033';
      const cur   = document.getElementById('compare-cur').value.trim();
      const token = document.querySelector('input[name="csrf_token"]').value;
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
        const code = document.querySelectorAll('.source-popup-source')[1];
        code.innerHTML = j.diffHtml;
        if (window.PR) PR.prettyPrint();
      })
      .catch(console.error);
    });
  }
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
})();
