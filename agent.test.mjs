import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { buildProposal, extractWithOpenAI, modelProfiles } from './agent.mjs';
import { normalizedNumber } from './figures.mjs';
import { demos } from './demo.mjs';
import { makeServer } from './server.mjs';

const models = Object.entries(modelProfiles).map(([id, profile]) => ({ id, ...profile }));

test('the supplied samples match the expected client, model and figures', () => {
  for (const [index, { extraction, notes }] of demos.entries()) {
    const { proposal, evidence, draftChoices, defaults, review } = buildProposal(extraction, notes, models);
    const fixture = new URL(`./sample-inputs/0${index + 1}-expected.json`, import.meta.url);
    const expected = JSON.parse(readFileSync(fixture, 'utf8'));
    assert.equal(proposal.clientName, expected.clientName);
    assert.equal(proposal.applyModel, expected.applyModel);
    assert.equal(proposal.goalAssessment.currency, expected.goalAssessment.currency);
    assert.equal(proposal.strategy.keyFigures.totalInvestment, expected.strategy?.keyFigures?.totalInvestment);
    if (expected.strategy?.keyFigures?.incomeValue) {
      assert.equal(proposal.strategy.keyFigures.incomeValue, expected.strategy.keyFigures.incomeValue);
    }
    assert.equal(proposal.objective.investmentHorizon, expected.objective.investmentHorizon);
    assert.equal(proposal.objective.riskProfileCategory, expected.objective.riskProfileCategory);
    assert.equal(draftChoices['Editor horizon'], expected.objective.investmentHorizon);
    assert.equal(draftChoices['Editor risk category'], expected.objective.riskProfileCategory);
    assert.equal(draftChoices['Draft model'], modelProfiles[expected.applyModel].portfolioName);
    assert.match(defaults[0], /allocation, composition/);
    assert.equal(proposal.fees?.advisorFee, expected.fees?.advisorFee);
    assert.equal(proposal.status, 'draft');
    if (index === 1) {
      assert.equal(proposal.financialPlanner, 'Marcus Reid');
      assert.equal(proposal.introGreetTo, 'advisor');
      assert.equal(proposal.replacements.isReplacement, true);
      assert.equal(proposal.objective.benchmark, '');
      assert.equal(evidence.Benchmark, 'global equity index');
      assert.equal(proposal.goalAssessment.mandateType, undefined);
      assert.match(review.join(' '), /Confirm the mandate type.*Which index/);
      assert.equal(proposal.strategy.keyFigures.incomeValue, '0');
    }
    if (index === 2) {
      assert.equal(proposal.objective.investmentHorizon, undefined);
      assert.equal(proposal.goalAssessment.investmentHorizon, '');
      assert.equal(proposal.objective.targetReturn, '');
      assert.ok(review.some((item) => item.includes('investment amount')));
      assert.ok(review.some((item) => item.includes('monthly amount')));
      assert.ok(review.some((item) => item.includes('investment horizon')));
    }
    if (index === 3) {
      assert.equal(proposal.objective.targetReturn, expected.objective.targetReturn);
      assert.equal(proposal.objective.targetReturnKey, '__custom__');
    }
  }
});

test('drops unsupported quotes, vague amounts and annual income from monthly fields', () => {
  const notes = 'A few million rand, maybe. Income of R96,000 a year. The adviser sends monthly statements. Still deciding the horizon.';
  const { proposal, review } = buildProposal({
    amountQuote: 'few million rand', currencyQuote: 'rand', incomeQuote: 'R96,000',
    incomeBasis: 'monthly', incomePeriodQuote: 'monthly statements', horizonQuote: '10 years', feeQuote: '0.7%',
  }, notes, models);
  assert.deepEqual(proposal.strategy.keyFigures, {});
  assert.equal(proposal.objective.investmentHorizon, undefined);
  assert.equal(proposal.fees, undefined);
  assert.ok(review.some((item) => item.includes('monthly drawdown')));
});

test('normalizes written numbers and preserves decimal precision', () => {
  for (const [source, expected] of Object.entries({
    'R6.2 million': '6200000', 'USD 1.2m': '1200000', 'R28,000': '28000',
    '10 000.42': '10000.42', 'four and a half million rand': '4500000',
    '0.0000007 million': '0.7', '0.00001m': '10', 'zero point seven five': '0.75',
    'two hundred and fifty thousand': '250000', 'one point two million rand': '1200000',
    'two million one hundred thousand and ten': '2100010', 'a few million': '', 'R5m-R6m': '',
    'one two thousand': '', 'five thousand two million': '', 'twenty zero': '', 'and': '',
  })) assert.equal(normalizedNumber(source), expected, source);
  assert.equal(normalizedNumber('R1', true), '');
  assert.equal(normalizedNumber('zero percent', true), '0');
});

test('rejects partial investment amounts and endpoints of a range', () => {
  const notes = 'ZAR. They may invest R6.2 million, between R200k and R300k, or R5m\u2013R6m. Existing balance −R800. Indicative R1 234.';
  for (const amountQuote of ['R6', 'R6.2', '2 million', 'R5m', 'R6m', 'R200k', 'R300k', 'R800', 'R1', '234']) {
    const draft = buildProposal({ amountQuote, currencyQuote: 'ZAR' }, notes, models);
    assert.equal(draft.proposal.strategy.keyFigures.totalInvestment, undefined, amountQuote);
  }
  assert.equal(buildProposal({ amountQuote: 'R1 234' }, notes, models).proposal.strategy.keyFigures.totalInvestment, '1234');
});

test('keeps a confirmed investment and flags conflicting currencies', () => {
  const notes = 'Invest USD 1.2m. Monthly drawdown of R25,000. Consider Meridian Balanced Portfolio.';
  const { proposal, review } = buildProposal({
    amountQuote: 'USD 1.2m', incomeQuote: 'R25,000', incomeBasis: 'monthly',
    incomePeriodQuote: 'Monthly drawdown of R25,000', model: 'balanced',
  }, notes, models);
  assert.equal(proposal.strategy.currency, 'USD');
  assert.deepEqual(proposal.strategy.keyFigures, { totalInvestment: '1200000' });
  assert.equal(proposal.applyModel, undefined);
  assert.match(review.join(' '), /drawdown and its currency.*uses ZAR/);
  const conflict = buildProposal({ amountQuote: 'USD 1.2m', currencyQuote: 'R25,000', model: 'balanced' }, notes, models);
  assert.deepEqual(conflict.proposal.strategy, { keyFigures: {} });
  assert.equal(conflict.proposal.applyModel, undefined);
  assert.match(conflict.review.join(' '), /conflicting investment currencies/);
});

test('accepts an attached monthly amount, explicit range horizon and zero adviser fee', () => {
  const notes = 'Invest GBP 60,000. Monthly income of £400. Horizon 8 to 10 years. Adviser fee zero percent.';
  const { proposal } = buildProposal({
    amountQuote: 'GBP 60,000', incomeQuote: '£400', incomeBasis: 'monthly', incomePeriodQuote: 'Monthly income of £400',
    horizonQuote: '8 to 10 years', feeQuote: 'zero percent',
  }, notes, models);
  assert.deepEqual(proposal.strategy.keyFigures, { totalInvestment: '60000', incomeValue: '400' });
  assert.equal(proposal.goalAssessment.investmentHorizon, '8 to 10 years');
  assert.equal(proposal.objective.investmentHorizon, '5 years+');
  assert.equal(proposal.fees.advisorFee, '0');
});

test('omits an ambiguous currency, a qualitative horizon and unsupported narrative numbers', () => {
  const notes = 'Invest $500,000. Horizon still open. An equity index as benchmark.';
  const { proposal, review } = buildProposal({
    amountQuote: '$500,000', horizonQuote: 'still open', targetQuote: 'equity index', benchmark: 'MSCI World',
    summary: 'The client requires 10% a year.',
  }, notes, models);
  assert.deepEqual(proposal.strategy, { keyFigures: {} });
  assert.equal(proposal.objective.investmentHorizon, undefined);
  assert.equal(proposal.objective.targetReturn, '');
  assert.equal(proposal.objective.benchmark, '');
  assert.equal(proposal.introduction, undefined);
  assert.match(review.join(' '), /currency.*horizon.*target return.*benchmark.*client summary/);
});

test('maps the lower bound of a horizon range and treats an upper bound as unresolved', () => {
  for (const [horizonQuote, category] of [
    ['18 months', '1 year+'], ['3 to 6 years', '3 years+'], ['six months', undefined],
    ['up to 5 years', undefined],
  ]) {
    const { proposal } = buildProposal({ horizonQuote }, `The time horizon is ${horizonQuote}.`, models);
    assert.equal(proposal.goalAssessment.investmentHorizon, horizonQuote);
    assert.equal(proposal.objective.investmentHorizon, category);
  }
  const upperBound = buildProposal({ horizonQuote: '5 years' }, 'The horizon is up to 5 years.', models);
  assert.equal(upperBound.proposal.objective.investmentHorizon, undefined);
});

test('keeps a named benchmark when risk and mandate are uncertain', () => {
  const notes = 'They do not want an aggressive portfolio. Maybe Discretionary. Benchmark against the MSCI World Index.';
  const { proposal, review } = buildProposal({
    riskQuote: 'aggressive', mandateQuote: 'Discretionary', benchmark: 'MSCI World Index',
  }, notes, models);
  assert.equal(proposal.objective.riskProfileCategory, undefined);
  assert.equal(proposal.goalAssessment.mandateType, undefined);
  assert.equal(proposal.objective.benchmark, 'MSCI World Index');
  assert.match(review.join(' '), /risk category.*mandate type/);
});

test('leaves the annual adviser fee blank for other types of charge', () => {
  for (const [notes, feeQuote] of [
    ['Adviser fee 75 bps.', '75'],
    ['Adviser fee 0.75% per month.', '0.75%'],
    ['One-off adviser fee 0.75%.', '0.75%'],
    ['Monthly adviser fee 0.75%.', '0.75%'],
  ]) {
    const { proposal, review } = buildProposal({ feeQuote }, notes, models);
    assert.equal(proposal.fees, undefined, notes);
    assert.match(review.join(' '), /annual adviser fee/);
  }
});

test('separates an unconfirmed income figure from an explicit zero requirement', () => {
  const missing = buildProposal({ incomeBasis: 'none', incomeQuote: 'no income' }, 'There was no income figure given.', models);
  assert.equal(missing.proposal.strategy.keyFigures.incomeValue, undefined);
  assert.match(missing.review.join(' '), /Confirm the monthly drawdown/);
  const none = buildProposal({ incomeBasis: 'none', incomeQuote: 'no income is required' }, 'They confirmed no income is required.', models);
  assert.equal(none.proposal.strategy.keyFigures.incomeValue, '0');
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
  let extraction;
  const simulated = {
    status: 'completed', model: 'gpt-6.2-sol',
    output: [
      { type: 'reasoning', summary: [] },
      { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '' }] },
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
    extraction = Object.fromEntries(format.schema.required.map((field) => [field, fixture.extraction[field] ?? '']));
    if (simulated.output[1].content[0].text === '') simulated.output[1].content[0].text = JSON.stringify(extraction);
    return new Response(JSON.stringify(simulated));
  });
  const result = await extractWithOpenAI(fixture.notes, models);
  assert.deepEqual(result, { extraction, model: simulated.model });
  assert.equal(provider.mock.callCount(), 1);
  simulated.status = 'incomplete';
  await assert.rejects(extractWithOpenAI(fixture.notes, models), /complete draft/);
  simulated.status = 'completed';
  simulated.output[1].content = [{ type: 'refusal', refusal: 'Simulated refusal' }];
  await assert.rejects(extractWithOpenAI(fixture.notes, models), /declined/);
  simulated.output[1].content = [{ type: 'output_text', text: '{}' }];
  await assert.rejects(extractWithOpenAI(fixture.notes, models), /invalid extraction/);
  provider.mock.mockImplementation(async () => Response.json({
    error: { type: 'insufficient_quota', code: 'credit_balance_exhausted', message: 'Never echo provider details' },
  }, { status: 429 }));
  await assert.rejects(extractWithOpenAI(fixture.notes, models), { message: /out of API quota or credits/, status: 503 });
  provider.mock.mockImplementation(async () => new Response('', { status: 429 }));
  await assert.rejects(extractWithOpenAI(fixture.notes, models), { message: /rate-limiting/, status: 429 });
});

test('the proposal endpoint builds a draft from new notes and keeps offline replay limited to the samples', async (context) => {
  const newNotes = [
    'Avery Vale wants to invest GBP 325,000. Monthly income of £850.',
    'Horizon 36\u201460 months. Risk tolerance is moderately conservative.',
    'Self-directed. Benchmark against the FTSE 100 Index. Annual adviser fee 0.55%.',
  ].join(' ');
  const server = makeServer({
    extract: async (notes, available) => {
      assert.equal(notes, newNotes);
      assert.deepEqual(available.map(({ id }) => id), ['balanced']);
      return {
        extraction: {
          clientName: 'Avery Vale',
          amountQuote: 'GBP 325,000',
          incomeQuote: '£850',
          incomeBasis: 'monthly',
          incomePeriodQuote: 'Monthly income of £850',
          horizonQuote: '36\u201460 months',
          riskQuote: 'moderately conservative',
          mandateQuote: 'Self-directed',
          benchmark: 'FTSE 100 Index',
          feeQuote: '0.55%',
        },
        model: 'Simulated OpenAI',
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
  const live = await request({ mode: 'live', notes: newNotes });
  assert.equal(live.status, 200);
  const result = await live.json();
  assert.equal(result.proposal.clientName, 'Avery Vale');
  assert.equal(result.proposal.strategy.currency, 'GBP');
  assert.deepEqual(result.proposal.strategy.keyFigures, { totalInvestment: '325000', incomeValue: '850' });
  assert.equal(result.proposal.goalAssessment.investmentHorizon, '36\u201460 months');
  assert.equal(result.proposal.goalAssessment.mandateType, 'Self-directed');
  assert.equal(result.proposal.objective.investmentHorizon, '3 years+');
  assert.equal(result.proposal.objective.riskProfileCategory, 'Moderately Conservative');
  assert.equal(result.proposal.objective.benchmark, 'FTSE 100 Index');
  assert.equal(result.proposal.fees.advisorFee, '0.55');
  assert.equal(result.proposal.applyModel, undefined);
  assert.equal(result.source, 'Simulated OpenAI');
  const replay = await request({ mode: 'sample', sampleId: 'income', notes: demos[0].notes });
  assert.equal(replay.status, 200);
  assert.equal((await replay.json()).proposal.applyModel, undefined);
  const modified = await request({ mode: 'sample', sampleId: 'income', notes: `${demos[0].notes} edit` });
  assert.equal(modified.status, 400);
  assert.equal((await request({ mode: 'live', notes: 'Synthetic notes.' }, 'https://example.com')).status, 403);
  assert.equal((await request({ mode: 'unknown', notes: 'Synthetic notes.' })).status, 400);
  assert.equal((await request({ mode: 'live', notes: 'x'.repeat(12_001) })).status, 400);
  assert.equal((await request({ mode: 'live', notes: 'x'.repeat(160_001) })).status, 413);
  assert.equal((await fetch(`${origin}/.env`)).status, 404);
});
