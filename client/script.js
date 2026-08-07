/* ==========================================================================
   Content Governance Checker — front-end wiring

   Reads the draft content, channel, and enabled rules, sends them to the
   backend's POST /api/check endpoint, and renders the returned score and
   issue list (colour-coded by severity) in the results panel.
   ========================================================================== */

(function () {
  "use strict";

  const draftContent = document.getElementById("draftContent");
  const channelSelect = document.getElementById("channelSelect");
  const checkContentBtn = document.getElementById("checkContentBtn");
  const resultsEmpty = document.getElementById("resultsEmpty");
  const resultsList = document.getElementById("resultsList");
  const scoreBadge = document.getElementById("scoreBadge");
  const ruleToggles = document.querySelectorAll("[data-rule]");

  // Maps backend severities ("error" | "warning" | "info") onto the
  // dot/border colour classes already defined in styles.css.
  const SEVERITY_META = {
    error: { itemClass: "severity-high", dotClass: "dot-high", label: "Error" },
    warning: { itemClass: "severity-medium", dotClass: "dot-medium", label: "Warning" },
    info: { itemClass: "severity-info", dotClass: "dot-low", label: "Info" },
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
    resultsList.hidden = false;
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
   * Renders the full list of issues returned by the backend.
   * @param {Array<{rule: string, severity: string, description: string, text: string}>} issues
   */
  function renderIssues(issues) {
    resultsList.innerHTML = "";

    if (!issues.length) {
      showMessage("No issues found", "This content passed every enabled governance check.", "info");
      return;
    }

    issues.forEach((issue) => {
      const meta = SEVERITY_META[issue.severity] || SEVERITY_META.info;
      const item = document.createElement("li");
      item.className = "result-item " + meta.itemClass;

      const dot = document.createElement("span");
      dot.className = "dot " + meta.dotClass;

      const body = document.createElement("div");
      body.className = "result-body";

      const heading = document.createElement("strong");
      heading.textContent = "[" + meta.label + "] " + formatRuleName(issue.rule);

      const description = document.createElement("span");
      description.textContent = issue.description;

      body.appendChild(heading);
      body.appendChild(description);

      if (issue.text) {
        const quote = document.createElement("span");
        quote.className = "result-quote";
        quote.textContent = "“" + issue.text + "”";
        body.appendChild(quote);
      }

      item.appendChild(dot);
      item.appendChild(body);
      resultsList.appendChild(item);
    });

    resultsEmpty.hidden = true;
    resultsList.hidden = false;
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
    showMessage("Checking content…", "Running the enabled governance checks.", "info");

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
      renderIssues(data.issues || []);
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
