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

  const profileSelect = document.getElementById("profileSelect");
  const profileName = document.getElementById("profileName");
  const profileTone = document.getElementById("profileTone");
  const readingLevelMax = document.getElementById("readingLevelMax");
  const maxSentenceLength = document.getElementById("maxSentenceLength");
  const complianceBlock = document.getElementById("complianceBlock");
  const complianceRequire = document.getElementById("complianceRequire");
  const customNotes = document.getElementById("customNotes");
  const saveProfileBtn = document.getElementById("saveProfileBtn");
  const deleteProfileBtn = document.getElementById("deleteProfileBtn");
  const profileStatus = document.getElementById("profileStatus");

  const historyList = document.getElementById("historyList");
  const historyEmpty = document.getElementById("historyEmpty");

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
        body: JSON.stringify({
          content,
          channel,
          rules: activeRules,
          profile_id: profileSelect.value ? Number(profileSelect.value) : null,
        }),
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

  /* ------------------------------------------------------------------------
     Rule profiles: load/populate/save/delete
     ------------------------------------------------------------------------ */

  /**
   * Splits a comma-separated string into a trimmed, non-empty word list.
   * @param {string} str
   * @returns {string[]}
   */
  function splitKeywords(str) {
    return (str || "")
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
  }

  /**
   * Shows a transient status line under the profile actions.
   * @param {string} text
   * @param {boolean} isError
   */
  function setProfileStatus(text, isError) {
    profileStatus.textContent = text;
    profileStatus.classList.toggle("is-error", !!isError);
    profileStatus.hidden = !text;
  }

  /**
   * Sets a rule toggle's checked state, if that toggle exists on the page.
   * @param {string} rule
   * @param {boolean} checked
   */
  function setToggle(rule, checked) {
    const toggle = document.querySelector('[data-rule="' + rule + '"]');
    if (toggle) toggle.checked = checked;
  }

  /**
   * Fills the profile fields and relevant rule toggles from a saved profile.
   * @param {Object} profile
   */
  function populateProfileFields(profile) {
    profileName.value = profile.name || "";
    profileTone.value = profile.tone || "";
    readingLevelMax.value = profile.reading_level_max != null ? profile.reading_level_max : 8;
    maxSentenceLength.value = profile.max_sentence_length != null ? profile.max_sentence_length : 25;
    complianceBlock.value = (profile.compliance_keywords_block || []).join(", ");
    complianceRequire.value = (profile.compliance_keywords_require || []).join(", ");
    customNotes.value = profile.custom_notes || "";

    if (profile.channel) {
      const hasOption = Array.from(channelSelect.options).some((o) => o.value === profile.channel);
      if (hasOption) channelSelect.value = profile.channel;
    }

    setToggle("reading-level", true);
    setToggle("sentence-length", true);
    setToggle("passive-voice", !!profile.passive_voice_enabled);
    setToggle(
      "compliance-keywords",
      (profile.compliance_keywords_block || []).length > 0 || (profile.compliance_keywords_require || []).length > 0
    );
    setToggle("tone-of-voice", !!profile.tone);

    deleteProfileBtn.hidden = false;
  }

  /** Clears the profile fields back to their defaults for a new profile. */
  function resetProfileFields() {
    profileName.value = "";
    profileTone.value = "";
    readingLevelMax.value = 8;
    maxSentenceLength.value = 25;
    complianceBlock.value = "";
    complianceRequire.value = "";
    customNotes.value = "";
    deleteProfileBtn.hidden = true;
  }

  /** Fetches the saved profiles and (re)populates the dropdown. */
  async function loadProfiles(selectId) {
    try {
      const response = await fetch("/api/profiles");
      if (!response.ok) throw new Error("Request failed with status " + response.status);
      const profiles = await response.json();

      const previousValue = selectId != null ? String(selectId) : profileSelect.value;
      profileSelect.innerHTML = '<option value="">&mdash; New / custom profile &mdash;</option>';

      profiles.forEach((profile) => {
        const option = document.createElement("option");
        option.value = String(profile.id);
        option.textContent = profile.name + (profile.channel ? " (" + profile.channel + ")" : "");
        profileSelect.appendChild(option);
      });

      if (previousValue && profiles.some((p) => String(p.id) === previousValue)) {
        profileSelect.value = previousValue;
      }
    } catch (err) {
      console.error("Failed to load profiles:", err);
    }
  }

  async function handleProfileSelectChange() {
    const id = profileSelect.value;
    if (!id) {
      resetProfileFields();
      return;
    }

    try {
      const response = await fetch("/api/profiles/" + id);
      if (!response.ok) throw new Error("Request failed with status " + response.status);
      const profile = await response.json();
      populateProfileFields(profile);
      setProfileStatus("", false);
    } catch (err) {
      setProfileStatus("Couldn't load that profile: " + err.message, true);
    }
  }

  async function handleSaveProfile() {
    const name = profileName.value.trim();
    if (!name) {
      setProfileStatus("Enter a profile name before saving.", true);
      profileName.focus();
      return;
    }

    const payload = {
      name,
      channel: channelSelect.value,
      reading_level_max: Number(readingLevelMax.value) || 8,
      passive_voice_enabled: document.querySelector('[data-rule="passive-voice"]').checked,
      max_sentence_length: Number(maxSentenceLength.value) || 25,
      compliance_keywords_block: splitKeywords(complianceBlock.value),
      compliance_keywords_require: splitKeywords(complianceRequire.value),
      tone: profileTone.value || null,
      custom_notes: customNotes.value.trim() || null,
    };

    const existingId = profileSelect.value;
    const isUpdate = Boolean(existingId);

    saveProfileBtn.disabled = true;
    try {
      const response = await fetch(isUpdate ? "/api/profiles/" + existingId : "/api/profiles", {
        method: isUpdate ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data && data.error ? data.error : "Request failed with status " + response.status);
      }

      await loadProfiles(data.id);
      setProfileStatus('Saved profile "' + data.name + '".', false);
    } catch (err) {
      setProfileStatus("Couldn't save profile: " + err.message, true);
    } finally {
      saveProfileBtn.disabled = false;
    }
  }

  async function handleDeleteProfile() {
    const id = profileSelect.value;
    if (!id) return;

    const name = profileName.value || "this profile";
    if (!window.confirm('Delete "' + name + '"? This cannot be undone.')) return;

    try {
      const response = await fetch("/api/profiles/" + id, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || "Request failed with status " + response.status);
      }

      resetProfileFields();
      await loadProfiles(null);
      profileSelect.value = "";
      setProfileStatus('Deleted "' + name + '".', false);
    } catch (err) {
      setProfileStatus("Couldn't delete profile: " + err.message, true);
    }
  }

  /* ------------------------------------------------------------------------
     Check history panel
     ------------------------------------------------------------------------ */

  function scoreClass(score) {
    return score >= 80 ? "score-good" : score >= 50 ? "score-warn" : "score-bad";
  }

  function formatTimestamp(isoString) {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  /** Fetches recent check_history entries and renders them in the sidebar. */
  async function loadHistory() {
    try {
      const response = await fetch("/api/history?limit=10");
      if (!response.ok) throw new Error("Request failed with status " + response.status);
      const entries = await response.json();

      historyList.querySelectorAll(".history-item").forEach((el) => el.remove());

      if (!entries.length) {
        historyEmpty.hidden = false;
        return;
      }
      historyEmpty.hidden = true;

      entries.forEach((entry) => {
        const item = document.createElement("li");
        item.className = "history-item";

        const details = document.createElement("div");
        details.className = "history-details";

        const snippet = document.createElement("span");
        snippet.className = "history-snippet";
        snippet.textContent = entry.content_snippet || "(empty)";

        const meta = document.createElement("span");
        meta.className = "history-meta";
        const parts = [formatTimestamp(entry.checked_at)];
        if (entry.profile_name) parts.push(entry.profile_name);
        meta.textContent = parts.filter(Boolean).join(" · ");

        details.appendChild(snippet);
        details.appendChild(meta);

        const score = document.createElement("span");
        score.className = "history-score " + scoreClass(entry.overall_score);
        score.textContent = entry.overall_score + "/100";

        item.appendChild(details);
        item.appendChild(score);
        historyList.appendChild(item);
      });
    } catch (err) {
      console.error("Failed to load check history:", err);
    }
  }

  checkContentBtn.addEventListener("click", handleCheckContent);
  profileSelect.addEventListener("change", handleProfileSelectChange);
  saveProfileBtn.addEventListener("click", handleSaveProfile);
  deleteProfileBtn.addEventListener("click", handleDeleteProfile);

  loadProfiles();
  loadHistory();
})();
