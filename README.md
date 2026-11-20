# Meridian Proposal Agent

Turn fictional adviser notes into an editable investment proposal. The app extracts details with GPT-6.2 Sol, checks the figures against source excerpts, and opens a draft in the supplied Meridian generator through `window.loadProposal(proposal)`.

## Run locally

Use Node.js 22 or newer. There are no packages to install.

```sh
node server.mjs
```

Open `http://127.0.0.1:8765`. In **Offline sample replay**, choose one of the four supplied samples and select **Generate draft**. This mode uses checked-in extraction fixtures and runs without a provider account. The **Incomplete prospect notes** sample shows how the app handles missing figures. The **Voice-note transcript** sample uses text input.

### Live extraction

Create an API key in the [OpenAI API Platform](https://platform.openai.com/api-keys) and set `OPENAI_API_KEY` in your local environment, then start or restart the server. Your ChatGPT or Codex sign-in does not set this variable for the standalone app. The API key stays on the server.

The app opens in **Live · OpenAI** when the key is present. Paste fictional notes or select a sample, then generate a draft. Live extraction sends the notes to the OpenAI Responses API.

The default model is `gpt-6.2-sol`. The optional `MERIDIAN_MODEL` environment variable accepts another Responses API model that supports Structured Outputs and low reasoning effort. The server uses loopback only, and `PORT` can override the default port.

To use a local environment file, create an untracked `.env` beside `server.mjs`, add `OPENAI_API_KEY=your_key_here`, and start the server with `node --env-file=.env server.mjs`. Keep the key out of Git and screenshots.

### Windows without a separate Node install

If VS Code is installed at its default per-user location, its bundled runtime can also run the app from PowerShell.

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "$env:LOCALAPPDATA\Programs\Microsoft VS Code\Code.exe" server.mjs
```

For live mode on the same runtime, pass `--env-file=.env` before `server.mjs`.

## How it works

1. The browser reads the allowed model IDs from the generator. The server limits selection to the three portfolio profiles described in the challenge.
2. GPT-6.2 Sol returns structured facts, source excerpts and a draft model choice. The app matches excerpts back to the notes and normalizes supported money and fee formats. It requires a grounded investment currency before entering an amount. A drawdown goes to review unless the notes tie the amount to a monthly period in the same currency. The app skips a suggested portfolio when its currency conflicts with the notes.
3. The server maps the extraction to the proposal contract and checks the types of the fields it emits against the supplied JSON schema. It writes key figures into `strategy.keyFigures`, which the editor reads. It copies a stated horizon to both renderer fields and opens a stated target return in the editor's custom field. When the notes omit these values, the proposal leaves them blank.
4. The generator opens the editable draft. The app shows the fields that need confirmation, the source excerpts and the exact proposal JSON. Model allocation, composition and portfolio fees come from the supplied catalog. The adviser reviews model fit and any inherited defaults before using a draft.

The extraction handles the core adviser-note fields. A bespoke allocation can be completed in the supplied editor. The code checks that evidence is present and parseable. Semantic questions such as whether an amount refers to the new investment or an existing holding still require adviser review.

## Verification

```sh
node --test agent.test.mjs
```

The tests cover the supplied cases, currency conflicts, ambiguous amounts, missing fields, fee and drawdown periods, malformed HTTP requests and simulated OpenAI responses. The [retiree draft](demo/01-retiree-draft.png) and [incomplete prospect draft](demo/02-sparse-draft.png) show the offline flow in the supplied renderer. In the second screenshot, the draft leaves the amount and income fields empty and the review list asks for both figures and the horizon.

The OpenAI request reached the API, which rejected live extraction because the project's credit balance was exhausted. With an active API project, run this check to send one synthetic note through the same HTTP endpoint used by the form.

```sh
node --env-file=.env verify-live.mjs
```

## What I would change with more time

I would start with a held-out set of labelled synthetic notes and run it against the live model. The four supplied examples are regression fixtures. A broader evaluation should measure whether each client figure is supported and mapped correctly, how often the agent leaves an ambiguous field blank, and how often it sends a clear field to review. I would include revised amounts, mixed currencies, one-off fees and client instructions that conflict with a portfolio preset.

I would turn each review item into a question the adviser can answer in place, then apply the correction to that field and retain its source. One question I’d ask the team is whether an adviser who gives a mandate but names no model expects a provisional recommendation or wants the model field left blank. I’d also confirm how they want annual drawdowns collected, since the current editor takes a monthly amount.

I would add audio transcription next and keep the transcript editable so the adviser can correct misheard names and numbers before extraction. WhatsApp would follow once we agreed on access and retention for adviser notes. The current scope covers typed notes, including pasted transcripts, and flags ambiguity for review.

The original specification is in [BRIEF.md](BRIEF.md), [proposal-schema.md](proposal-schema.md) and [schema.json](schema.json).
