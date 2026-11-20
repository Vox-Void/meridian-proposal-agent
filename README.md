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

## How it works

1. The browser reads the allowed model IDs from the generator. The server limits selection to the three portfolio profiles described in the challenge.
2. GPT-6.2 Sol returns a structured extraction containing facts, exact excerpts for key figures, and a draft model choice. The app checks that the excerpts occur in the notes and normalizes supported money and fee formats. An annual or unspecified drawdown goes to the review list because the generator's amount field is monthly.
3. The server maps the extraction to the proposal contract and checks the fields it emits against the supplied JSON schema. It writes key figures into `strategy.keyFigures`, which the editor reads. It writes the confirmed horizon into both renderer fields and clears client horizon and target return when they are absent, even if the model has defaults.
4. The generator opens the editable draft. The app shows the fields that need confirmation, the source excerpts and the exact proposal JSON. Model allocation, composition and portfolio fees come from the supplied catalog. The adviser reviews model fit and any inherited defaults before using a draft.

The extraction handles the core adviser-note fields. A bespoke allocation can be completed in the supplied editor. The code checks that evidence is present and parseable. Semantic questions such as whether an amount refers to the new investment or an existing holding still require adviser review.

## Verification

```sh
node --test agent.test.mjs
```

The tests cover the supplied cases, field mapping, missing and ungrounded figures, annual drawdown handling, the OpenAI request and response shape with a simulated provider, and the local HTTP API. See [the demo screenshots](demo/) for the offline sample flow in the actual generator.

## With more time

I would first evaluate extraction against more synthetic notes with conflicting amounts, multiple currencies and revised instructions. I would add explicit confirm-or-correct controls for each unresolved field, then run the same validation pipeline on transcribed audio. I would preserve source excerpts through any edits so the adviser can trace where each confirmed value came from.

The original specification is in [BRIEF.md](BRIEF.md), [proposal-schema.md](proposal-schema.md) and [schema.json](schema.json).
