import { readFileSync } from 'node:fs';

const samples = [
  {
    id: 'income', label: 'Retiree income', file: '01-notes-retiree-income.txt',
    extraction: {
      clientName: 'Mr George Whitfield', audience: 'client', clientType: 'Individual',
      mandate: 'Discretionary', currencyQuote: 'ZAR', model: 'income',
      summary: 'Mr Whitfield has recently retired and wants regular income to supplement his pension. Capital preservation is his priority, with some growth to keep pace with inflation and limited offshore exposure.',
      risk: 'Capital preservation is the priority, with some exposure to growth assets to keep pace with inflation.',
      amountQuote: 'R6.2 million', incomeQuote: 'R28,000', incomeBasis: 'monthly', incomePeriodQuote: 'R28,000 a month',
      horizonQuote: '15+ years', feeQuote: '0.60%',
    },
  },
  {
    id: 'growth', label: 'Offshore growth', file: '02-notes-growth-offshore.txt',
    extraction: {
      clientName: 'The Sithole Family Trust', audience: 'advisor', adviserName: 'Marcus Reid',
      clientType: 'Trust', currencyQuote: 'USD', model: 'global-growth',
      summary: 'The trustees seek long-term capital growth through offshore global equities and plan to reinvest returns for the next generation.',
      risk: 'Aggressive, with a long-term focus on capital growth.',
      limitations: 'Confirm that the selected global model meets the stated pure equity and no local exposure requirements.',
      amountQuote: 'USD 1.2m', incomeQuote: 'no income needed', incomeBasis: 'none',
      horizonQuote: '10-year+', feeQuote: '0.50%', benchmark: 'global equity index',
      replacement: 'yes', replacementDetails: 'The trust is unwinding an existing offshore unit-trust portfolio.',
    },
  },
  {
    id: 'sparse', label: 'Incomplete prospect notes', file: '03-notes-sparse.txt',
    extraction: {
      clientName: 'Mrs Lindiwe Petersen', clientType: 'Individual', currencyQuote: 'rand', model: 'balanced',
      summary: 'Mrs Petersen is a new prospect referred by an existing client. She seeks capital growth while keeping investment risk in check. Her objectives will be discussed further at the next meeting.',
      risk: 'Risk-averse, with an interest in growth. Risk tolerance and model fit are provisional.',
    },
  },
  {
    id: 'transcript', label: 'Voice-note transcript', file: '04-voice-note-transcript.txt',
    extraction: {
      clientName: 'Johannes Coetzee', clientType: 'Individual', currencyQuote: 'rand', model: 'balanced',
      summary: 'The Coetzees wish to invest jointly under Johannes Coetzee. Both are still working and are investing for growth. They want meaningful offshore exposure given concerns about rand depreciation.',
      risk: 'Moderate to aggressive. The clients have prior investment experience and are comfortable with risk.',
      amountQuote: 'four and a half million rand', incomeQuote: 'no income needed for now', incomeBasis: 'none',
      horizonQuote: 'ten\nyears plus', feeQuote: 'zero point seven five', targetQuote: 'CPI plus five',
    },
  },
];

export const demos = samples.map(({ file, ...sample }) => ({
  ...sample,
  notes: readFileSync(new URL(`./sample-inputs/${file}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n').trim(),
}));
