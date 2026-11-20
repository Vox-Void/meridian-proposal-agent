import assert from 'node:assert/strict';
import { makeServer } from './server.mjs';

const server = makeServer();
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  const config = await (await fetch(`${origin}/api/config`)).json();
  if (!config.live) throw new Error('Set OPENAI_API_KEY before running the live check.');
  const response = await fetch(`${origin}/api/proposal`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    signal: AbortSignal.timeout(55_000),
    body: JSON.stringify({
      mode: 'live',
      modelIds: ['balanced', 'global-growth', 'income'],
      notes: [
        'Client: Mira Example (individual). Invest about R2.5 million.',
        'Investment horizon 8 years. No income needed. Use the Balanced portfolio.',
        'Annual adviser fee 0.65%.',
      ].join(' '),
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  const { proposal } = result;
  assert.equal(proposal.clientName, 'Mira Example');
  assert.equal(proposal.applyModel, 'balanced');
  assert.deepEqual(proposal.strategy.keyFigures, { totalInvestment: '2500000', incomeValue: '0' });
  assert.equal(proposal.goalAssessment.currency, 'ZAR');
  assert.equal(proposal.goalAssessment.investmentHorizon, '8 years');
  assert.equal(proposal.fees.advisorFee, '0.65');
  console.log(`Live extraction passed with ${result.source}.`);
} catch (error) {
  console.error(`Live check failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  server.close();
}
