/* ==========================================================================
   Content Governance Checker — front-end wiring

   Reads the draft content, channel, and enabled rules, sends them to the
   backend's POST /api/check endpoint, and renders the returned score and
   issue list (colour-coded by severity, grouped by category, with AI-backed
   suggestions styled distinctly) in the results panel.
   ========================================================================== */

(function () {
  "use strict";

  const draftContent = document.getElementById("draftContent");
  const channelSelect = document.getElementById("channelSelect");
  const checkContentBtn = document.getElementById("checkContentBtn");
  const resultsEmpty = document.getElementById("resultsEmpty");
  const resultsList = document.getElementById("resultsList");
  const resultsLoading = document.getElementById("resultsLoading");
  const scoreBadge = document.getElementById("scoreBadge");
  const ruleToggles = document.querySelectorAll("[data-rule]");

  // Maps backend severities ("error" | "warning" | "info") onto the
  // dot/border colour classes already defined in styles.css.
  const SEVERITY_META = {
    error: { itemClass: "severity-high", dotClass: "dot-high", label: "Error" },
    warning: { itemClass: "severity-medium", dotClass: "dot-medium", label: "Warning" },
    info: { itemClass: "severity-info", dotClass: "dot-low", label: "Info" },
  };

  // Human-readable group headings for rule-based issues (keyed by the
  // backend's `rule` id) and AI-powered issues (keyed by `category`).
  const RULE_CATEGORY_LABELS = {
    "reading-level": "Reading Level",
    "passive-voice": "Passive Voice",
    "sentence-length": "Sentence Length",
    "word-count": "Word &amp; Character Count",
    "channel-constraints": "Channel Constraints",
    accessibility: "Accessibility",
  };

  const AI_CATEGORY_LABELS = {
    tone: "Tone Alignment",
    "plain-language": "Plain Language",
    compliance: "Compliance Review",
    "customer-centricity": "Customer-Centricity",
    actionability: "Actionability",
  };

  /**
   * Reads the current on/off state of every governance rule toggle.
   * @returns {Object<string, boolean>}
   */
  function getActiveRules() {
    const rules = {};
    ruleToggles.forEach((toggle) => {
      rules[toggle.dataset.rule] = toggle.checked;
    });
    return rules;
  }

  /**
   * Clears the results panel and shows a single message card.
   * @param {string} title
   * @param {string} detail
   * @param {"info"|"error"|"warning"} severity
   */
  function showMessage(title, detail, severity) {
    resultsList.innerHTML = "";
    scoreBadge.hidden = true;

    const meta = SEVERITY_META[severity] || SEVERITY_META.info;
    const item = document.createElement("li");
    item.className = "result-item " + meta.itemClass;

    item.innerHTML =
      '<span class="dot ' + meta.dotClass + '"></span>' +
      '<div class="result-body">' +
      "<strong></strong>" +
      "<span></span>" +
      "</div>";

    item.querySelector("strong").textContent = title;
    item.querySelector("span").textContent = detail;

    resultsList.appendChild(item);

    resultsEmpty.hidden = true;
    resultsLoading.hidden = true;
    resultsList.hidden = false;
  }

  /**
   * Shows the "checking" loading state: a simple spinner with a short label.
   */
  function showLoadingState() {
    resultsList.innerHTML = "";
    scoreBadge.hidden = true;

    resultsEmpty.hidden = true;
    resultsList.hidden = true;
    resultsLoading.hidden = false;
  }

  /**
   * Renders the score badge in the results header.
   * @param {number} score
   */
  function renderScore(score) {
    scoreBadge.textContent = "Score: " + score + "/100";
    scoreBadge.classList.remove("score-good", "score-warn", "score-bad");
    scoreBadge.classList.add(score >= 80 ? "score-good" : score >= 50 ? "score-warn" : "score-bad");
    scoreBadge.hidden = false;
  }

  /**
   * Turns a kebab-case rule id into a readable label.
   * @param {string} rule
   * @returns {string}
   */
  function formatRuleName(rule) {
    return rule
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  }

  /**
   * Determines the group heading a given issue should be filed under.
   * @param {Object} issue
   * @returns {string}
   */
  function categoryLabelFor(issue) {
    if (issue.source === "ai") {
      return AI_CATEGORY_LABELS[issue.category] || formatRuleName(issue.category || "general");
    }
    return RULE_CATEGORY_LABELS[issue.rule] || formatRuleName(issue.rule || "general");
  }

  /**
   * Groups issues by category label, preserving the order categories first
   * appear in (rule-based issues arrive before AI issues from the backend).
   * @param {Array<Object>} issues
   * @returns {Map<string, Array<Object>>}
   */
  function groupIssuesByCategory(issues) {
    const groups = new Map();
    issues.forEach((issue) => {
      const label = categoryLabelFor(issue);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(issue);
    });
    return groups;
  }

  /**
   * Builds a single <li> result item for one issue.
   * @param {Object} issue
   * @returns {HTMLLIElement}
   */
  function buildResultItem(issue) {
    const meta = SEVERITY_META[issue.severity] || SEVERITY_META.info;
    const isAI = issue.source === "ai";

    const item = document.createElement("li");
    item.className = "result-item " + meta.itemClass + (isAI ? " result-item-ai" : "");

    const dot = document.createElement("span");
    dot.className = "dot " + meta.dotClass;

    const body = document.createElement("div");
    body.className = "result-body";

    const heading = document.createElement("strong");
    heading.textContent = (isAI ? "💡 " : "") + "[" + meta.label + "]" + (isAI ? " AI Suggestion" : "");

    const description = document.createElement("span");
    description.textContent = issue.description;

    body.appendChild(heading);
    body.appendChild(description);

    const quoteText = isAI ? issue.originalText : issue.text;
    if (quoteText) {
      const quote = document.createElement("span");
      quote.className = "result-quote";
      quote.textContent = "“" + quoteText + "”";
      body.appendChild(quote);
    }

    if (isAI && issue.suggestedFix) {
      const fix = document.createElement("div");
      fix.className = "result-suggested-fix";

      const fixLabel = document.createElement("strong");
      fixLabel.textContent = "Suggested rewrite";

      const fixText = document.createElement("span");
      fixText.textContent = issue.suggestedFix;

      fix.appendChild(fixLabel);
      fix.appendChild(fixText);
      body.appendChild(fix);
    }

    item.appendChild(dot);
    item.appendChild(body);
    return item;
  }

  /**
   * Renders an AI-error banner (rule-based results still render normally).
   * @param {string} errorMessage
   */
  function buildAIErrorBanner(errorMessage) {
    const item = document.createElement("li");
    item.className = "result-item severity-info result-ai-error";
    item.innerHTML =
      '<span class="dot dot-low"></span>' +
      '<div class="result-body">' +
      "<strong>💡 AI Content Review unavailable</strong>" +
      "<span></span>" +
      "</div>";
    item.querySelector("span").textContent = errorMessage;
    return item;
  }

  /**
   * Renders the full list of issues returned by the backend, grouped by
   * category, with AI-backed issues styled and labeled distinctly.
   * @param {Array<{rule: string, source: string, category: string, severity: string, description: string, text: string, originalText: string, suggestedFix: string}>} issues
   * @param {{enabled: boolean, error: string|null}} [aiMeta]
   */
  function renderIssues(issues, aiMeta) {
    resultsList.innerHTML = "";

    if (aiMeta && aiMeta.enabled && aiMeta.error) {
      resultsList.appendChild(buildAIErrorBanner(aiMeta.error));
    }

    if (!issues.length) {
      if (resultsList.children.length === 0) {
        showMessage("No issues found", "This content passed every enabled governance check.", "info");
        return;
      }
    } else {
      const groups = groupIssuesByCategory(issues);
      groups.forEach((groupIssues, label) => {
        const heading = document.createElement("li");
        heading.className = "result-group-heading";
        heading.innerHTML = "<h3></h3>";
        heading.querySelector("h3").innerHTML = label + ' <span class="result-group-count">(' + groupIssues.length + ")</span>";
        resultsList.appendChild(heading);

        groupIssues.forEach((issue) => {
          resultsList.appendChild(buildResultItem(issue));
        });
      });
    }

    resultsEmpty.hidden = true;
    resultsLoading.hidden = true;
    resultsList.hidden = false;
  }

  async function handleCheckContent() {
    const content = draftContent.value.trim();
    const channel = channelSelect.value;
    const activeRules = getActiveRules();
    const activeRuleCount = Object.values(activeRules).filter(Boolean).length;

    if (!content) {
      showMessage(
        "No content to check",
        "Paste some draft content above before running a check.",
        "info"
      );
      return;
    }

    if (activeRuleCount === 0) {
      showMessage(
        "No rules enabled",
        "Turn on at least one governance rule in the sidebar to run a check.",
        "info"
      );
      return;
    }

    const originalLabel = checkContentBtn.textContent;
    checkContentBtn.disabled = true;
    checkContentBtn.textContent = "Checking…";
    showLoadingState();

    try {
      const response = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, channel, rules: activeRules }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data && data.error ? data.error : "Request failed with status " + response.status);
      }

      renderScore(data.score);
      renderIssues(data.issues || [], data.meta && data.meta.ai);
    } catch (err) {
      showMessage(
        "Couldn't check content",
        "There was a problem reaching the governance checker: " + err.message,
        "error"
      );
    } finally {
      checkContentBtn.disabled = false;
      checkContentBtn.textContent = originalLabel;
    }
  }

  checkContentBtn.addEventListener("click", handleCheckContent);
})();
