# Meridian Proposal Agent · Grad challenge

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
3. The server validates the proposal against the grad pack's schema. It writes key figures into `strategy.keyFigures`, preserves the exact horizon in Goal Assessment, and maps it to a supported category in Investment Objective when possible. It maps supported risk descriptions to a dropdown category and puts a stated target return in the editor's custom field.
4. The generator opens the editable draft. The review panel shows the questions to resolve, excerpts from the notes, the draft portfolio and dropdown choices, and which defaults the tool can supply. When the notes name only a benchmark class, the panel asks for the specific index and the benchmark field stays open.

The extraction handles the core adviser-note fields. A bespoke allocation can be completed in the supplied editor. The code checks that evidence is present and parseable. Semantic questions such as whether an amount refers to the new investment or an existing holding still require adviser review.

## Verification

```sh
node --test agent.test.mjs
```

The tests cover the grad examples, the horizon and risk dropdowns, currency conflicts, ambiguous amounts, fee and drawdown periods, malformed HTTP requests and simulated OpenAI responses. The [retiree draft](demo/01-retiree-draft.png), [incomplete prospect draft](demo/02-sparse-draft.png) and [investment objective](demo/03-grad-objective.png) show the offline flow in the supplied renderer.

The OpenAI request reached the API, which rejected live extraction because the project's credit balance was exhausted. With an active API project, run this check to send one synthetic note through the same HTTP endpoint used by the form.

```sh
node --env-file=.env verify-live.mjs
```

## Design decisions and assumptions

I kept the supplied editor because the expensive step is moving facts out of the meeting notes. Portfolio managers can keep their existing review, editing and export workflow. The notes form, extraction and review panel sit alongside the editor and use its existing import function.

- A portfolio initiated by the agent is a draft choice for the adviser to approve. Its allocation, composition and portfolio fees come from the catalog.
- The horizon dropdown represents a minimum. For a range such as `3 to 6 years`, the editor uses `3 years+` and Goal Assessment retains the full range. An upper-bound-only duration or a minimum below one year goes to review.
- Risk categories are mapped from supported descriptions in the notes. Unclear labels stay open. The review panel shows the source phrase and the proposed category in separate sections.
- A stated benchmark class or an unstated mandate calls for a decision from the adviser. The draft preserves the class as a source excerpt and asks which index to use.

## What I would change with more time

I would start with a held-out set of labelled synthetic notes and run it against the live model. The four supplied examples are regression fixtures. A broader evaluation should measure whether each client figure is supported and mapped correctly, how often the agent leaves an ambiguous field blank, and how often it sends a clear field to review. I would include revised amounts, mixed currencies, one-off fees and client instructions that conflict with a portfolio preset.

The first change I would make to the tool is to attach source and review status directly to each populated field. An adviser could answer a question next to the field, accept a proposed value, or replace it while retaining its source. I would also replace the fixed horizon dropdown with separate fields for the client's stated horizon and the portfolio's recommended minimum, since those represent different decisions. I would ask the team how they want to collect annual drawdowns and when a provisional model is useful.

I would add audio transcription next and keep the transcript editable so the adviser can correct misheard names and numbers before extraction. A conversational workflow could then use the same review questions to fill the draft one decision at a time. The current scope covers typed notes and pasted transcripts.

The grad pack's specification is in [BRIEF.md](BRIEF.md), [proposal-schema.md](proposal-schema.md) and [schema.json](schema.json).
