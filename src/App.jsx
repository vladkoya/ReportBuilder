import { useEffect, useMemo, useState } from "react";

const EMPTY_RESULT = null;

function JsonBlock({ value }) {
  return <pre>{JSON.stringify(value, null, 2)}</pre>;
}

function App() {
  const [environment, setEnvironment] = useState("TEST");
  const [reportName, setReportName] = useState("");
  const [scInstanceId, setScInstanceId] = useState("");
  const [viewId, setViewId] = useState("");
  const [environmentDefaults, setEnvironmentDefaults] = useState({});
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState({
    mode: "success",
    message: "Loading environment defaults...",
  });
  const [result, setResult] = useState(EMPTY_RESULT);

  const isCustom = environment === "CUSTOM";
  const canSubmit = useMemo(() => {
    if (!isCustom) {
      return true;
    }
    return scInstanceId.trim() && viewId.trim();
  }, [isCustom, scInstanceId, viewId]);

  useEffect(() => {
    async function loadDefaults() {
      try {
        const response = await fetch("/api/environments");
        if (!response.ok) {
          throw new Error("Failed to load environment defaults.");
        }
        const json = await response.json();
        setEnvironmentDefaults(json);
        setStatus({
          mode: "success",
          message: "Ready. Choose an environment and run extraction.",
        });
      } catch (error) {
        setStatus({
          mode: "error",
          message: error.message || "Failed to initialize app.",
        });
      } finally {
        setLoadingDefaults(false);
      }
    }

    loadDefaults();
  }, []);

  useEffect(() => {
    const defaults = environmentDefaults[environment];
    if (defaults && !isCustom) {
      setScInstanceId(defaults.scInstanceId);
      setViewId(defaults.viewId);
    }
    if (isCustom) {
      setScInstanceId((previous) => previous);
      setViewId((previous) => previous);
    }
  }, [environment, environmentDefaults, isCustom]);

  async function onSubmit(event) {
    event.preventDefault();
    if (!canSubmit || submitting) {
      return;
    }

    setSubmitting(true);
    setResult(EMPTY_RESULT);
    setStatus({
      mode: "success",
      message: "Running extraction workflow...",
    });

    const payload = {
      environment,
      reportName: reportName.trim(),
    };

    if (isCustom) {
      payload.scInstanceId = scInstanceId.trim();
      payload.viewId = viewId.trim();
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
      setResult(json);
      setStatus(
        warnings.length > 0
          ? {
              mode: "warning",
              message: "Extraction completed with warnings. See data fetch status below.",
            }
          : {
              mode: "success",
              message: "Extraction complete.",
            }
      );
    } catch (error) {
      setStatus({
        mode: "error",
        message: error.message || "Unexpected error during extraction.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="container">
      <h1>Storm Center 5 Report Data Extraction</h1>
      <p className="subtitle">
        Executes the guide workflow: current state -&gt; configuration -&gt; source extraction -&gt;
        final URLs -&gt; report and summary fetch.
      </p>

      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="environment">Environment</label>
          <select
            id="environment"
            name="environment"
            value={environment}
            onChange={(event) => setEnvironment(event.target.value)}
            disabled={loadingDefaults || submitting}
          >
            <option value="TEST">TEST</option>
            <option value="PROD">PROD</option>
            <option value="CUSTOM">CUSTOM</option>
          </select>
        </div>

        <div className="grid">
          <div className="field">
            <label htmlFor="scInstanceId">scInstanceId</label>
            <input
              id="scInstanceId"
              name="scInstanceId"
              value={scInstanceId}
              onChange={(event) => setScInstanceId(event.target.value)}
              readOnly={!isCustom}
              required={isCustom}
            />
          </div>
          <div className="field">
            <label htmlFor="viewId">viewId</label>
            <input
              id="viewId"
              name="viewId"
              value={viewId}
              onChange={(event) => setViewId(event.target.value)}
              readOnly={!isCustom}
              required={isCustom}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor="reportName">reportName (optional)</label>
          <input
            id="reportName"
            name="reportName"
            placeholder="e.g. outage summary report"
            value={reportName}
            onChange={(event) => setReportName(event.target.value)}
          />
        </div>

        <button id="submit-button" type="submit" disabled={!canSubmit || submitting || loadingDefaults}>
          {submitting ? "Running..." : "Run Extraction"}
        </button>
      </form>

      <section className={`card ${status.mode}`}>{status.message}</section>

      {result ? (
        <section className="card">
          <h2>Workflow Output</h2>
          <p>
            <strong>Environment:</strong> {result.input.environment}
          </p>
          <p>
            <strong>stormcenterDeploymentId:</strong> {result.identifiers.stormcenterDeploymentId}
          </p>
          <p>
            <strong>interval_generation_data:</strong> {result.identifiers.intervalGenerationData}
          </p>

          <h3>Constructed URLs</h3>
          <ul className="url-list">
            <li>
              Current state:{" "}
              <a href={result.urls.currentStateUrl} target="_blank" rel="noreferrer">
                {result.urls.currentStateUrl}
              </a>
            </li>
            <li>
              Configuration:{" "}
              <a href={result.urls.configurationUrl} target="_blank" rel="noreferrer">
                {result.urls.configurationUrl}
              </a>
            </li>
            <li>
              Report JSON:{" "}
              <a href={result.urls.reportUrl} target="_blank" rel="noreferrer">
                {result.urls.reportUrl}
              </a>
            </li>
            <li>
              Summary JSON:{" "}
              <a href={result.urls.summaryUrl} target="_blank" rel="noreferrer">
                {result.urls.summaryUrl}
              </a>
            </li>
          </ul>

          <h3>Selected Source Paths</h3>
          <JsonBlock value={result.selectedSources} />

          <h3>Data Fetch Status</h3>
          <JsonBlock value={result.dataFetch} />

          <h3>Report Data</h3>
          <JsonBlock value={result.data.report} />

          <h3>Summary Data</h3>
          <JsonBlock value={result.data.summary} />
        </section>
      ) : null}
    </main>
  );
}

export default App;
