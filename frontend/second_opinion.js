// The advisory panel. Model-authored text is inserted as text nodes, never as markup: the narrative,
// the quotes and the rejection reasons all originate outside this system.
const SO_LINES = ["deterioration_risk", "prediction_reliability", "data_completeness", "uncertainty"];

function soClear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

function soLines(target, block, differing = []) {
  soClear(target);
  SO_LINES.forEach((key) => {
    const cell = block && block.display ? block.display[key] : null;
    const term = document.createElement("dt");
    term.textContent = cell ? cell.label : titleCase(key);
    const value = document.createElement("dd");
    value.textContent = cell ? cell.display : "—";
    if (!cell) value.classList.add("absent");
    // A band alone hides how close a value sits to its threshold; show the number that produced it.
    if (cell && typeof cell.raw === "number" && !cell.display.endsWith("%")) {
      const raw = document.createElement("small");
      raw.textContent = cell.raw.toFixed(2);
      value.append(raw);
    }
    if (differing.includes(key)) value.classList.add("differs");
    target.append(term, value);
  });
}

function soList(target, items, formatter) {
  soClear(target);
  target.hidden = !items || items.length === 0;
  (items || []).forEach((item) => {
    const entry = document.createElement("li");
    entry.textContent = formatter(item);
    target.append(entry);
  });
}

function renderSecondOpinion(payload) {
  const card = document.querySelector("#second-opinion");
  card.hidden = false;
  const advisory = payload.second_opinion || {};
  const divergence = payload.divergence || {};
  const differing = divergence.differing_lines || [];

  document.querySelector("#so-authority").textContent = payload.authority.statement;
  const chip = document.querySelector("#so-status");
  chip.textContent = payload.status === "OK"
    ? `${advisory.advisory_model_id}${advisory.cached ? " · cached" : ""}`
    : "advisory unavailable";
  chip.className = payload.status === "OK" ? "so-chip" : "so-chip offline";

  // The engine column renders in every state, including when the advisory model is discarded.
  soLines(document.querySelector("#so-engine"), payload.engine, differing);
  soList(document.querySelector("#so-engine-reasons"), payload.engine.reasons, (reason) => reason);

  const degraded = document.querySelector("#so-degraded");
  if (payload.status !== "OK") {
    soLines(document.querySelector("#so-advisory"), null);
    degraded.hidden = false;
    soClear(degraded);
    const message = document.createElement("p");
    message.textContent = payload.degraded.message;
    degraded.append(message);
    if (payload.degraded.detail && payload.degraded.detail.length) {
      const why = document.createElement("ul");
      payload.degraded.detail.forEach((line) => {
        const item = document.createElement("li");
        item.textContent = line;
        why.append(item);
      });
      degraded.append(why);
    }
    document.querySelector("#so-divergence").hidden = true;
    document.querySelector("#so-narrative").hidden = true;
    document.querySelector("#so-evidence").hidden = true;
    document.querySelector("#so-advisory-reasons").hidden = true;
    return;
  }

  degraded.hidden = true;
  soLines(document.querySelector("#so-advisory"), advisory, differing);

  const banner = document.querySelector("#so-divergence");
  banner.hidden = divergence.status !== "DIVERGE";
  banner.textContent = divergence.banner || "";

  const narrative = document.querySelector("#so-narrative");
  narrative.hidden = false;
  narrative.textContent = advisory.narrative;

  soList(document.querySelector("#so-evidence"), advisory.evidence,
    (item) => `“${item.quote}” → ${item.field} = ${item.stated_value}`);
  soList(document.querySelector("#so-advisory-reasons"), advisory.reliability_reasons, (reason) => reason);

  const trend = document.querySelector("#so-trend");
  trend.textContent = payload.trend_note
    ? `Trend features: ${payload.trend_source} — ${payload.trend_note}`
    : `Trend features: ${payload.trend_source}`;
}
