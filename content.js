(function() {
  const url = window.location.href;

  if (url.endsWith('%3f.txt')) {
    window.history.replaceState({}, document.title, url.replace('%3f.txt', ''));
  }
})();
