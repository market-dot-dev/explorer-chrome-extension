(() => {
  const STORAGE_KEY = "md_expert_pr_config";
  const STYLE_ID = "md-expert-pr-style";
  const PANEL_ID = "md-expert-pr-panel";
  const BADGE_ID = "md-expert-pr-badge";

  const DEFAULT_CONFIG = {
    apiKey: "",
    settingsOpen: false
  };

  const state = {
    config: loadConfig(),
    currentResult: null,
    listCache: new Map()
  };

  function loadConfig() {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    try {
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed };
    } catch (error) {
      return { ...DEFAULT_CONFIG };
    }
  }

  function saveConfig(nextConfig) {
    state.config = { ...DEFAULT_CONFIG, ...nextConfig };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
  }

  function isPullDetailPage() {
    return /\/pull\/(\d+)(\/|$)/.test(window.location.pathname);
  }

  function isPullListPage() {
    return /\/pulls(\/|$)/.test(window.location.pathname);
  }

  function canUseBackground() {
    return typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage;
  }

  function fetchViaBackground(url, apiKey) {
    if (!canUseBackground()) return Promise.resolve(null);
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "md-expert-pr-check", url, apiKey },
        (response) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(response);
        }
      );
    });
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${PANEL_ID} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
        color: #1f2328;
      }
      #${PANEL_ID} .md-pr-panel {
        width: 440px;
        background: #ffffff;
        border: 1px solid #d0d7de;
        border-radius: 12px;
        box-shadow: 0 1px 3px rgba(27, 31, 36, 0.12);
        padding: 12px 12px 10px;
        font-size: 14px;
      }
      #${PANEL_ID} .md-pr-header {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 8px;
        font-weight: 600;
        font-size: 13px;
      }
      #${PANEL_ID} .md-pr-gear {
        border: none;
        background: #f6f8fa;
        border-radius: 6px;
        width: 28px;
        height: 28px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border: 1px solid #d0d7de;
        color: #57606a;
      }
      #${PANEL_ID} .md-pr-body {
        margin-top: 10px;
      }
      #${PANEL_ID} .md-pr-settings {
        display: none;
        margin-top: 10px;
        border-top: 1px dashed #d0d7de;
        padding-top: 10px;
      }
      #${PANEL_ID} .md-pr-settings.md-pr-open {
        display: block;
      }
      #${PANEL_ID} label {
        display: block;
        margin-bottom: 6px;
        font-weight: 600;
        font-size: 12px;
        color: #57606a;
      }
      #${PANEL_ID} input[type="text"],
      #${PANEL_ID} input[type="password"] {
        width: 100%;
        border: 1px solid #d0d7de;
        border-radius: 6px;
        padding: 6px 8px;
        font-size: 14px;
        background: #ffffff;
        margin-bottom: 8px;
      }
      #${PANEL_ID} .md-pr-status {
        margin-top: 8px;
        color: #57606a;
      }
      #${PANEL_ID} .md-pr-warning {
        color: #cf222e;
        font-weight: 600;
      }
      #${PANEL_ID} .md-pr-success {
        color: #1a7f37;
        font-weight: 600;
      }
      #${PANEL_ID} .md-pr-details {
        margin-top: 6px;
        color: #24292f;
      }
      #${PANEL_ID} .md-pr-summary {
        margin-top: 6px;
        font-size: 18px;
        color: #24292f;
        font-weight: 600;
      }
      #${PANEL_ID} .md-pr-card {
        border: 1px solid #d0d7de;
        border-radius: 10px;
        padding: 12px;
      }
      #${PANEL_ID} .md-pr-card-header {
        display: flex;
        gap: 12px;
        align-items: center;
      }
      #${PANEL_ID} .md-pr-avatar {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #f6f8fa;
        border: 1px solid #d0d7de;
        overflow: hidden;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        color: #57606a;
      }
      #${PANEL_ID} .md-pr-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      #${PANEL_ID} .md-pr-name {
        font-size: 18px;
        font-weight: 700;
        color: #1a7f37;
      }
      #${PANEL_ID} .md-pr-meta {
        margin-top: 6px;
        color: #57606a;
        font-size: 14px;
      }
      #${PANEL_ID} .md-pr-links {
        margin-top: 6px;
        display: flex;
        gap: 12px;
        font-size: 14px;
      }
      #${PANEL_ID} .md-pr-link {
        color: #0969da;
        font-weight: 600;
      }
      #${PANEL_ID} .md-pr-stats {
        margin-top: 12px;
        border: 1px solid #d0d7de;
        border-radius: 8px;
        overflow: hidden;
      }
      #${PANEL_ID} .md-pr-stat-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 10px;
        border-bottom: 1px solid #d0d7de;
        font-size: 14px;
      }
      #${PANEL_ID} .md-pr-stat-row:last-child {
        border-bottom: none;
      }
      #${PANEL_ID} .md-pr-stat-label {
        color: #57606a;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 600;
        font-size: 11px;
      }
      #${PANEL_ID} .md-pr-stat-value {
        font-weight: 700;
        color: #24292f;
      }
      #${PANEL_ID} .md-pr-section {
        margin-top: 12px;
      }
      #${PANEL_ID} .md-pr-section-title {
        font-size: 13px;
        font-weight: 600;
        color: #57606a;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 6px;
      }
      #${PANEL_ID} .md-pr-ecosystems {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      #${PANEL_ID} .md-pr-ecosystem-pill {
        display: inline-flex;
        align-items: center;
        background: #f6f8fa;
        border: 1px solid #d0d7de;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 13px;
        color: #57606a;
        text-decoration: none;
      }
      #${PANEL_ID} .md-pr-project-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      #${PANEL_ID} .md-pr-project-item {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        font-size: 14px;
        color: #24292f;
      }
      #${PANEL_ID} .md-pr-project-meta {
        color: #57606a;
        font-size: 13px;
      }
      .md-pr-list-indicator {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 8px;
        height: 8px;
        border-radius: 999px;
        margin-left: 6px;
        border: 1px solid #d0d7de;
      }
      .md-pr-list-indicator.md-pr-list-expert {
        background: #2da44e;
        border-color: #2da44e;
      }
      .md-pr-list-indicator.md-pr-list-missing {
        background: #afb8c1;
      }
      #${PANEL_ID} .md-pr-section {
        margin-top: 8px;
      }
      #${PANEL_ID} .md-pr-section-title {
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #6b7280;
        margin-bottom: 4px;
      }
      #${PANEL_ID} .md-pr-stats {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 6px;
      }
      #${PANEL_ID} .md-pr-stat {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 6px;
        text-align: center;
      }
      #${PANEL_ID} .md-pr-stat-label {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #6b7280;
      }
      #${PANEL_ID} .md-pr-stat-value {
        font-size: 13px;
        font-weight: 600;
        color: #111827;
      }
      #${PANEL_ID} .md-pr-pill {
        display: inline-flex;
        align-items: center;
        padding: 2px 6px;
        border-radius: 999px;
        background: #eef2ff;
        color: #3730a3;
        font-size: 11px;
        margin-right: 4px;
        margin-bottom: 4px;
      }
      #${PANEL_ID} .md-pr-link {
        color: #0a3069;
        font-weight: 600;
      }
      #${BADGE_ID} {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-left: 8px;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
      }
      #${BADGE_ID}.md-pr-badge-error {
        background: #ffe4e8;
        color: #9f1239;
      }
      #${BADGE_ID}.md-pr-badge-success {
        background: #dcfce7;
        color: #166534;
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (!isPullDetailPage()) {
      if (existing) existing.remove();
      removeBadge();
      return;
    }

    ensureStyles();

    if (existing) {
      updatePanel(existing);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = PANEL_ID;
    wrapper.innerHTML = `
      <div class="md-pr-panel">
        <div class="md-pr-header">
          <span></span>
          <button class="md-pr-gear" type="button" aria-label="Settings">
            <span aria-hidden="true">⚙</span>
          </button>
        </div>
        <div class="md-pr-body">
          <div class="md-pr-summary"></div>
          <div class="md-pr-status"></div>
          <div class="md-pr-details"></div>
        </div>
        <div class="md-pr-settings ${state.config.settingsOpen ? "md-pr-open" : ""}">
          <label>API key</label>
          <input type="password" data-config="apiKey" />
          <div class="md-pr-status"></div>
        </div>
      </div>
    `;

    wrapper.querySelector(".md-pr-gear").addEventListener("click", () => {
      const settings = wrapper.querySelector(".md-pr-settings");
      const open = settings.classList.toggle("md-pr-open");
      saveConfig({ ...state.config, settingsOpen: open });
    });

    wrapper.querySelectorAll("[data-config]").forEach((input) => {
      const key = input.getAttribute("data-config");
      input.value = state.config[key] ?? "";
      input.addEventListener("change", () => {
        if (key === "apiKey") {
          state.listCache.clear();
        }
        saveConfig({ ...state.config, [key]: input.value });
        applyCheck();
        applyListIndicators();
      });
    });

    document.body.appendChild(wrapper);
    updatePanel(wrapper);
  }

  function updatePanel(wrapper) {
    const summary = wrapper.querySelector(".md-pr-summary");
    const statusBlocks = wrapper.querySelectorAll(".md-pr-status");
    const details = wrapper.querySelector(".md-pr-details");
    const result = state.currentResult;

    statusBlocks.forEach((status) => {
      status.textContent = "";
      status.innerHTML = "";
    });

    if (!result) {
      statusBlocks.forEach((status) => {
        status.textContent = "Checking PR author...";
      });
      summary.textContent = "";
      details.textContent = "";
      return;
    }

    if (result.state === "missing-key") {
      statusBlocks.forEach((status) => {
        status.innerHTML = `<span class="md-pr-warning">API key required</span>`;
      });
      summary.textContent = "";
      details.textContent = "";
      return;
    }

    if (result.state === "error") {
      statusBlocks.forEach((status) => {
        status.innerHTML = `<span class="md-pr-warning">${result.message}</span>`;
      });
      summary.textContent = "";
      details.textContent = "";
      return;
    }

    if (result.state === "not-expert") {
      statusBlocks.forEach((status) => {
        status.innerHTML = "";
      });
      summary.innerHTML = `No profile found on the Open Source Explorer. <a class="md-pr-link" href="https://explore.market.dev" target="_blank" rel="noopener noreferrer">Explore</a>`;
      details.innerHTML = "";
      return;
    }

    if (result.state === "expert") {
      statusBlocks.forEach((status) => {
        status.innerHTML = "";
      });
      const info = result.expert && result.expert.expert ? result.expert.expert : result.expert;
      summary.textContent = buildSummary(info, result.username);
      details.innerHTML = renderExpertDetails(info, result.username);
    }
  }

  function buildSummary(info, username) {
    if (!info) return `This PR was opened by ${username}.`;
    const name = info.name || username;
    const downloadsRaw = Number(info.total_downloads || 0);
    const downloads = downloadsRaw > 0 ? formatCompactNumber(downloadsRaw) : null;
    const stars = formatCompactNumber(info.total_stars);
    const downloadText = downloads ? `${downloads} total downloads` : "";
    const starsText = stars ? `${stars} stars on repos` : "";
    const stats = [downloadText, starsText].filter(Boolean).join(", ");
    if (!stats) return `This PR was opened by ${name} (${username}).`;
    return `This PR was opened by ${name} (${username}). They have received ${stats}.`;
  }

  function formatCompactNumber(value) {
    if (value === null || value === undefined) return null;
    const num = Number(value);
    if (Number.isNaN(num)) return null;
    return new Intl.NumberFormat("en", {
      notation: "compact",
      maximumFractionDigits: 1
    }).format(num);
  }

  function renderExpertDetails(info, username) {
    const profileUrl = `https://explore.market.dev/experts/${encodeURIComponent(username)}`;
    if (!info) {
      return `Expert profile: <a class="md-pr-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer">Open</a>`;
    }

    const name = info.name || username;
    const avatarUrl = info.avatar_url || info.avatar || null;
    const location = info.location || info.display_location || "";

    const stats = [
      { label: "Projects", value: formatCompactNumber(info.projects_count) },
      { label: "Downloads", value: formatCompactNumber(info.total_downloads) },
      { label: "Stars", value: formatCompactNumber(info.total_stars) }
    ].filter((stat) => stat.value !== null);

    const projects = Array.isArray(info.projects) ? info.projects : [];
    const sortedProjects = [...projects].sort((a, b) => {
      const starsA = Number(a.total_stars || a.stars || 0);
      const starsB = Number(b.total_stars || b.stars || 0);
      if (starsB !== starsA) return starsB - starsA;
      const downloadsA = Number(a.total_downloads || a.downloads || 0);
      const downloadsB = Number(b.total_downloads || b.downloads || 0);
      return downloadsB - downloadsA;
    });
    const maintainerItems = sortedProjects.slice(0, 10).map((project) => {
      const role = project.role || project.project_experts?.[0]?.role;
      const name = project.name || project.slug || "";
      if (!name) return null;
      const stars = formatCompactNumber(project.total_stars || project.stars);
      const downloads = formatCompactNumber(project.total_downloads || project.downloads);
      const metaParts = [stars ? `${stars} stars` : null, downloads ? `${downloads} downloads` : null]
        .filter(Boolean)
        .join(" · ");
      const label = role ? `${role} of ${name}` : name;
      const projectSlug = project.slug || project.name || "";
      const projectUrl =
        project.github_url ||
        project.repo_url ||
        project.url ||
        (projectSlug ? `https://explore.market.dev/projects/${encodeURIComponent(projectSlug)}` : null);
      return { label, meta: metaParts, url: projectUrl };
    }).filter(Boolean);

    const ecosystems =
      (Array.isArray(info.ecosystems) && info.ecosystems) ||
      (Array.isArray(info.ecosystem_names) && info.ecosystem_names) ||
      [];

    const ecosystemNames = ecosystems
      .map((eco) => (typeof eco === "string" ? eco : eco.name))
      .filter(Boolean)
      .slice(0, 8)
      .map((name) => ({
        name,
        url: `https://explore.market.dev/ecosystems/${encodeURIComponent(name)}`
      }));

    return `
      <div class="md-pr-card">
        <div class="md-pr-card-header">
          <div class="md-pr-avatar">
            ${avatarUrl ? `<img src="${avatarUrl}" alt="${name}" />` : name.slice(0, 1).toUpperCase()}
          </div>
          <div>
            <div class="md-pr-name">${name}</div>
            <div class="md-pr-meta">@${username}${location ? ` · ${location}` : ""}</div>
            <div class="md-pr-links">
              <a class="md-pr-link" href="https://github.com/${encodeURIComponent(username)}" target="_blank" rel="noopener noreferrer">GitHub</a>
              <a class="md-pr-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer">Market.dev</a>
            </div>
          </div>
        </div>
        ${stats.length ? `
          <div class="md-pr-stats">
            ${stats
              .map(
                (stat) => `
                  <div class="md-pr-stat-row">
                    <span class="md-pr-stat-label">${stat.label}</span>
                    <span class="md-pr-stat-value">${stat.value}</span>
                  </div>
                `
              )
              .join("")}
          </div>
        ` : ""}
        ${ecosystemNames.length ? `
          <div class="md-pr-section">
            <div class="md-pr-section-title">Ecosystems</div>
            <div class="md-pr-ecosystems">
              ${ecosystemNames
                .map((eco) => `<a class="md-pr-ecosystem-pill" href="${eco.url}" target="_blank" rel="noopener noreferrer">${eco.name}</a>`)
                .join("")}
            </div>
          </div>
        ` : ""}
        ${maintainerItems.length ? `
          <div class="md-pr-section">
            <div class="md-pr-section-title">Projects</div>
            <div class="md-pr-project-list">
              ${maintainerItems
                .map(
                  (item) => `
                    <div class="md-pr-project-item">
                      ${item.url ? `<a class="md-pr-link" href="${item.url}" target="_blank" rel="noopener noreferrer">${item.label}</a>` : `<span>${item.label}</span>`}
                      ${item.meta ? `<span class="md-pr-project-meta">${item.meta}</span>` : ""}
                    </div>
                  `
                )
                .join("")}
            </div>
          </div>
        ` : ""}
      </div>
    `;
  }

  function findPrAuthor() {
    const selectors = [
      ".gh-header-meta .author",
      ".js-discussion .timeline-comment-header .author",
      ".js-discussion .author",
      ".timeline-comment-header .author",
      "a.author"
    ];
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent.trim()) return el.textContent.trim();
    }
    return null;
  }

  function removeBadge() {
    const existing = document.getElementById(BADGE_ID);
    if (existing) existing.remove();
  }

  function updateBadge(result) {
    const header = document.querySelector(".gh-header-title") || document.querySelector(".gh-header-meta");
    if (!header) return;

    removeBadge();
    if (!result || result.state === "error" || result.state === "missing-key") return;

    const badge = document.createElement("span");
    badge.id = BADGE_ID;

    if (result.state === "not-expert") {
      badge.className = "md-pr-badge-error";
      badge.textContent = "No Profile";
      header.appendChild(badge);
    }
  }

  async function fetchExpert(username) {
    const apiKey = String(state.config.apiKey || "").trim();
    if (!apiKey) return { state: "missing-key" };

    const url = `https://explore.market.dev/api/v1/experts/${encodeURIComponent(username)}`;

    try {
      const backgroundResponse = await fetchViaBackground(url, apiKey);
      let responseStatus = 0;
      let responseData = null;

      if (backgroundResponse) {
        responseStatus = backgroundResponse.status || 0;
        responseData = backgroundResponse.data || null;
      } else {
        const response = await fetch(url, {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json"
          }
        });
        responseStatus = response.status;
        const text = await response.text();
        try {
          responseData = text ? JSON.parse(text) : null;
        } catch (error) {
          responseData = null;
        }
      }

      if (responseStatus === 200) return { state: "expert", expert: responseData };
      if (responseStatus === 404) return { state: "not-expert" };
      if (responseStatus === 401) return { state: "error", message: "Auth failed" };
      return { state: "error", message: "API request failed" };
    } catch (error) {
      return { state: "error", message: "API request failed" };
    }
  }

  async function fetchExpertStatus(username) {
    if (state.listCache.has(username)) {
      return state.listCache.get(username);
    }

    const apiKey = String(state.config.apiKey || "").trim();
    if (!apiKey) return null;

    const url = `https://explore.market.dev/api/v1/experts/${encodeURIComponent(username)}`;
    try {
      const backgroundResponse = await fetchViaBackground(url, apiKey);
      const status = backgroundResponse ? backgroundResponse.status : null;
      if (status === 200 || status === 404) {
        const value = status === 200 ? "expert" : "missing";
        state.listCache.set(username, value);
        return value;
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  async function applyListIndicators() {
    if (!isPullListPage()) return;

    const rows = document.querySelectorAll("div.js-issue-row");
    rows.forEach((row) => {
      const author = row.getAttribute("data-author");
      if (!author) return;
      const authorLink = row.querySelector("a[data-hovercard-type='user']") || row.querySelector("a.author");
      if (!authorLink) return;
      if (authorLink.parentElement?.querySelector(".md-pr-list-indicator")) return;

      fetchExpertStatus(author).then((status) => {
        if (!status) return;
        if (authorLink.parentElement?.querySelector(".md-pr-list-indicator")) return;
        const indicator = document.createElement("span");
        indicator.className = `md-pr-list-indicator ${status === "expert" ? "md-pr-list-expert" : "md-pr-list-missing"}`;
        indicator.title = status === "expert" ? "Expert profile found" : "No expert profile";
        authorLink.insertAdjacentElement("afterend", indicator);
      });
    });
  }

  async function applyCheck() {
    ensurePanel();
    if (!isPullDetailPage()) return;

    const username = findPrAuthor();
    if (!username) {
      state.currentResult = { state: "error", message: "PR author not found" };
      updateBadge(state.currentResult);
      const panel = document.getElementById(PANEL_ID);
      if (panel) updatePanel(panel);
      return;
    }

    state.currentResult = null;
    const panel = document.getElementById(PANEL_ID);
    if (panel) updatePanel(panel);

    const result = await fetchExpert(username);
    state.currentResult = { ...result, username };
    updateBadge(state.currentResult);
    if (panel) updatePanel(panel);
  }

  function init() {
    applyCheck();
    applyListIndicators();
  }

  document.addEventListener("pjax:end", init);
  document.addEventListener("turbo:load", init);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
