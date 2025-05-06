(function(){
  function pageOverride(){
    const oOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u){
      this._u = u;
      return oOpen.apply(this, arguments);
    };

    const oSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function(body){
      if (body instanceof FormData) {
        this._sid = body.get('submissionId');
      } else if (typeof body === 'string') {
        const p = new URLSearchParams(body);
        this._sid = p.get('currentSubmissionId') || p.get('submissionId');
      }

      const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
      Object.defineProperty(this, 'responseText', {
        configurable: true,
        get() {
          const txt = desc.get.call(this);
          if (this._u.includes('/data/submitSource')) {
            try {
              const obj = JSON.parse(txt);
              if (obj.diffHtml !== undefined) {
                obj.source = obj.diffHtml
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
                delete obj.diffHtml;

                const anchor = document.querySelector(
                  'a.view-source[submissionid="' + this._sid + '"]'
                );
                obj.href = anchor ? anchor.getAttribute('href') : '';

                if (anchor) {
                  const row = anchor.closest('tr');

                  const pa = row.querySelector('td[data-problemid] a');
                  if (pa) {
                    const t = pa.textContent.trim();
                    const m = t.match(/^([^\s-]+)\s*-\s*(.*)$/);
                    obj.problemName = m
                      ? `(${m[1]}) ${m[2]}`
                      : t;
                  }

                  const ua = row.querySelector('td.status-party-cell a');
                  if (ua) {
                    const ti = ua.getAttribute('title');
                    const cl = ua.getAttribute('class');
                    const nm = ua.textContent;
                    obj.partyName = `<span title="${ti}" class="${cl}">${nm}</span>`;
                  }

                  const verdictEl = row.querySelector('.submissionVerdictWrapper > span');
                  obj.verdict = verdictEl ? verdictEl.outerHTML : '';

                  const cn = document.title.replace(/\s*-\s*Codeforces.*$/, '');
                  obj.contestName = cn;
                }

                return JSON.stringify(obj);
              }
            } catch {}
          }
          return txt;
        }
      });

      return oSend.apply(this, arguments);
    };
  }

  const s = document.createElement('script');
  s.textContent = `(${pageOverride.toString()})();`;
  (document.head || document.documentElement).appendChild(s);
  s.remove();
})();
