/* ==========================================================================
   Content Governance Checker — front-end wiring (Step 1: UI shell only)

   No governance logic lives here yet. This just tracks which rules are
   toggled on, reads the textarea/channel, and renders a placeholder
   message in the results panel when "Check Content" is clicked.
   Actual rule checks will be wired up in Step 2.
   ========================================================================== */

(function () {
  "use strict";

  const draftContent = document.getElementById("draftContent");
  const channelSelect = document.getElementById("channelSelect");
  const checkContentBtn = document.getElementById("checkContentBtn");
  const resultsEmpty = document.getElementById("resultsEmpty");
  const resultsList = document.getElementById("resultsList");
  const ruleToggles = document.querySelectorAll("[data-rule]");

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
   * @param {"info"|"low"} severity
   */
  function showMessage(title, detail, severity) {
    resultsList.innerHTML = "";

    const item = document.createElement("li");
    item.className = "result-item severity-" + severity;

    item.innerHTML =
      '<span class="dot dot-' + (severity === "info" ? "low" : severity) + '"></span>' +
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

  function handleCheckContent() {
    const content = draftContent.value.trim();
    const channel = channelSelect.value;
    const activeRules = getActiveRules();
    const activeRuleCount = Object.values(activeRules).filter(Boolean).length;

    if (!content) {
      showMessage(
        "No content to check",
        "Paste some draft content above before running a check.",
        "low"
      );
      return;
    }

    if (activeRuleCount === 0) {
      showMessage(
        "No rules enabled",
        "Turn on at least one governance rule in the sidebar to run a check.",
        "low"
      );
      return;
    }

    // Placeholder only — real rule evaluation arrives in Step 2.
    showMessage(
      "Governance checks not wired up yet",
      "This is a placeholder result for the \"" + channel + "\" channel with " +
        activeRuleCount + " rule(s) enabled. Rule logic is coming in Step 2.",
      "info"
    );
  }

  checkContentBtn.addEventListener("click", handleCheckContent);
})();
