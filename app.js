const element = (id) => document.getElementById(id);
const form = element('draft-form');
const mode = element('mode');
const samples = element('sample');
const notes = element('notes');
const editor = element('editor');
const generate = element('generate');
const errorMessage = element('error');
const inputsByMode = { sample: { id: '', notes: '' }, live: { id: '', notes: '' } };
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
  chip.textContent = live ? 'Live with OpenAI' : 'Offline samples';
  chip.hidden = !config;
  element('mode-help').textContent = live
    ? 'Live mode sends your notes to OpenAI. Use fictional notes.'
    : config?.live
      ? 'Offline mode uses saved results for the sample notes.'
      : 'Set OPENAI_API_KEY to use your own fictional notes. The samples work offline.';
  notes.placeholder = live ? 'Paste fictional adviser notes.' : 'Choose a sample.';
}

function loadSample() {
  notes.value = config.samples.find(({ id }) => id === samples.value)?.notes ?? '';
  inputsByMode[mode.value] = { id: samples.value, notes: notes.value };
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
  inputsByMode[mode.value].notes = notes.value;
  showError('');
  updateForm();
});
mode.addEventListener('change', () => {
  const saved = inputsByMode[mode.value];
  samples.value = saved.id;
  notes.value = saved.notes;
  showError('');
  updateForm();
});

element('open-editor').addEventListener('click', (event) => {
  const expanded = document.querySelector('main').classList.toggle('editor-expanded');
  event.currentTarget.textContent = expanded ? 'Show adviser notes' : 'Expand editor';
  event.currentTarget.setAttribute('aria-expanded', String(expanded));
});

function listItems(items) {
  return items.map((item) => {
    const line = document.createElement('li');
    line.textContent = item;
    return line;
  });
}

function renderDetails(panel, list, entries) {
  const terms = Object.entries(entries);
  element(list).replaceChildren(...terms.flatMap(([label, excerpt]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = excerpt;
    return [term, description];
  }));
  element(panel).hidden = !terms.length;
}

function renderResult({ review, evidence, draftChoices, defaults, proposal, source }) {
  element('review-heading').textContent = proposal.clientName
    ? `Review for ${proposal.clientName}`
    : 'Adviser review';
  element('review').replaceChildren(...listItems(review));
  element('defaults').replaceChildren(...listItems(defaults));
  renderDetails('evidence-panel', 'evidence', evidence);
  renderDetails('choices-panel', 'draft-choices', draftChoices);
  element('proposal-json').textContent = JSON.stringify(proposal, null, 2);
  element('result').hidden = false;
  element('editor-placeholder').hidden = true;
  element('open-editor').hidden = false;
  element('editor-state').textContent = 'Draft open';
  element('status').textContent = source === 'Offline sample replay'
    ? 'Draft opened from a sample.'
    : `Draft opened using ${source}.`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (generate.disabled) return;
  busy = true;
  updateForm();
  showError('');
  element('status').textContent = 'Preparing draft...';
  try {
    const modelIds = editor.contentWindow.challenge.models().map(({ id }) => id);
    const result = await getJson('/api/proposal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mode: mode.value, sampleId: samples.value, notes: notes.value, modelIds }),
    });
    editor.hidden = false;
    // The editor applies model defaults before it reads the draft. Empty strings clear these two dropdowns.
    const proposal = result.proposal;
    editor.contentWindow.loadProposal({
      ...proposal,
      objective: { investmentHorizon: '', riskProfileCategory: '', ...proposal.objective },
    });
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
