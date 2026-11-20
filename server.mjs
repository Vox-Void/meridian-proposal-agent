import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildProposal, extractWithOpenAI, modelProfiles, ProviderError } from './agent.mjs';
import { demos } from './demo.mjs';

const files = new Map([
  ['/', ['index.html', 'text/html']],
  ['/app.js', ['app.js', 'text/javascript']],
  ['/style.css', ['style.css', 'text/css']],
  ['/challenge-generator.html', ['challenge-generator.html', 'text/html']],
].map(([path, [file, type]]) => [path, {
  body: readFileSync(new URL(`./${file}`, import.meta.url)),
  type: `${type}; charset=utf-8`,
}]));
const maxBody = 160_000;
const maxNotes = 12_000;
const catalog = Object.entries(modelProfiles).map(([id, profile]) => ({ id, ...profile }));
const samples = demos.map(({ id, label, notes }) => ({ id, label, notes }));

function json(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', ...headers,
  });
  response.end(JSON.stringify(body));
}

async function readRequest(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBody) return { tooLarge: true };
    chunks.push(chunk);
  }
  try {
    return { input: JSON.parse(Buffer.concat(chunks).toString('utf8')) };
  } catch {
    return {};
  }
}

export function makeServer({ extract = extractWithOpenAI } = {}) {
  const live = extract !== extractWithOpenAI || Boolean(process.env.OPENAI_API_KEY?.trim());
  return createServer(async (request, response) => {
    const host = `127.0.0.1:${request.socket.localPort}`;
    const origin = `http://${host}`;
    if (request.headers.host !== host) {
      return json(response, 403, { error: 'Open the app using its loopback address.' });
    }
    if (request.method === 'GET' && files.has(request.url)) {
      const { body, type } = files.get(request.url);
      response.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff' });
      return response.end(body);
    }
    if (request.method === 'GET' && request.url === '/api/config') {
      return json(response, 200, { live, samples });
    }
    if (request.method !== 'POST' || request.url !== '/api/proposal') {
      return json(response, 404, { error: 'Route not found.' });
    }
    if (request.headers.origin !== origin) {
      return json(response, 403, { error: 'Generate drafts from the local app.' });
    }
    if (request.headers['content-type']?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') {
      return json(response, 415, { error: 'Send the proposal request as JSON.' });
    }
    try {
      const { input, tooLarge } = Number(request.headers['content-length']) > maxBody
        ? { tooLarge: true }
        : await readRequest(request);
      if (tooLarge) {
        return json(response, 413, { error: 'The proposal request is too large.' }, { connection: 'close' });
      }
      if (!input || !['sample', 'live'].includes(input.mode)
        || !Array.isArray(input.modelIds) || input.modelIds.some((id) => typeof id !== 'string')) {
        return json(response, 400, { error: 'Send a proposal request with an extraction mode and model IDs.' });
      }
      const notes = typeof input.notes === 'string' ? input.notes.replace(/\r\n/g, '\n').trim() : '';
      if (!notes || notes.length > maxNotes) {
        return json(response, 400, { error: 'Enter between 1 and 12,000 characters of adviser notes.' });
      }
      const models = catalog.filter(({ id }) => input.modelIds.includes(id));
      let result;
      if (input.mode === 'sample') {
        const sample = demos.find(({ id, notes: recorded }) => id === input.sampleId && recorded === notes);
        if (!sample) return json(response, 400, { error: 'Choose an unchanged sample for offline replay. Use live mode for custom notes.' });
        result = {
          extraction: { ...sample.extraction, model: models.some(({ id }) => id === sample.extraction.model) ? sample.extraction.model : '' },
          model: 'Offline sample replay',
        };
      } else {
        result = await extract(notes, models);
      }
      return json(response, 200, { ...buildProposal(result.extraction, notes, models), source: result.model });
    } catch (error) {
      if (response.destroyed) return;
      if (error instanceof ProviderError) return json(response, error.status, { error: error.message });
      return json(response, 500, { error: 'Could not generate a draft. Try again.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8765);
  makeServer().listen(port, '127.0.0.1', function () {
    console.log(`Meridian Proposal Agent is running at http://127.0.0.1:${this.address().port}`);
  });
}
