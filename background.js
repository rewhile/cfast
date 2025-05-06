chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (
      details.method === "POST" &&
      details.url.startsWith("https://codeforces.com/data/submitSource")
    ) {
      const form = details.requestBody.formData;
      const currentSubmissionId = form.submissionId[0];
      const csrfToken = form.csrf_token[0];

      const newUrl = "https://codeforces.com/data/submissionsDiff";
      const qs = [
        "action=getDiff",
        "previousSubmissionId=20033",
        `currentSubmissionId=${encodeURIComponent(currentSubmissionId)}`,
        `csrf_token=${encodeURIComponent(csrfToken)}`
      ].join("&");

      return { redirectUrl: `${newUrl}?${qs}` };
    }

    return {};
  },
  {
    urls: [
      "https://codeforces.com/data/submitSource*",
    ]
  },
  ["blocking", "requestBody"]
);
