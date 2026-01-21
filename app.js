class AVLNode {
  constructor(key, value) {
    this.key = key;
    this.value = value;
    this.height = 1;
    this.left = null;
    this.right = null;
  }
}

class AVLTree {
  constructor() {
    this.root = null;
  }

  height(node) {
    return node ? node.height : 0;
  }

  rotateRight(y) {
    const x = y.left;
    const t2 = x.right;
    x.right = y;
    y.left = t2;
    y.height = 1 + Math.max(this.height(y.left), this.height(y.right));
    x.height = 1 + Math.max(this.height(x.left), this.height(x.right));
    return x;
  }

  rotateLeft(x) {
    const y = x.right;
    const t2 = y.left;
    y.left = x;
    x.right = t2;
    x.height = 1 + Math.max(this.height(x.left), this.height(x.right));
    y.height = 1 + Math.max(this.height(y.left), this.height(y.right));
    return y;
  }

  getBalance(node) {
    return node ? this.height(node.left) - this.height(node.right) : 0;
  }

  insert(key, value) {
    this.root = this._insert(this.root, key, value);
  }

  _insert(node, key, value) {
    if (!node) return new AVLNode(key, value);
    if (key < node.key) {
      node.left = this._insert(node.left, key, value);
    } else if (key > node.key) {
      node.right = this._insert(node.right, key, value);
    } else {
      node.value = value;
      return node;
    }

    node.height = 1 + Math.max(this.height(node.left), this.height(node.right));
    const balance = this.getBalance(node);

    if (balance > 1 && key < node.left.key) return this.rotateRight(node);
    if (balance < -1 && key > node.right.key) return this.rotateLeft(node);
    if (balance > 1 && key > node.left.key) {
      node.left = this.rotateLeft(node.left);
      return this.rotateRight(node);
    }
    if (balance < -1 && key < node.right.key) {
      node.right = this.rotateRight(node.right);
      return this.rotateLeft(node);
    }
    return node;
  }

  search(key) {
    let current = this.root;
    while (current) {
      if (key === current.key) return current.value;
      current = key < current.key ? current.left : current.right;
    }
    return null;
  }

  toArray() {
    const result = [];
    this._inorder(this.root, result);
    return result;
  }

  _inorder(node, list) {
    if (!node) return;
    this._inorder(node.left, list);
    list.push({ key: node.key, value: node.value });
    this._inorder(node.right, list);
  }
}

const API_BASE = 'http://localhost:8080/api';

const snapshot1PathInput = document.getElementById('snapshot1-path');
const snapshot1LabelInput = document.getElementById('snapshot1-label');
const snapshot2PathInput = document.getElementById('snapshot2-path');
const snapshot2LabelInput = document.getElementById('snapshot2-label');

const snapshot1CreateBtn = document.getElementById('snapshot1-create');
const snapshot2CreateBtn = document.getElementById('snapshot2-create');
const summary1 = document.getElementById('snapshot1-summary');
const summary2 = document.getElementById('snapshot2-summary');
const compareBtn = document.getElementById('compare');
const resetBtn = document.getElementById('reset');
const loadDemoBtn = document.getElementById('load-demo');

const metricTotal = document.getElementById('metric-total');
const metricAdded = document.getElementById('metric-added');
const metricDeleted = document.getElementById('metric-deleted');
const metricModified = document.getElementById('metric-modified');
const metricHigh = document.getElementById('metric-high');

const listAdded = document.getElementById('list-added');
const listDeleted = document.getElementById('list-deleted');
const listModified = document.getElementById('list-modified');
const riskTable = document.getElementById('risk-table');

let snapshot1Id = null;
let snapshot2Id = null;

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function setBusy(el, busy, label) {
  if (!el) return;
  el.disabled = busy;
  if (busy && label) {
    el.dataset.prevLabel = el.textContent;
    el.textContent = label;
  } else if (!busy && el.dataset.prevLabel) {
    el.textContent = el.dataset.prevLabel;
    delete el.dataset.prevLabel;
  }
}

function renderList(element, items, formatter) {
  element.innerHTML = '';
  if (!items.length) {
    element.innerHTML = '<li class="muted">None</li>';
    return;
  }
  items.forEach((item) => {
    const li = document.createElement('li');
    li.innerHTML = formatter(item);
    element.appendChild(li);
  });
}

function renderRiskTable(risks) {
  riskTable.innerHTML = '';
  if (!risks.length) {
    const row = document.createElement('tr');
    row.innerHTML = '<td colspan="5" class="muted">No risks detected</td>';
    riskTable.appendChild(row);
    return;
  }

  risks.forEach((r) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${r.filePath || '-'}</td>
      <td>${r.change || r.changeType || '-'}</td>
      <td>${r.riskScore ?? '-'}</td>
      <td class="${(r.severity || '').toLowerCase()}">${r.severity || '-'}</td>
      <td>${(r.reasons || []).join(', ')}</td>
    `;
    riskTable.appendChild(row);
  });
}

function updateMetrics(summary) {
  metricTotal.textContent = summary ? summary.totalChanges : 0;
  metricAdded.textContent = summary ? summary.added.length : 0;
  metricDeleted.textContent = summary ? summary.deleted.length : 0;
  metricModified.textContent = summary ? summary.modified.length : 0;
  const highCount = summary ? summary.risks.filter((r) => (r.severity || '').toLowerCase() === 'high').length : 0;
  metricHigh.textContent = highCount;
}

function setSummary(el, text) {
  el.textContent = text || 'Awaiting path…';
}

async function apiCreateSnapshot(path, label) {
  const url = `${API_BASE}/snapshots?directoryPath=${encodeURIComponent(path)}&label=${encodeURIComponent(label)}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || 'Snapshot creation failed');
  }
  return res.json();
}

async function apiDiff(beforeId, afterId) {
  const url = `${API_BASE}/diff?beforeId=${beforeId}&afterId=${afterId}`;
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || 'Diff failed');
  }
  return res.json();
}

async function handleCreateSnapshot(slot) {
  const pathInput = slot === 1 ? snapshot1PathInput : snapshot2PathInput;
  const labelInput = slot === 1 ? snapshot1LabelInput : snapshot2LabelInput;
  const summary = slot === 1 ? summary1 : summary2;
  const btn = slot === 1 ? snapshot1CreateBtn : snapshot2CreateBtn;

  const path = pathInput.value.trim();
  const label = (labelInput.value || (slot === 1 ? 'Before' : 'After')).trim();
  if (!path) {
    alert('Enter a directory path (accessible to the backend host).');
    return;
  }

  setBusy(btn, true, 'Working…');
  setSummary(summary, 'Scanning…');
  try {
    const snap = await apiCreateSnapshot(path, label);
    const details = `ID ${snap.id} • ${snap.totalFilesScanned} files • ${new Date(snap.createdAt).toLocaleString()}`;
    setSummary(summary, details);
    if (slot === 1) {
      snapshot1Id = snap.id;
    } else {
      snapshot2Id = snap.id;
    }
  } catch (err) {
    console.error(err);
    setSummary(summary, `Error: ${err.message}`);
    alert(err.message);
  } finally {
    setBusy(btn, false);
  }
}

async function handleCompare() {
  if (!snapshot1Id || !snapshot2Id) {
    alert('Create both snapshots first.');
    return;
  }

  setBusy(compareBtn, true, 'Comparing…');
  try {
    const diff = await apiDiff(snapshot1Id, snapshot2Id);

    renderList(listAdded, diff.added || [], (item) => `<strong>${item.filePath}</strong><br><small>${formatBytes(item.sizeBytes)}</small>`);
    renderList(listDeleted, diff.deleted || [], (item) => `<strong>${item.filePath}</strong><br><small>${formatBytes(item.sizeBytes)}</small>`);
    renderList(
      listModified,
      diff.modified || [],
      (item) => `<strong>${item.filePath}</strong><br><small>${formatBytes(item.sizeBytes)}</small>`
    );

    const risks = diff.rankedRisk?.map((r) => ({ ...r, change: r.change || r.changeType })) || [];
    renderRiskTable(risks);

    updateMetrics({
      totalChanges: (diff.added?.length || 0) + (diff.deleted?.length || 0) + (diff.modified?.length || 0),
      added: diff.added || [],
      deleted: diff.deleted || [],
      modified: diff.modified || [],
      risks,
    });
  } catch (err) {
    console.error(err);
    alert(err.message);
  } finally {
    setBusy(compareBtn, false);
  }
}

function resetAll() {
  snapshot1Id = null;
  snapshot2Id = null;
  snapshot1PathInput.value = '';
  snapshot1LabelInput.value = '';
  snapshot2PathInput.value = '';
  snapshot2LabelInput.value = '';
  setSummary(summary1, 'Awaiting path…');
  setSummary(summary2, 'Awaiting path…');
  renderList(listAdded, [], () => '');
  renderList(listDeleted, [], () => '');
  renderList(listModified, [], () => '');
  renderRiskTable([]);
  updateMetrics(null);
}

function loadDemo() {
  snapshot1Id = 1;
  snapshot2Id = 2;
  setSummary(summary1, 'Demo: snapshot ID 1');
  setSummary(summary2, 'Demo: snapshot ID 2');
  alert('Demo placeholders set. Replace with real snapshots for live data.');
}

snapshot1CreateBtn.addEventListener('click', () => handleCreateSnapshot(1));
snapshot2CreateBtn.addEventListener('click', () => handleCreateSnapshot(2));
compareBtn.addEventListener('click', handleCompare);
resetBtn.addEventListener('click', resetAll);
loadDemoBtn.addEventListener('click', loadDemo);

resetAll();
