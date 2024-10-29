chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    const url = new URL(details.url);

    if (/^\/contest\/\d+\/submission\/\d+$/.test(url.pathname)) {
      return { redirectUrl: url + "%3f.txt" };
    }

    return {};
  },
  {
    urls: [
      "https://codeforces.com/contest/*/submission/*",
      "https://mirror.codeforces.com/contest/*/submission/*"
    ]
  },
  ["blocking"]
);
