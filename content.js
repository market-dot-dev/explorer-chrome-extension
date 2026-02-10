(() => {
  const STORAGE_KEY = "md_expert_pr_config";
  const NAV_CACHE_KEY = "md_expert_pr_nav_cache";
  const STYLE_ID = "md-expert-pr-style";
  const PANEL_ID = "md-expert-pr-panel";
  const BADGE_ID = "md-expert-pr-badge";
  const NAV_BUTTONS_ID = "md-expert-pr-nav-buttons";
  const NAV_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 8;

  const DEFAULT_CONFIG = {
    apiKey: "",
    settingsOpen: false
  };

  const state = {
    config: loadConfig(),
    currentResult: null,
    listCache: new Map(),
    mountRetryTimer: null,
    mountRetryCount: 0,
    keyboardListenerAttached: false,
    navMountRetryTimer: null,
    navMountRetryCount: 0,
    navViewportListenerAttached: false,
    navRepositionFrame: null
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

  function normalizePullPath(urlLike) {
    try {
      const url = new URL(String(urlLike || ""), window.location.origin);
      const match = url.pathname.match(/^\/[^/]+\/[^/]+\/pull\/\d+/);
      return match ? match[0] : null;
    } catch (error) {
      return null;
    }
  }

  function getRepoPathFromPullPath(pullPath) {
    const match = String(pullPath || "").match(/^\/[^/]+\/[^/]+/);
    return match ? match[0] : null;
  }

  function readNavigationCache() {
    const raw = window.localStorage.getItem(NAV_CACHE_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.pullPaths)) return null;
      if (typeof parsed.updatedAt !== "number") return null;
      return parsed;
    } catch (error) {
      return null;
    }
  }

  function writeNavigationCache(pullPaths) {
    if (!Array.isArray(pullPaths) || !pullPaths.length) return;
    const repoPath = getRepoPathFromPullPath(pullPaths[0]);
    if (!repoPath) return;

    window.localStorage.setItem(
      NAV_CACHE_KEY,
      JSON.stringify({
        repoPath,
        listPath: window.location.pathname,
        listSearch: window.location.search || "",
        pullPaths,
        updatedAt: Date.now()
      })
    );
  }

  function cachePullListOrder() {
    if (!isPullListPage()) return;

    const rows = document.querySelectorAll("div.js-issue-row");
    const pullPaths = [];
    const seen = new Set();

    rows.forEach((row) => {
      const titleLink =
        row.querySelector("a[data-hovercard-type='pull_request']") ||
        row.querySelector("a[id^='issue_']") ||
        row.querySelector("a.Link--primary[href*='/pull/']");
      if (!titleLink) return;

      const pullPath = normalizePullPath(titleLink.getAttribute("href") || titleLink.href);
      if (!pullPath || seen.has(pullPath)) return;

      seen.add(pullPath);
      pullPaths.push(pullPath);
    });

    writeNavigationCache(pullPaths);
  }

  function isEditableTarget(target) {
    const element = target instanceof Element ? target : null;
    if (!element) return false;
    if (element.closest("input, textarea, select, button, [contenteditable=''], [contenteditable='true'], [role='textbox']")) {
      return true;
    }
    return false;
  }

  function getAdjacentPullPath(direction) {
    const currentPullPath = normalizePullPath(window.location.href);
    if (!currentPullPath) return null;

    const cache = readNavigationCache();
    if (!cache) return null;
    if (!Array.isArray(cache.pullPaths) || cache.pullPaths.length < 2) return null;
    if (Date.now() - cache.updatedAt > NAV_CACHE_MAX_AGE_MS) return null;

    const repoPath = getRepoPathFromPullPath(currentPullPath);
    if (!repoPath || cache.repoPath !== repoPath) return null;

    const currentIndex = cache.pullPaths.indexOf(currentPullPath);
    if (currentIndex === -1) return null;

    const targetIndex = (currentIndex + direction + cache.pullPaths.length) % cache.pullPaths.length;
    if (targetIndex === currentIndex) return null;

    return cache.pullPaths[targetIndex];
  }

  function navigateToAdjacentPull(direction) {
    const targetPath = getAdjacentPullPath(direction);
    if (!targetPath) return false;
    window.location.assign(targetPath);
    return true;
  }

  function handlePullNavigationShortcut(event) {
    if (!isPullDetailPage()) return;
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isEditableTarget(event.target)) return;

    let direction = 0;
    if (event.key === "ArrowRight") direction = 1;
    if (event.key === "ArrowLeft") direction = -1;
    if (event.key === "]") direction = 1;
    if (event.key === "[") direction = -1;
    if (!direction) return;

    const navigated = navigateToAdjacentPull(direction);
    if (!navigated) return;

    event.preventDefault();
    event.stopPropagation();
  }

  function ensureKeyboardShortcutBinding() {
    if (state.keyboardListenerAttached) return;
    state.keyboardListenerAttached = true;
    document.addEventListener("keydown", handlePullNavigationShortcut, true);
  }

  function clearNavMountRetry() {
    if (!state.navMountRetryTimer) return;
    window.clearTimeout(state.navMountRetryTimer);
    state.navMountRetryTimer = null;
  }

  function scheduleNavMountRetry() {
    if (state.navMountRetryTimer || state.navMountRetryCount >= 40 || !isPullDetailPage()) return;
    state.navMountRetryTimer = window.setTimeout(() => {
      state.navMountRetryTimer = null;
      state.navMountRetryCount += 1;
      ensureNavButtons();
    }, 250);
  }

  function queueNavButtonsRefresh() {
    if (state.navRepositionFrame !== null) return;
    state.navRepositionFrame = window.requestAnimationFrame(() => {
      state.navRepositionFrame = null;
      ensureNavButtons();
    });
  }

  function ensureNavViewportBinding() {
    if (state.navViewportListenerAttached) return;
    state.navViewportListenerAttached = true;
    window.addEventListener("resize", queueNavButtonsRefresh);
    window.addEventListener("scroll", queueNavButtonsRefresh, true);
  }

  function getCodeButtonMatchScore(element) {
    const text = normalizeText(element.textContent);
    const ariaLabel = normalizeText(element.getAttribute("aria-label"));

    let score = 0;
    if (text === "code") score += 4;
    else if (text.startsWith("code ")) score += 2;

    if (ariaLabel === "code") score += 3;
    else if (ariaLabel.startsWith("code ")) score += 2;

    return score;
  }

  function findCodeButton() {
    const sidebar = findSidebar();
    const roots = [sidebar, document].filter(Boolean);
    const seen = new Set();
    const candidates = [];

    roots.forEach((root) => {
      root.querySelectorAll("button, summary, a").forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);

        if (!isVisibleElement(element)) return;
        if (element.closest(`#${PANEL_ID}`) || element.closest(`#${NAV_BUTTONS_ID}`)) return;

        const textScore = getCodeButtonMatchScore(element);
        if (!textScore) return;

        const classText = normalizeText(element.className);
        const rect = element.getBoundingClientRect();

        let score = textScore;
        if (sidebar && sidebar.contains(element)) score += 8;
        if (classText.includes("btn") || classText.includes("button")) score += 2;
        if (element.closest("details")) score += 1;
        if (rect.width >= 80 && rect.width <= 240) score += 2;
        if (rect.height >= 28 && rect.height <= 44) score += 1;

        candidates.push({ element, score });
      });
    });

    if (!candidates.length) return null;
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0].element;
  }

  function updateNavButtonsState(wrapper) {
    if (!wrapper) return;

    const prevButton = wrapper.querySelector("[data-nav='prev']");
    const nextButton = wrapper.querySelector("[data-nav='next']");
    if (!prevButton || !nextButton) return;

    const canGoPrev = Boolean(getAdjacentPullPath(-1));
    const canGoNext = Boolean(getAdjacentPullPath(1));

    prevButton.disabled = !canGoPrev;
    nextButton.disabled = !canGoNext;

    const disabledTitle = "Visit the repo PR list to enable";
    prevButton.title = canGoPrev ? "Previous PR (ArrowLeft)" : disabledTitle;
    nextButton.title = canGoNext ? "Next PR (ArrowRight)" : disabledTitle;
  }

  function ensureNavButtons() {
    const existing = document.getElementById(NAV_BUTTONS_ID);

    if (!isPullDetailPage()) {
      if (existing) existing.remove();
      clearNavMountRetry();
      state.navMountRetryCount = 0;
      return;
    }

    const codeButton = findCodeButton();
    if (!codeButton) {
      if (existing) existing.remove();
      scheduleNavMountRetry();
      return;
    }

    const codeRect = codeButton.getBoundingClientRect();
    if (!codeRect.width || !codeRect.height) {
      scheduleNavMountRetry();
      return;
    }

    let wrapper = existing;
    if (!wrapper) {
      wrapper = document.createElement("div");
      wrapper.id = NAV_BUTTONS_ID;
      wrapper.innerHTML = `
        <button class="md-pr-nav-btn" type="button" data-nav="prev" aria-label="Previous pull request">&#8592;</button>
        <button class="md-pr-nav-btn" type="button" data-nav="next" aria-label="Next pull request">&#8594;</button>
      `;

      wrapper.querySelector("[data-nav='prev']")?.addEventListener("click", (event) => {
        event.preventDefault();
        navigateToAdjacentPull(-1);
      });
      wrapper.querySelector("[data-nav='next']")?.addEventListener("click", (event) => {
        event.preventDefault();
        navigateToAdjacentPull(1);
      });
    }

    if (wrapper.parentElement !== document.body) {
      document.body.appendChild(wrapper);
    }

    wrapper.style.left = `${Math.round(window.scrollX + codeRect.left)}px`;
    wrapper.style.top = `${Math.round(window.scrollY + codeRect.bottom + 6)}px`;
    wrapper.style.width = `${Math.round(codeRect.width)}px`;
    wrapper.style.setProperty("--md-pr-nav-btn-height", `${Math.round(codeRect.height)}px`);

    const borderRadius = window.getComputedStyle(codeButton).borderRadius;
    if (borderRadius) {
      wrapper.style.setProperty("--md-pr-nav-btn-radius", borderRadius);
    }

    updateNavButtonsState(wrapper);
    clearNavMountRetry();
    state.navMountRetryCount = 0;
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
        color: var(--fgColor-default, #24292f);
      }
      #${PANEL_ID}.discussion-sidebar-item {
        margin-top: 0;
      }
      #${PANEL_ID}.md-pr-fallback {
        margin: 16px 0;
      }
      #${PANEL_ID} .md-pr-panel {
        font-size: 12px;
        line-height: 1.5;
      }
      #${PANEL_ID} .md-pr-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }
      #${PANEL_ID} .md-pr-heading {
        margin: 0;
      }
      #${PANEL_ID} .md-pr-gear {
        border: none;
        background: transparent;
        color: var(--fgColor-muted, #57606a);
        width: 20px;
        height: 20px;
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      #${PANEL_ID} .md-pr-gear:hover {
        color: var(--fgColor-default, #24292f);
      }
      #${PANEL_ID} .md-pr-settings {
        display: none;
        margin-top: 8px;
      }
      #${PANEL_ID} .md-pr-settings.md-pr-open {
        display: block;
      }
      #${PANEL_ID} .md-pr-settings label {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        color: var(--fgColor-muted, #57606a);
      }
      #${PANEL_ID} .md-pr-settings input[type="password"] {
        width: 100%;
        border: 1px solid var(--borderColor-default, #d0d7de);
        border-radius: 6px;
        padding: 5px 8px;
        font-size: 12px;
        color: var(--fgColor-default, #24292f);
        background: var(--bgColor-default, #ffffff);
      }
      #${PANEL_ID} .md-pr-status {
        color: var(--fgColor-muted, #57606a);
      }
      #${PANEL_ID} .md-pr-warning {
        color: var(--fgColor-danger, #cf222e);
      }
      #${PANEL_ID} .md-pr-details {
        color: var(--fgColor-muted, #57606a);
      }
      #${PANEL_ID} .md-pr-summary {
        margin-bottom: 8px;
        color: var(--fgColor-default, #24292f);
      }
      #${PANEL_ID} .md-pr-card-header {
        display: flex;
        gap: 8px;
        align-items: flex-start;
      }
      #${PANEL_ID} .md-pr-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        overflow: hidden;
        background: var(--bgColor-muted, #f6f8fa);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        color: var(--fgColor-muted, #57606a);
        flex-shrink: 0;
      }
      #${PANEL_ID} .md-pr-avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
      #${PANEL_ID} .md-pr-name {
        font-size: 13px;
        font-weight: 600;
        color: var(--fgColor-default, #24292f);
      }
      #${PANEL_ID} .md-pr-meta {
        color: var(--fgColor-muted, #57606a);
      }
      #${PANEL_ID} .md-pr-link {
        color: var(--fgColor-accent, #0969da);
        text-decoration: none;
      }
      #${PANEL_ID} .md-pr-link:hover {
        text-decoration: underline;
      }
      #${PANEL_ID} .md-pr-stats {
        margin-top: 8px;
      }
      #${PANEL_ID} .md-pr-stat-item {
        color: var(--fgColor-default, #24292f);
      }
      #${PANEL_ID} .md-pr-stat-label {
        color: var(--fgColor-muted, #57606a);
      }
      #${PANEL_ID} .md-pr-stat-sep {
        margin: 0 4px;
        color: var(--fgColor-muted, #57606a);
      }
      #${PANEL_ID} .md-pr-section {
        margin-top: 8px;
      }
      #${PANEL_ID} .md-pr-section-title {
        margin-bottom: 2px;
        font-weight: 600;
        color: var(--fgColor-muted, #57606a);
      }
      #${PANEL_ID} .md-pr-ecosystems {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      #${PANEL_ID} .md-pr-ecosystem-pill {
        color: var(--fgColor-accent, #0969da);
        text-decoration: none;
      }
      #${PANEL_ID} .md-pr-ecosystem-pill:hover {
        text-decoration: underline;
      }
      #${PANEL_ID} .md-pr-project-list {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      #${PANEL_ID} .md-pr-project-item {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }
      #${PANEL_ID} .md-pr-project-meta {
        color: var(--fgColor-muted, #57606a);
        flex-shrink: 0;
      }
      #${PANEL_ID} .md-pr-powered {
        margin-top: 8px;
        font-size: 11px;
        color: var(--fgColor-muted, #57606a);
        opacity: 0.65;
      }
      #${PANEL_ID} .md-pr-powered-link {
        color: inherit;
        text-decoration: none;
      }
      #${PANEL_ID} .md-pr-powered-link:hover {
        text-decoration: underline;
      }
      #${NAV_BUTTONS_ID} {
        position: absolute;
        z-index: 30;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
      }
      #${NAV_BUTTONS_ID} .md-pr-nav-btn {
        appearance: none;
        border: 1px solid var(--button-default-borderColor-rest, var(--borderColor-default, #d0d7de));
        background: var(--button-default-bgColor-rest, var(--bgColor-muted, #f6f8fa));
        color: var(--button-default-fgColor-rest, var(--fgColor-default, #24292f));
        border-radius: var(--md-pr-nav-btn-radius, 6px);
        height: var(--md-pr-nav-btn-height, 32px);
        padding: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        font-weight: 600;
        font-family: inherit;
        line-height: 1;
        letter-spacing: 0;
        cursor: pointer;
      }
      #${NAV_BUTTONS_ID} .md-pr-nav-btn:hover:not(:disabled) {
        background: var(--button-default-bgColor-hover, var(--bgColor-neutral-muted, #f3f4f6));
      }
      #${NAV_BUTTONS_ID} .md-pr-nav-btn:disabled {
        cursor: default;
        opacity: 0.55;
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

  function clearMountRetry() {
    if (!state.mountRetryTimer) return;
    window.clearTimeout(state.mountRetryTimer);
    state.mountRetryTimer = null;
  }

  function scheduleMountRetry() {
    if (state.mountRetryTimer || state.mountRetryCount >= 40 || !isPullDetailPage()) return;
    state.mountRetryTimer = window.setTimeout(() => {
      state.mountRetryTimer = null;
      state.mountRetryCount += 1;
      ensurePanel();
    }, 250);
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function isVisibleElement(element) {
    return Boolean(element && element.isConnected && element.getClientRects().length > 0);
  }

  function findSidebar() {
    const selectors = [
      ".discussion-sidebar",
      ".Layout-sidebar .discussion-sidebar",
      ".Layout-sidebar",
      ".js-discussion-sidebar",
      "#partial-discussion-sidebar",
      "[data-testid*='sidebar']",
      "aside"
    ];

    const seen = new Set();
    const candidates = [];

    for (const selector of selectors) {
      document.querySelectorAll(selector).forEach((element) => {
        if (seen.has(element)) return;
        seen.add(element);
        candidates.push(element);
      });
    }

    const scoredVisible = candidates
      .filter((element) => isVisibleElement(element))
      .map((element) => {
        const text = normalizeText(element.textContent);
        let score = 0;
        if (text.includes("reviewers")) score += 5;
        if (text.includes("assignees")) score += 2;
        if (normalizeText(element.className).includes("sidebar")) score += 2;
        if (element.tagName === "ASIDE") score += 1;
        return { element, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scoredVisible.length) return scoredVisible[0].element;

    if (candidates.length) return candidates[0];

    return null;
  }

  function findReviewersSection(sidebar) {
    const roots = [];
    if (sidebar) roots.push(sidebar);
    const discoveredSidebar = findSidebar();
    if (discoveredSidebar && !roots.includes(discoveredSidebar)) roots.push(discoveredSidebar);
    roots.push(document);

    for (const root of roots) {
      const byClass = root.querySelector(
        ".discussion-sidebar-item.sidebar-reviewers, .js-discussion-sidebar-item.sidebar-reviewers"
      );
      if (byClass && isVisibleElement(byClass)) return byClass;

      const byTestId = root.querySelector("[data-testid*='reviewer']");
      if (byTestId && isVisibleElement(byTestId)) {
        const item = byTestId.closest(
          ".discussion-sidebar-item, .js-discussion-sidebar-item, [class*='sidebar-item'], section, li"
        );
        if (item && isVisibleElement(item)) return item;
      }

      const headings = root.querySelectorAll(".discussion-sidebar-heading, h2, h3, h4, [role='heading']");
      for (const heading of headings) {
        if (normalizeText(heading.textContent) !== "reviewers") continue;
        const item = heading.closest(
          ".discussion-sidebar-item, .js-discussion-sidebar-item, [class*='sidebar-item'], section, li, aside"
        );
        if (item && isVisibleElement(item)) return item;
      }
    }

    return null;
  }

  function findFallbackAnchor() {
    const selectors = [
      ".gh-header-show",
      ".gh-header-meta",
      ".js-pull-discussion-timeline",
      "main [data-testid='issue-viewer']",
      "main"
    ];

    for (const selector of selectors) {
      const element = document.querySelector(selector);
      if (element && isVisibleElement(element)) return element;
    }

    return null;
  }

  function setWrapperPlacementClass(wrapper, inSidebar) {
    if (inSidebar) {
      wrapper.classList.add("discussion-sidebar-item");
      wrapper.classList.remove("md-pr-fallback");
      return;
    }

    wrapper.classList.remove("discussion-sidebar-item");
    wrapper.classList.add("md-pr-fallback");
  }

  function mountPanel(wrapper) {
    const reviewersSection = findReviewersSection();
    if (reviewersSection) {
      setWrapperPlacementClass(wrapper, true);
      if (reviewersSection.nextElementSibling !== wrapper) {
        reviewersSection.insertAdjacentElement("afterend", wrapper);
      }
      return true;
    }

    const sidebar = findSidebar();
    if (sidebar) {
      setWrapperPlacementClass(wrapper, true);
      if (wrapper.parentElement !== sidebar) {
        sidebar.appendChild(wrapper);
      }
      return true;
    }

    const fallbackAnchor = findFallbackAnchor();
    if (fallbackAnchor) {
      setWrapperPlacementClass(wrapper, false);
      if (fallbackAnchor.tagName === "MAIN") {
        if (wrapper.parentElement !== fallbackAnchor || fallbackAnchor.firstElementChild !== wrapper) {
          fallbackAnchor.prepend(wrapper);
        }
        return true;
      }

      if (fallbackAnchor.nextElementSibling !== wrapper) {
        fallbackAnchor.insertAdjacentElement("afterend", wrapper);
      }
      return true;
    }

    return false;
  }

  function ensurePanel() {
    const existing = document.getElementById(PANEL_ID);
    if (!isPullDetailPage()) {
      if (existing) existing.remove();
      clearMountRetry();
      state.mountRetryCount = 0;
      removeBadge();
      return;
    }

    ensureStyles();

    if (existing) {
      if (!mountPanel(existing)) {
        scheduleMountRetry();
        return;
      }
      clearMountRetry();
      state.mountRetryCount = 0;
      updatePanel(existing);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.id = PANEL_ID;
    wrapper.innerHTML = `
      <div class="md-pr-panel">
        <div class="md-pr-header">
          <h3 class="discussion-sidebar-heading md-pr-heading">Contributor insights</h3>
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
          <label for="${PANEL_ID}-api-key">API key (optional)</label>
          <input id="${PANEL_ID}-api-key" type="password" data-config="apiKey" />
          <div class="md-pr-status"></div>
        </div>
        <div class="md-pr-powered">Powered by the <a class="md-pr-powered-link" href="https://explore.market.dev" target="_blank" rel="noopener noreferrer">Open Source Explorer</a></div>
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

    if (!mountPanel(wrapper)) {
      scheduleMountRetry();
      return;
    }

    clearMountRetry();
    state.mountRetryCount = 0;

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

    // if (result.state === "missing-key") {
    //   statusBlocks.forEach((status) => {
    //     status.innerHTML = `<span class="md-pr-warning">API key required</span>`;
    //   });
    //   summary.textContent = "";
    //   details.textContent = "";
    //   return;
    // }

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
      summary.textContent = "No contributor profile found yet.";
      details.textContent = "";
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
            <div class="md-pr-name"><a class="md-pr-link" href="https://github.com/${encodeURIComponent(username)}" target="_blank" rel="noopener noreferrer">${name}</a></div>
            <div class="md-pr-meta">@${username}${location ? ` · ${location}` : ""}</div>
          </div>
        </div>
        ${stats.length ? `
          <div class="md-pr-stats">
            ${stats
              .map(
                (stat) => `<span class="md-pr-stat-item"><span class="md-pr-stat-label">${stat.label}:</span> ${stat.value}</span>`
              )
              .join('<span class="md-pr-stat-sep">·</span>')}
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
            <div class="md-pr-section-title">Notable Projects</div>
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
    // if (!result || result.state === "error" || result.state === "missing-key") return;
    if (!result || result.state === "error") return;

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
    // if (!apiKey) return { state: "missing-key" };

    const url = `https://explore.market.dev/api/v1/experts/${encodeURIComponent(username)}`;

    try {
      const backgroundResponse = await fetchViaBackground(url, apiKey);
      let responseStatus = 0;
      let responseData = null;

      if (backgroundResponse) {
        responseStatus = backgroundResponse.status || 0;
        responseData = backgroundResponse.data || null;
      } else {
        const headers = {
          Accept: "application/json"
        };
        if (apiKey) {
          headers.Authorization = `Bearer ${apiKey}`;
        }

        const response = await fetch(url, {
          headers
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
    // if (!apiKey) return null;

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

    cachePullListOrder();

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
    ensureNavButtons();
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
    ensureKeyboardShortcutBinding();
    ensureNavViewportBinding();
    cachePullListOrder();
    ensureNavButtons();
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
