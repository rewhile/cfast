const s = document.createElement("script");
s.src = chrome.runtime.getURL("page.js");
(document.head || document.documentElement).appendChild(s);
s.onload = () => s.remove();
