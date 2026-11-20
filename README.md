# Meridian Proposal Agent

Paste fictional adviser notes and get a draft in the Meridian proposal editor. GPT-6.2 Sol extracts the details. The app checks the figures against the notes and shows the adviser what they still need to decide.

## Run locally

Use Node.js 22 or newer. There are no packages to install.

```sh
node server.mjs
```

Open `http://127.0.0.1:8765`. Choose **Offline samples**, pick a sample and select **Generate draft**. This uses saved results and requires no API key. Try **Incomplete prospect notes** to see which fields stay blank. The voice-note example is a text transcript.

### Live extraction

Create an OpenAI API key and add `OPENAI_API_KEY=your_key_here` to a local `.env` file beside `server.mjs`. Git ignores this file. [Create an API key](https://platform.openai.com/api-keys)

```sh
node --env-file=.env server.mjs
```

Select **Live with OpenAI** and paste fictional notes. Live mode sends the notes to the OpenAI Responses API. The key stays on the server. You can also set `OPENAI_API_KEY` in your environment and start the server without an env file.

The default model is `gpt-6.2-sol`. Set `MERIDIAN_MODEL` to use another Responses API model that supports Structured Outputs and low reasoning effort. Set `PORT` if you need a different local port.

### Windows without a separate Node install

If VS Code is installed at its default per-user location, its bundled runtime can also run the app from PowerShell.

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" server.mjs
```

For live mode on the same runtime, pass `--env-file=.env` before `server.mjs`.

## How it works

1. The browser gets the available portfolio IDs from the editor. The server offers the three portfolios supplied with the challenge.
2. GPT-6.2 Sol returns proposal details and quotes from the notes. The app checks the quotes before it enters figures. A drawdown needs a clear monthly amount in the same currency as the investment.
3. The server checks the draft against the grad pack's schema. The browser opens it with `window.loadProposal(...)`. The adviser can check the notes, proposed choices and defaults alongside the editable draft.

The quote checks confirm that a figure appears in the notes. The adviser still needs to check what it refers to, such as the new investment amount or an existing holding.

## Verification

```sh
node --test agent.test.mjs
```

These tests use the grad examples and a new fictional case. They cover figures, dropdown values, request handling and simulated OpenAI responses. See the [retiree draft](demo/01-retiree-draft.png), [incomplete prospect draft](demo/02-sparse-draft.png) and [investment objective](demo/03-grad-objective.png) for the offline demo.

Live generation needs an OpenAI project with API credits. This check sends a fictional note through the same endpoint the browser uses.

```sh
node --env-file=.env verify-live.mjs
```

## Design decisions and assumptions

I kept the existing editor because the time-consuming step is getting the meeting notes into the proposal. The adviser can review, edit and export the draft in the tool they already use.

- The adviser approves the portfolio. Its allocation, composition and portfolio fees come from the catalog. If its currency conflicts with the notes, the app asks the adviser to choose a portfolio.
- The horizon dropdown uses a minimum. For `3 to 6 years`, it shows `3 years+` and keeps the full range in Goal Assessment. A horizon such as `up to 5 years` goes to review because it gives only an upper limit.
- The app fills a risk category when the notes support one and shows the source phrase. It asks for the mandate if the notes leave it open. A phrase such as “global equity index” prompts the adviser to name the index.

## What I would change with more time

I would test the live model on a separate set of fictional notes covering revised amounts, mixed currencies and one-off fees. I would count correct fields, unsupported figures and unnecessary questions.

In the editor, I would show each source quote next to its field and let the adviser answer a question there. I would give the client's stated horizon and the portfolio's recommended minimum separate fields. I would ask the team how they handle annual drawdowns and when they want the app to suggest a portfolio.

For audio, I would let the adviser correct the transcript before generating a draft. The same review questions could then guide a conversation with the adviser.

The grad pack's specification is in [BRIEF.md](BRIEF.md), [proposal-schema.md](proposal-schema.md) and [schema.json](schema.json).
