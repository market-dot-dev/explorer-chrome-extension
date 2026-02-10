chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "md-expert-pr-check") return;

  const headers = {
    // Authorization: `Bearer ${message.apiKey || ""}`,
    Accept: "application/json"
  };

  if (message.apiKey) {
    headers.Authorization = `Bearer ${message.apiKey}`;
  }

  fetch(message.url, {
    headers
  })
    .then(async (response) => {
      let data = null;
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : null;
      } catch (error) {
        data = null;
      }
      sendResponse({ status: response.status, data });
    })
    .catch(() => {
      sendResponse({ status: 0, data: null });
    });

  return true;
});
