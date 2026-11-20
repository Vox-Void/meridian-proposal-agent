const element = (id) => document.getElementById(id);
const form = element('draft-form');
const mode = element('mode');
const samples = element('sample');
const notes = element('notes');
const editor = element('editor');
const generate = element('generate');
const errorMessage = element('error');
let config;
let editorReady = false;
let busy = false;

async function getJson(url, options) {
  const response = await fetch(url, options);
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'The request failed.');
  return value;
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.hidden = !message;
}

function updateForm() {
  const live = config?.live && mode.value === 'live';
  notes.readOnly = busy || !live;
  mode.disabled = busy || !config;
  samples.disabled = busy || !config;
  generate.disabled = busy || !editorReady || !config || !notes.value.trim() || (!live && !samples.value);
  const chip = element('mode-chip');
  chip.textContent = live ? 'Live · Claude' : 'Offline sample replay';
  chip.hidden = !config;
  element('mode-help').textContent = live
    ? 'Use fictional notes. Live extraction sends the notes to Claude.'
    : config?.live
      ? 'Offline replay uses recorded sample extractions.'
      : 'Offline replay uses recorded samples. Set ANTHROPIC_API_KEY on the server for custom notes.';
  notes.placeholder = live ? 'Paste fictional adviser notes here.' : 'Choose a sample to load the adviser notes.';
}

function loadSample() {
  notes.value = config.samples.find(({ id }) => id === samples.value)?.notes ?? '';
  showError('');
  updateForm();
}

function editorLoaded() {
  editorReady = typeof editor.contentWindow.loadProposal === 'function'
    && typeof editor.contentWindow.challenge?.models === 'function';
  if (!editorReady) showError('The proposal editor could not load. Reload the page and try again.');
  updateForm();
}

editor.addEventListener('load', editorLoaded);
if (editor.contentDocument?.readyState === 'complete' && editor.contentWindow.challenge) editorLoaded();
samples.addEventListener('change', loadSample);
notes.addEventListener('input', () => {
  showError('');
  updateForm();
});
mode.addEventListener('change', () => {
  if (mode.value === 'sample') loadSample();
  showError('');
  updateForm();
});

element('open-editor').addEventListener('click', (event) => {
  const expanded = document.querySelector('main').classList.toggle('editor-expanded');
  event.currentTarget.textContent = expanded ? 'Show adviser notes' : 'Expand editor';
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
});

function renderResult({ review, evidence, proposal, source }) {
  element('review').replaceChildren(...review.map((item) => {
    const line = document.createElement('li');
    line.textContent = item;
    return line;
  }));
  element('evidence').replaceChildren(...Object.entries(evidence).flatMap(([label, excerpt]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = excerpt;
    return [term, description];
  }));
  element('evidence-panel').hidden = !Object.keys(evidence).length;
  element('proposal-json').textContent = JSON.stringify(proposal, null, 2);
  element('result').hidden = false;
  element('editor-placeholder').hidden = true;
  element('open-editor').hidden = false;
  element('editor-state').textContent = 'Draft open';
  element('status').textContent = `Draft opened · ${source}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (generate.disabled) return;
  busy = true;
  updateForm();
  showError('');
  element('status').textContent = 'Preparing draft…';
  try {
    const modelIds = editor.contentWindow.challenge.models().map(({ id }) => id);
    const result = await getJson('/api/proposal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: mode.value, sampleId: samples.value, notes: notes.value, modelIds }),
    });
    editor.hidden = false;
    editor.contentWindow.loadProposal(result.proposal);
    renderResult(result);
  } catch (error) {
    if (element('result').hidden) editor.hidden = true;
    element('status').textContent = '';
    showError(error.message || 'Could not open the draft.');
  } finally {
    busy = false;
    updateForm();
  }
});

getJson('/api/config').then((value) => {
  config = value;
  for (const { id, label } of value.samples) samples.add(new Option(label, id));
  mode.querySelector('[value="live"]').disabled = !value.live;
  mode.value = value.live ? 'live' : 'sample';
  updateForm();
}).catch(() => showError('Could not connect to the local server. Reload the page and try again.'));
