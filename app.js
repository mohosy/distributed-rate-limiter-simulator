const policySelect = document.getElementById("policySelect");
const nodesInput = document.getElementById("nodesInput");
const rpsInput = document.getElementById("rpsInput");
const burstInput = document.getElementById("burstInput");

const nodesValue = document.getElementById("nodesValue");
const rpsValue = document.getElementById("rpsValue");
const burstValue = document.getElementById("burstValue");

const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const spikeBtn = document.getElementById("spikeBtn");
const resetBtn = document.getElementById("resetBtn");

const acceptedText = document.getElementById("acceptedText");
const droppedText = document.getElementById("droppedText");
const dropRateText = document.getElementById("dropRateText");
const queueText = document.getElementById("queueText");

const canvas = document.getElementById("viz");
const ctx = canvas.getContext("2d");

let nodes = [];
let running = false;
let accepted = 0;
let dropped = 0;
let queueSum = 0;
let queueSamples = 0;
let wave = 0;

function createNode(i, n) {
  return {
    id: i,
    x: 120 + (i * (canvas.width - 240)) / Math.max(1, n - 1),
    y: canvas.height / 2,
    tokens: 120,
    queue: 0,
    windowUsed: 0,
    localAccepted: 0,
    localDropped: 0,
  };
}

function resetSim() {
  const n = Number(nodesInput.value);
  nodes = Array.from({ length: n }, (_, i) => createNode(i, n));
  accepted = 0;
  dropped = 0;
  queueSum = 0;
  queueSamples = 0;
  wave = 0;
  draw();
  updateMetrics();
}

function step() {
  if (!running) return;

  const policy = policySelect.value;
  const incomingRps = Number(rpsInput.value);
  const burst = Number(burstInput.value);
  wave += 0.14;

  const intervalSec = 0.1;
  const incoming = incomingRps * intervalSec * (1 + Math.max(0, Math.sin(wave) * (burst - 1)));

  const nodeShare = incoming / nodes.length;

  nodes.forEach((node, i) => {
    const jitter = 0.8 + ((i % 3) * 0.15);
    const demand = nodeShare * jitter;

    if (policy === "token") {
      node.tokens = Math.min(180, node.tokens + 18 * intervalSec);
      const served = Math.min(node.tokens, demand);
      node.tokens -= served;
      const reject = Math.max(0, demand - served);

      node.localAccepted += served;
      node.localDropped += reject;
      accepted += served;
      dropped += reject;
      node.queue = Math.max(0, node.queue + reject * 0.15 - 2 * intervalSec);
    }

    if (policy === "leaky") {
      node.queue = Math.min(140, node.queue + demand);
      const leaked = Math.min(node.queue, 16 * intervalSec);
      node.queue -= leaked;
      const served = leaked;
      const reject = Math.max(0, demand - leaked - 1.5);

      node.localAccepted += served;
      node.localDropped += reject;
      accepted += served;
      dropped += reject;
      node.queue = Math.min(160, node.queue + reject * 0.5);
    }

    if (policy === "window") {
      if (Math.floor(wave * 2) % 10 === 0) {
        node.windowUsed = 0;
      }
      const capacity = 26;
      const remaining = Math.max(0, capacity - node.windowUsed);
      const served = Math.min(remaining, demand);
      node.windowUsed += served;
      const reject = Math.max(0, demand - served);

      node.localAccepted += served;
      node.localDropped += reject;
      accepted += served;
      dropped += reject;
      node.queue = Math.max(0, node.queue + reject * 0.3 - 3 * intervalSec);
    }

    queueSum += node.queue;
    queueSamples += 1;
  });

  draw();
  updateMetrics();
  requestAnimationFrame(step);
}

function updateMetrics() {
  const total = accepted + dropped;
  acceptedText.textContent = Math.round(accepted).toString();
  droppedText.textContent = Math.round(dropped).toString();
  dropRateText.textContent = `${(total ? (dropped / total) * 100 : 0).toFixed(1)}%`;
  queueText.textContent = (queueSamples ? queueSum / queueSamples : 0).toFixed(1);
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#d6e0ff";
  ctx.font = "13px monospace";
  ctx.fillText(`Policy: ${policySelect.value.toUpperCase()}`, 18, 22);

  nodes.forEach((node) => {
    const barMax = 150;
    const qh = Math.min(barMax, node.queue * 2.1);
    const th = Math.min(barMax, node.tokens * 0.7);

    ctx.fillStyle = "rgba(130,170,255,0.26)";
    ctx.fillRect(node.x - 26, 380 - barMax, 22, barMax);
    ctx.fillStyle = "#96b3ff";
    ctx.fillRect(node.x - 26, 380 - th, 22, th);

    ctx.fillStyle = "rgba(255,140,160,0.26)";
    ctx.fillRect(node.x + 4, 380 - barMax, 22, barMax);
    ctx.fillStyle = "#ff8fa6";
    ctx.fillRect(node.x + 4, 380 - qh, 22, qh);

    ctx.beginPath();
    ctx.arc(node.x, 450, 22, 0, Math.PI * 2);
    ctx.fillStyle = "#5f76b3";
    ctx.fill();

    ctx.fillStyle = "#eef3ff";
    ctx.font = "bold 12px monospace";
    ctx.fillText(`N${node.id + 1}`, node.x - 14, 454);

    ctx.font = "11px monospace";
    ctx.fillText(`ok ${Math.round(node.localAccepted)}`, node.x - 34, 492);
    ctx.fillText(`drop ${Math.round(node.localDropped)}`, node.x - 40, 507);
  });

  ctx.fillStyle = "#9cb2e0";
  ctx.font = "11px monospace";
  ctx.fillText("Blue: token/capacity   Pink: queue pressure", 18, canvas.height - 14);
}

function trafficSpike() {
  const next = Math.min(520, Number(rpsInput.value) + 110);
  rpsInput.value = String(next);
  syncLabels();
}

function syncLabels() {
  nodesValue.textContent = nodesInput.value;
  rpsValue.textContent = rpsInput.value;
  burstValue.textContent = Number(burstInput.value).toFixed(1);
}

[nodesInput, rpsInput, burstInput].forEach((el) => {
  el.addEventListener("input", () => {
    syncLabels();
    if (el === nodesInput) resetSim();
  });
});

policySelect.addEventListener("change", resetSim);

startBtn.addEventListener("click", () => {
  if (running) return;
  running = true;
  step();
});

pauseBtn.addEventListener("click", () => {
  running = false;
});

spikeBtn.addEventListener("click", trafficSpike);
resetBtn.addEventListener("click", () => {
  running = false;
  resetSim();
});

syncLabels();
resetSim();
