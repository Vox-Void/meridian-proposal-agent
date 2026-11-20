import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildProposal, extractWithOpenAI, modelProfiles, normalizedNumber } from './agent.mjs';
import { demos } from './demo.mjs';
import { makeServer } from './server.mjs';

const models = Object.keys(modelProfiles).map((id) => ({ id, label: id }));

test('all provided samples carry the expected client, model, currency and grounded figures', () => {
  for (const [index, { extraction, notes }] of demos.entries()) {
    const { proposal, review } = buildProposal(extraction, notes, models);
    const fixture = new URL(`./sample-inputs/0${index + 1}-expected.json`, import.meta.url);
    const expected = JSON.parse(readFileSync(fixture, 'utf8'));
    assert.equal(proposal.clientName, expected.clientName);
    assert.equal(proposal.applyModel, expected.applyModel);
    assert.equal(proposal.goalAssessment.currency, expected.goalAssessment.currency);
    assert.equal(proposal.strategy.keyFigures.totalInvestment, expected.goalAssessment.keyFigures?.totalInvestment);
    if (expected.goalAssessment.keyFigures?.incomeValue) {
      assert.equal(proposal.strategy.keyFigures.incomeValue, expected.goalAssessment.keyFigures.incomeValue);
    }
    assert.equal(proposal.fees?.advisorFee, expected.fees?.advisorFee);
    assert.equal(proposal.status, 'draft');
    if (index === 1) {
      assert.equal(proposal.financialPlanner, 'Marcus Reid');
      assert.equal(proposal.introGreetTo, 'advisor');
      assert.equal(proposal.replacements.isReplacement, true);
      assert.equal(proposal.objective.benchmark, 'Global equity index');
      assert.equal(proposal.strategy.keyFigures.incomeValue, '0');
    }
    if (index === 2) {
      assert.equal(proposal.objective.investmentHorizon, '');
      assert.equal(proposal.goalAssessment.investmentHorizon, '');
      assert.equal(proposal.objective.targetReturn, '');
      assert.ok(review.some((item) => item.includes('investment amount')));
      assert.ok(review.some((item) => item.includes('monthly amount')));
      assert.ok(review.some((item) => item.includes('investment horizon')));
    }
  }
});

test('drops unsupported quotes, vague amounts and annual income from monthly fields', () => {
  const notes = 'A few million rand, maybe. Income of R96,000 a year. Still deciding the horizon.';
  const { proposal, review } = buildProposal({
    amountQuote: 'few million rand', incomeQuote: 'R96,000', incomeBasis: 'annual',
    incomePeriodQuote: 'a year', horizonQuote: '10 years', feeQuote: '0.7%',
  }, notes, models);
  assert.deepEqual(proposal.strategy.keyFigures, {});
  assert.equal(proposal.objective.investmentHorizon, '');
  assert.equal(proposal.fees, undefined);
  assert.ok(review.some((item) => item.includes('monthly drawdown')));
});

test('normalizes written numbers and preserves decimal precision', () => {
  for (const [source, expected] of Object.entries({
    'R6.2 million': '6200000', 'USD 1.2m': '1200000', 'R28,000': '28000',
    '10 000.42': '10000.42', 'four and a half million rand': '4500000',
    '0.0000007 million': '0.7', '0.00001m': '10', 'zero point seven five': '0.75',
    'two hundred and fifty thousand': '250000', 'a few million': '', 'R5m–R6m': '',
  })) assert.equal(normalizedNumber(source), expected, source);
});

test('rejects partial investment amounts and endpoints of a range', () => {
  const notes = 'They may invest R6.2 million. Another possibility is R5m–R6m.';
  for (const amountQuote of ['R6', 'R6.2', '2 million', 'R5m', 'R6m']) {
    assert.equal(buildProposal({ amountQuote }, notes, models).proposal.strategy.keyFigures.totalInvestment, undefined);
  }
});

test('OpenAI adapter sends the current model list and consumes the structured response', async (context) => {
  const previous = { key: process.env.OPENAI_API_KEY, model: process.env.MERIDIAN_MODEL };
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.MERIDIAN_MODEL;
  context.after(() => {
    if (previous.key === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previous.key;
    if (previous.model !== undefined) process.env.MERIDIAN_MODEL = previous.model;
  });
  const fixture = demos[0];
  const simulated = {
    status: 'completed', model: 'gpt-6.2-sol',
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: JSON.stringify(fixture.extraction) }] },
    ],
  };
  const provider = context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.authorization, 'Bearer test-key');
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-6.2-sol');
    assert.equal(body.store, false);
    assert.equal(body.input[0].role, 'developer');
    assert.equal(JSON.parse(body.input[1].content).adviserNotes, fixture.notes);
    const format = body.text.format;
    assert.equal(format.type, 'json_schema');
    assert.equal(format.strict, true);
    assert.equal(format.schema.additionalProperties, false);
    assert.deepEqual(format.schema.properties.model.enum, ['', 'balanced', 'global-growth', 'income']);
    return new Response(JSON.stringify(simulated));
  });
  assert.deepEqual(await extractWithOpenAI(fixture.notes, models), { extraction: fixture.extraction, model: simulated.model });
  assert.equal(provider.mock.callCount(), 1);
  simulated.status = 'incomplete';
  await assert.rejects(extractWithOpenAI(fixture.notes, models), /complete draft/);
  simulated.status = 'completed';
  simulated.output[1].content = [{ type: 'refusal', refusal: 'Simulated refusal' }];
  await assert.rejects(extractWithOpenAI(fixture.notes, models), /declined/);
});

test('HTTP workflow accepts new notes in live mode and rejects a modified offline sample', async (context) => {
  const server = makeServer({
    extract: async (notes, available) => {
      assert.deepEqual(available.map(({ id }) => id), ['balanced']);
      return {
        extraction: { clientName: 'Alex Demo', currency: 'GBP', amountQuote: '£25,000', horizonQuote: '8 years' },
        model: 'test-provider',
      };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  function request(payload, requestOrigin = origin) {
    return fetch(`${origin}/api/proposal`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: requestOrigin },
      body: JSON.stringify({ modelIds: ['balanced', 'unavailable-model'], ...payload }),
    });
  }
  const live = await request({ mode: 'live', notes: 'Alex Demo has £25,000 to invest over 8 years.' });
  assert.equal(live.status, 200);
  const result = await live.json();
  assert.equal(result.proposal.strategy.keyFigures.totalInvestment, '25000');
  assert.equal(result.proposal.applyModel, undefined);
  assert.equal(result.source, 'test-provider');
  const replay = await request({ mode: 'sample', sampleId: 'income', notes: demos[0].notes });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).proposal.applyModel, undefined);
  const modified = await request({ mode: 'sample', sampleId: 'income', notes: `${demos[0].notes} edit` });
  assert.equal(modified.status, 400);
  assert.equal((await request({ mode: 'live', notes: 'Synthetic notes.' }, 'https://example.com')).status, 403);
});
