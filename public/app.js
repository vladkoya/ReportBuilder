const form = document.getElementById("extract-form");
const statusSection = document.getElementById("status");
const resultsSection = document.getElementById("results");
const submitButton = document.getElementById("submit-button");
const environmentSelect = document.getElementById("environment");
const scInstanceIdInput = document.getElementById("scInstanceId");
const viewIdInput = document.getElementById("viewId");
const reportNameInput = document.getElementById("reportName");

const environmentDefaults = {};

function setStatus(message, mode) {
  statusSection.className = `card ${mode}`;
  statusSection.textContent = message;
  statusSection.classList.remove("hidden");
}

function setResultHtml(html) {
  resultsSection.innerHTML = html;
  resultsSection.classList.remove("hidden");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function updateIdentifierInputs() {
  const selectedEnvironment = environmentSelect.value;
  const defaults = environmentDefaults[selectedEnvironment];

  if (defaults) {
    scInstanceIdInput.value = defaults.scInstanceId;
    viewIdInput.value = defaults.viewId;
    scInstanceIdInput.readOnly = true;
    viewIdInput.readOnly = true;
    return;
  }

  scInstanceIdInput.readOnly = false;
  viewIdInput.readOnly = false;
}

function asJsonBlock(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

async function loadDefaults() {
  const response = await fetch("/api/environments");
  if (!response.ok) {
    throw new Error("Failed to load environment defaults.");
  }

  const json = await response.json();
  Object.assign(environmentDefaults, json);
  updateIdentifierInputs();
}

environmentSelect.addEventListener("change", updateIdentifierInputs);

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  submitButton.disabled = true;
  resultsSection.classList.add("hidden");
  setStatus("Running extraction workflow...", "success");

  const payload = {
    environment: environmentSelect.value,
    scInstanceId: scInstanceIdInput.value.trim(),
    viewId: viewIdInput.value.trim(),
    reportName: reportNameInput.value.trim(),
  };

  if (payload.environment !== "CUSTOM") {
    delete payload.scInstanceId;
    delete payload.viewId;
  }

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const json = await response.json();
    if (!response.ok) {
      throw new Error(json.error || "Extraction failed.");
    }

    const warnings = json.dataFetch?.warnings || [];
    if (warnings.length > 0) {
      setStatus("Extraction completed with warnings. See data fetch status below.", "warning");
    } else {
      setStatus("Extraction complete.", "success");
    }

    setResultHtml(`
      <h2>Workflow Output</h2>
      <p><strong>Environment:</strong> ${escapeHtml(json.input.environment)}</p>
      <p><strong>stormcenterDeploymentId:</strong> ${escapeHtml(json.identifiers.stormcenterDeploymentId)}</p>
      <p><strong>interval_generation_data:</strong> ${escapeHtml(
        json.identifiers.intervalGenerationData
      )}</p>

      <h3>Constructed URLs</h3>
      <ul class="url-list">
        <li>Current state: <a href="${escapeHtml(json.urls.currentStateUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
      json.urls.currentStateUrl
    )}</a></li>
        <li>Configuration: <a href="${escapeHtml(json.urls.configurationUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
      json.urls.configurationUrl
    )}</a></li>
        <li>Report JSON: <a href="${escapeHtml(json.urls.reportUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
      json.urls.reportUrl
    )}</a></li>
        <li>Summary JSON: <a href="${escapeHtml(json.urls.summaryUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
      json.urls.summaryUrl
    )}</a></li>
      </ul>

      <h3>Selected Source Paths</h3>
      ${asJsonBlock(json.selectedSources)}

      <h3>Data Fetch Status</h3>
      ${asJsonBlock(json.dataFetch)}

      <h3>Report Data</h3>
      ${asJsonBlock(json.data.report)}

      <h3>Summary Data</h3>
      ${asJsonBlock(json.data.summary)}
    `);
  } catch (error) {
    setStatus(error.message || "Unexpected error during extraction.", "error");
  } finally {
    submitButton.disabled = false;
  }
});

loadDefaults().catch((error) => {
  setStatus(error.message || "Failed to initialize app.", "error");
});
