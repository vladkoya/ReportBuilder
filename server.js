const express = require("express");
const path = require("node:path");

const app = express();
const port = Number(process.env.PORT) || 3000;

const KUBRA_BASE_URL = "https://kubra.io";
const ENVIRONMENTS = {
  TEST: {
    scInstanceId: "6efee6dd-5620-4572-ba47-5d7c83a8d41a",
    viewId: "d0937543-b469-4806-9caa-a8ce44da4ce2",
  },
  PROD: {
    scInstanceId: "877fd1e9-4162-473f-b782-d8a53a85326b",
    viewId: "a6cee9e4-312b-4b77-9913-2ae371eb860d",
  },
};

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function buildCurrentStateUrl(scInstanceId, viewId) {
  return `${KUBRA_BASE_URL}/stormcenter/api/v1/stormcenters/${scInstanceId}/views/${viewId}/currentState?preview=false`;
}

function buildConfigurationUrl(scInstanceId, viewId, deploymentId) {
  return `${KUBRA_BASE_URL}/stormcenter/api/v1/stormcenters/${scInstanceId}/views/${viewId}/configuration/${deploymentId}?preview=false`;
}

function buildAssetUrl(intervalGenerationData, source) {
  const cleanInterval = String(intervalGenerationData || "").replace(/^\/+|\/+$/g, "");
  const cleanSource = String(source || "").replace(/^\/+/, "");
  return `${KUBRA_BASE_URL}/${cleanInterval}/${cleanSource}`;
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}...`;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Request failed (${response.status}) for ${url}. Response: ${truncate(body, 400)}`
    );
  }

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`Expected JSON response from ${url}`);
  }
}

async function fetchJsonBestEffort(url) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
    });
    const body = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        url,
        status: response.status,
        error: `Request failed (${response.status}). Response: ${truncate(body, 400)}`,
        data: null,
      };
    }

    try {
      return {
        ok: true,
        url,
        status: response.status,
        error: null,
        data: JSON.parse(body),
      };
    } catch (error) {
      return {
        ok: false,
        url,
        status: response.status,
        error: "Response was not valid JSON.",
        data: null,
      };
    }
  } catch (error) {
    return {
      ok: false,
      url,
      status: null,
      error: error instanceof Error ? error.message : "Unexpected fetch error",
      data: null,
    };
  }
}

function findFirstValueByKey(node, targetKey) {
  if (Array.isArray(node)) {
    for (const item of node) {
      const result = findFirstValueByKey(item, targetKey);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  if (!node || typeof node !== "object") {
    return undefined;
  }

  if (Object.prototype.hasOwnProperty.call(node, targetKey)) {
    return node[targetKey];
  }

  for (const value of Object.values(node)) {
    const result = findFirstValueByKey(value, targetKey);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
}

function extractNameHints(candidateContext) {
  const hintKeys = ["reportName", "name", "title", "displayName", "label", "description"];
  const hints = [];
  for (const key of hintKeys) {
    if (typeof candidateContext[key] === "string" && candidateContext[key].trim()) {
      hints.push(candidateContext[key].trim().toLowerCase());
    }
  }
  return hints.join(" | ");
}

function collectSourceCandidates(node, trail = [], output = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectSourceCandidates(item, [...trail, String(index)], output));
    return output;
  }

  if (!node || typeof node !== "object") {
    return output;
  }

  if (typeof node.source === "string") {
    output.push({
      source: node.source,
      trail: trail.join("."),
      nameHints: extractNameHints(node),
      context: node,
    });
  }

  for (const [key, value] of Object.entries(node)) {
    collectSourceCandidates(value, [...trail, key], output);
  }

  return output;
}

function chooseReportSource(candidates, reportName) {
  const reportCandidates = candidates.filter((item) =>
    /^public\/reports\/.+_report\.json$/i.test(item.source)
  );

  if (reportCandidates.length === 0) {
    return { selected: null, matches: [] };
  }

  const normalizedReportName = String(reportName || "").trim().toLowerCase();
  if (!normalizedReportName) {
    return { selected: reportCandidates[0], matches: reportCandidates };
  }

  const scored = reportCandidates
    .map((item) => {
      let score = 0;
      const sourceLower = item.source.toLowerCase();
      const trailLower = item.trail.toLowerCase();
      const contextBlob = JSON.stringify(item.context).toLowerCase();

      if (sourceLower.includes(normalizedReportName)) {
        score += 4;
      }
      if (trailLower.includes(normalizedReportName)) {
        score += 2;
      }
      if (item.nameHints.includes(normalizedReportName)) {
        score += 6;
      }
      if (contextBlob.includes(normalizedReportName)) {
        score += 3;
      }

      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);

  const matches = scored.filter((item) => item.score > 0);
  return {
    selected: (matches[0] || scored[0]) ?? null,
    matches: matches.length > 0 ? matches : scored,
  };
}

function chooseSummarySource(candidates) {
  const summaryCandidates = candidates.filter((item) =>
    /^public\/summary-\d+\/data\.json$/i.test(item.source)
  );

  if (summaryCandidates.length === 0) {
    return null;
  }

  return summaryCandidates.sort((a, b) => {
    const aMatch = a.source.match(/^public\/summary-(\d+)\/data\.json$/i);
    const bMatch = b.source.match(/^public\/summary-(\d+)\/data\.json$/i);
    const aNumber = aMatch ? Number(aMatch[1]) : -1;
    const bNumber = bMatch ? Number(bMatch[1]) : -1;
    return bNumber - aNumber;
  })[0];
}

function resolveIdentifiers({ environment, scInstanceId, viewId }) {
  const normalizedEnvironment = String(environment || "TEST").toUpperCase();
  const defaults = ENVIRONMENTS[normalizedEnvironment];

  return {
    environment: normalizedEnvironment,
    scInstanceId: scInstanceId || defaults?.scInstanceId,
    viewId: viewId || defaults?.viewId,
  };
}

app.get("/api/environments", (req, res) => {
  res.json(ENVIRONMENTS);
});

app.post("/api/extract", async (req, res) => {
  try {
    const { environment, scInstanceId, viewId, reportName } = req.body ?? {};
    const identifiers = resolveIdentifiers({ environment, scInstanceId, viewId });

    if (!identifiers.scInstanceId || !identifiers.viewId) {
      return res.status(400).json({
        error:
          "Missing required identifiers. Provide environment (TEST/PROD) or explicit scInstanceId and viewId.",
      });
    }

    const currentStateUrl = buildCurrentStateUrl(identifiers.scInstanceId, identifiers.viewId);
    const currentState = await fetchJson(currentStateUrl);

    const stormcenterDeploymentId =
      currentState.stormcenterDeploymentId ||
      findFirstValueByKey(currentState, "stormcenterDeploymentId");
    const intervalGenerationData =
      currentState?.data?.interval_generation_data ||
      findFirstValueByKey(currentState, "interval_generation_data");

    if (!stormcenterDeploymentId || !intervalGenerationData) {
      return res.status(500).json({
        error:
          "Current state did not include stormcenterDeploymentId and interval_generation_data.",
        currentState,
      });
    }

    const configurationUrl = buildConfigurationUrl(
      identifiers.scInstanceId,
      identifiers.viewId,
      stormcenterDeploymentId
    );
    const configuration = await fetchJson(configurationUrl);

    const sourceCandidates = collectSourceCandidates(configuration);
    const reportSelection = chooseReportSource(sourceCandidates, reportName);
    const summarySelection = chooseSummarySource(sourceCandidates);

    if (!reportSelection.selected) {
      return res.status(500).json({
        error: "No report source found in configuration response.",
        sourceCandidates,
      });
    }

    if (!summarySelection) {
      return res.status(500).json({
        error: "No summary source found in configuration response.",
        sourceCandidates,
      });
    }

    const reportUrl = buildAssetUrl(intervalGenerationData, reportSelection.selected.source);
    const summaryUrl = buildAssetUrl(intervalGenerationData, summarySelection.source);

    const [reportResult, summaryResult] = await Promise.all([
      fetchJsonBestEffort(reportUrl),
      fetchJsonBestEffort(summaryUrl),
    ]);

    const dataFetchWarnings = [];
    if (!reportResult.ok) {
      dataFetchWarnings.push(`Report data fetch failed: ${reportResult.error}`);
    }
    if (!summaryResult.ok) {
      dataFetchWarnings.push(`Summary data fetch failed: ${summaryResult.error}`);
    }

    return res.json({
      workflow: {
        step1CurrentState: "completed",
        step2Configuration: "completed",
        step3SourceExtraction: "completed",
        step4UrlConstruction: "completed",
        step5And6DataFetch: dataFetchWarnings.length === 0 ? "completed" : "completed_with_warnings",
      },
      input: {
        environment: identifiers.environment,
        reportName: reportName || null,
      },
      identifiers: {
        scInstanceId: identifiers.scInstanceId,
        viewId: identifiers.viewId,
        stormcenterDeploymentId,
        intervalGenerationData,
      },
      urls: {
        currentStateUrl,
        configurationUrl,
        reportUrl,
        summaryUrl,
      },
      selectedSources: {
        reportSource: reportSelection.selected.source,
        summarySource: summarySelection.source,
      },
      reportMatches: reportSelection.matches.slice(0, 10).map((item) => ({
        source: item.source,
        trail: item.trail,
        score: item.score ?? null,
      })),
      sourceCandidates: sourceCandidates.map((item) => ({
        source: item.source,
        trail: item.trail,
      })),
      dataFetch: {
        report: {
          ok: reportResult.ok,
          status: reportResult.status,
          error: reportResult.error,
          url: reportResult.url,
        },
        summary: {
          ok: summaryResult.ok,
          status: summaryResult.status,
          error: summaryResult.error,
          url: summaryResult.url,
        },
        warnings: dataFetchWarnings,
      },
      data: {
        report: reportResult.data,
        summary: summaryResult.data,
      },
    });
  } catch (error) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : "Unexpected server error",
    });
  }
});

app.listen(port, () => {
  console.log(`SC5 extractor app listening on http://localhost:${port}`);
});
