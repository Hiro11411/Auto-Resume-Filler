# Apply Autofill

A Chrome extension that fills job applications from your profile.

- **Auto mode (on by default):** when a job application form opens, it fills it with no click. You can turn it off in the toolbar popup or with `Alt+Shift+A`, or pause it on a single site.
- **Manual fill:** use the **Fill this page** button in the popup or press `Alt+Shift+F`.
- **What it fills:** name, contact details, address, links, work history, education, work authorization, sponsorship, and your resume file.
- **What it leaves empty:**
  - Optional screening and self-ID questions (salary, how you heard about the job, EEO), unless the question is required or you turn on *Also answer optional questions*.
  - Free-text questions ("Why do you want to work here?", cover-letter boxes). These are always left for you. With AI enabled, an optional **Draft** button can write a first version.
  - Citizenship, export-control and work-authorization questions you haven't answered in your profile. These are filled only from your saved answers and never guessed, including by AI.
  - Consent checkboxes and anything it doesn't recognize.
- **What it never does:** submit the form, click Next, or overwrite a field that already has a value or that you've edited.
- **After it fills:** a panel shows what was filled, what needs your input, and an **Undo** button.

## Install (unpacked)

```bash
npm install
npm run build
```

1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and pick `.output/chrome-mv3`.
3. The profile page opens from the toolbar popup (**Set up profile**). Upload your resume (PDF or DOCX), review what was extracted, and click **Save profile**.

For development, `npm run dev` opens a Chrome window with the extension loaded and reloading on change.

## Where it runs

Auto mode works out of the box on Greenhouse, Lever, Ashby, Workday, iCIMS and SmartRecruiters. To auto-fill company career sites too, turn on **Auto-fill on any site** in settings; Chrome will ask for access to all sites. Without that, the button and shortcut still work on any page.

## Privacy

- **Local only:** your profile, resume and API key are stored in `chrome.storage.local` in your own Chrome profile. They are never written into this project folder, so nothing you type into the extension can end up in git.
- **Storage is locked to the extension's own pages:** the background worker, popup and options page. The script that runs inside job sites asks the background worker for what it needs, and the API key is removed before anything is sent to a page.
- **No network requests with AI off** (the default). When AI is on, it uses your own Anthropic API key, called only from the background worker. Question text, the page's job description and your profile summary are sent only when you click **Draft**, import a resume, or a required question can't be matched by the rules.
- **Hidden fields are never filled:** a field must be visible, at least a few pixels in size and on the page.

## Layout

| Path | What |
|---|---|
| `entrypoints/` | WXT entrypoints: background worker, content script, popup, options page |
| `src/engine/` | Discover fields → resolve labels → classify → apply the fill policy → fill → overlay |
| `src/engine/policy.ts` | The fill / leave-empty rules |
| `src/engine/dictionary.ts` | Label and attribute rules per field type. Add a rule here when a site's field is missed |
| `src/adapters/` | Per-ATS hints (Greenhouse, Lever, Ashby, Workday) |
| `src/resume/` | PDF/DOCX text extraction and offline resume parsing |
| `src/ai/` | Optional Claude calls (field mapping, drafts, resume structuring) |
| `src/ext/` | Messaging between the background worker, popup and page scripts |
| `tests/fixtures/` | HTML snapshots of application forms used by both test suites |

## Contributing

1. `npm install`, then `npm run dev` (or `npm run build` and load `.output/chrome-mv3` unpacked).
2. When a field on a real site is missed or filled wrong, save a copy of the form's HTML into `tests/fixtures/` (replace any real personal data with made-up values first). Add a test, then fix the rule in `src/engine/dictionary.ts` or the site's file in `src/adapters/`.
3. Run `npm run check` (type-check, unit tests, browser tests) before opening a pull request. CI runs the same checks.

Never commit real resumes, API keys or personal details. Test data uses the made-up "Ada Lovelace" profile in `tests/fixtures/profile.ts`.

## Tests

```bash
npm test          # unit tests (Vitest + jsdom), including a React controlled-input check
npm run test:e2e  # builds, then runs the extension in Chromium against the fixtures (Playwright)
npm run compile   # type-check
```

The end-to-end suite serves the fixtures over HTTPS and maps the real ATS hostnames to the local server (`--host-resolver-rules`), so it exercises the shipped manifest and content-script matches. It needs Playwright's Chromium (`npx playwright install chromium`).
