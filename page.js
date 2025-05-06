(function(){
  const cache = {};
  function getContestName(cid){
    if(!cache[cid]){
      try{
        const req = new XMLHttpRequest();
        req.open("GET", `https://codeforces.com/api/contest.standings?contestId=${cid}&from=1&count=1`, false);
        req.send();
        const d = JSON.parse(req.responseText);
        cache[cid] = d.status==="OK"?d.result.contest.name:"";
      }catch(e){
        cache[cid] = "";
      }
    }
    return cache[cid];
  }

  const p = location.pathname;
  const mStatus   = p.match(/^\/contest\/(\d+)\/status\b/);
  const mStand    = p.match(/^\/contest\/(\d+)\/standings\b/);
  const mPersonal = p.match(/^\/submissions\//);
  const pageType  = mStatus   ? "status"
                   : mStand    ? "standings"
                   : mPersonal ? "personal"
                   : null;
  const pageCid   = mStatus   ? mStatus[1]
                   : mStand    ? mStand[1]
                   : null;

  const oO = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m,u,a,b,c){
    this._u=u; this._a=a; this._b=b; this._c=c;
    return oO.apply(this,arguments);
  };
  const oS = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function(body){
    if(this._u.includes("/data/submitSource")){
      try{
        let sid, csrf;
        if(body instanceof FormData){
          sid = body.get("submissionId");
          csrf= body.get("csrf_token");
        } else {
          const p = new URLSearchParams(body);
          sid = p.get("currentSubmissionId")||p.get("submissionId");
          csrf= p.get("csrf_token");
        }
        this._sid = sid;
        const qs = [
          "action=getDiff",
          "previousSubmissionId=20033",
          `currentSubmissionId=${encodeURIComponent(sid)}`,
          `csrf_token=${encodeURIComponent(csrf)}`
        ].join("&");
        oO.call(this,"POST",`https://codeforces.com/data/submissionsDiff?${qs}`,this._a,this._b,this._c);
      }catch(e){}
    }

    const desc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype,"responseText");
    Object.defineProperty(this,"responseText",{
      configurable:true,
      get:()=>{
        const raw = desc.get.call(this);
        if(!this._u.includes("/data/submitSource")) return raw;
        try{
          const j = JSON.parse(raw);
          const dh = j.diffHtml||"";
          const src = dh.replace(/<del[\s\S]*?<\/del>/gi,"")
                        .replace(/<br\s*\/?>/gi,"\n")
                        .replace(/<(ins|span)[^>]*>/gi,"")
                        .replace(/<\/(ins|span)>/gi,"")
                        .replace(/&nbsp;/g," ")
                        .replace(/&lt;/g,"<")
                        .replace(/&gt;/g,">")
                        .replace(/&amp;/g,"&")
                        .replace(/&quot;/g,'"')
                        .replace(/&#39;/g,"'");
          const sid = this._sid;
          const offerChallenge = "true";
          if(pageType==="standings"){
            const name = getContestName(pageCid);
            const href = `/contest/${pageCid}/submission/${sid}`;
            const cl   = `/contest/${pageCid}/challenge/${sid}`;
            return JSON.stringify({ contestName:name, source:src, href, challengeLink:cl, offerChallenge });
          }
          const row = document.querySelector(`tr[data-submission-id="${sid}"]`);
          if(!row) throw 0;
          const prob = row.querySelector('td[data-problemid] a');
          const prHref = prob.getAttribute("href");
          const parts = prHref.split("/");
          const cid = pageType==="status"
            ? pageCid
            : pageType==="personal"
              ? (parts[1]==="contest"||parts[1]==="gym"?parts[2]:pageCid)
              : pageCid;
          const contestName = cid?getContestName(cid):"";
          let href = (row.querySelector(`a.view-source[submissionid="${sid}"]`)||{}).getAttribute("href")||"";
          if(!href.startsWith(`/contest/${cid}/submission/`) && !href.startsWith(`/gym/${cid}/submission/`)){
            href = `/${parts[1]}/${parts[2]}/submission/${sid}`;
          }
          const challengeLink = `/contest/${cid}/challenge/${sid}`;
          const t = prob.textContent.trim();
          const m2 = t.match(/^([^\s-]+)\s*-\s*(.*)$/);
          const problemName = m2?`(${m2[1]}) ${m2[2]}`:t;
          const ua = row.querySelector('td.status-party-cell a');
          const partyName = ua?`<span title="${ua.title}" class="${ua.className}">${ua.textContent.trim()}</span>`:"";
          const ve = row.querySelector('.submissionVerdictWrapper>span')||row.querySelector('td.status-verdict-cell span');
          const verdict = ve?ve.outerHTML:"Compilation error";
          return JSON.stringify({
            offerChallenge, source:src, href, challengeLink,
            contestName, problemName, partyName, verdict
          });
        }catch(e){
          try{
            const dh = (JSON.parse(raw).diffHtml||"")
              .replace(/<del[\s\S]*?<\/del>/gi,"")
              .replace(/<br\s*\/?>/gi,"\n");
            return JSON.stringify({ source:dh });
          }catch{
            return JSON.stringify({ source:"" });
          }
        }
      }
    });
    return oS.apply(this,arguments);
  };
})();