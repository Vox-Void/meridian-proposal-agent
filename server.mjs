import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { buildProposal, extractWithClaude, modelProfiles } from './agent.mjs';
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
const live = Boolean(process.env.ANTHROPIC_API_KEY);

function json(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function readRequest(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBody) return null;
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    return null;
  }
}

export function makeServer({ extract = extractWithClaude } = {}) {
  return createServer(async (request, response) => {
    const origin = `http://127.0.0.1:${response.socket.localPort}`;
    if (request.headers.host !== new URL(origin).host) {
      return json(response, 403, { error: 'Open the app using its loopback address.' });
    }
    if (request.method === 'GET' && files.has(request.url)) {
      const { body, type } = files.get(request.url);
      response.writeHead(200, { 'content-type': type, 'x-content-type-options': 'nosniff' });
      return response.end(body);
    }
    if (request.method === 'GET' && request.url === '/api/config') {
      return json(response, 200, { live, samples: demos.map(({ id, label, notes }) => ({ id, label, notes })) });
    }
    if (request.method !== 'POST' || request.url !== '/api/proposal') {
      return json(response, 404, { error: 'Route not found.' });
    }
    if (request.headers.origin !== origin || !request.headers['content-type']?.startsWith('application/json')) {
      return json(response, 403, { error: 'Generate drafts from the local app.' });
    }
    const input = await readRequest(request);
    const notes = typeof input?.notes === 'string' ? input.notes.replace(/\r\n/g, '\n').trim() : '';
    if (!notes || notes.length > 12_000 || !Array.isArray(input?.modelIds) || !['sample', 'live'].includes(input?.mode)) {
      return json(response, 400, { error: 'Enter between 1 and 12,000 characters of adviser notes.' });
    }
    const models = Object.entries(modelProfiles)
      .filter(([id]) => input.modelIds.includes(id))
      .map(([id, profile]) => ({ id, profile, portfolioName: {
        balanced: 'Meridian Balanced Portfolio', 'global-growth': 'Meridian Global Growth Portfolio', income: 'Meridian Income Portfolio',
      }[id] }));
    try {
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
      return json(response, 502, { error: error.message || 'Could not generate a draft.' });
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8765);
  makeServer().listen(port, '127.0.0.1', function () {
    console.log(`Meridian Proposal Agent is running at http://127.0.0.1:${this.address().port}`);
  });
}
