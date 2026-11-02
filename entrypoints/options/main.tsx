import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { structureResume } from '../../src/ai/client';
import { AI_ORIGIN } from '../../src/ext/hosts';
import { extractResume } from '../../src/resume/extract';
import { fromAi, mergeExtracted } from '../../src/resume/merge';
import { fileToDataUrl, resumeToText } from '../../src/resume/parse';
import { emptyJob, emptySchool, type Files, type Job, type Profile, type Settings } from '../../src/profile/schema';
import { loadFiles, loadProfile, loadSettings, saveFiles, saveProfile, saveSettings } from '../../src/profile/storage';
import { Switch } from '../../src/ui/Switch';
import { Area, Choice, DECLINE, Section, SettingRow, setIn, Text, YES_NO, type Path } from './fields';
import '../../src/ui/base.css';
import './options.css';

function Options() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [files, setFiles] = useState<Files>({});
  const [dirty, setDirty] = useState(false);
  const [status, setStatus] = useState('');
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void Promise.all([loadProfile(), loadSettings(), loadFiles()]).then(([p, s, f]) => {
      setProfile(p);
      setSettings(s);
      setFiles(f);
    });
  }, []);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (!profile || !settings) return null;

  const change = (path: Path, v: unknown) => {
    setProfile((p) => setIn(p!, path, v));
    setDirty(true);
  };
  const bind = { profile, onChange: change };

  const save = async () => {
    await saveProfile(profile);
    setDirty(false);
    setStatus('Saved.');
    setTimeout(() => setStatus(''), 2500);
  };

  const updateSettings = async (patch: Partial<Settings>) => setSettings(await saveSettings(patch));

  const importResume = async (file: File) => {
    setImporting(true);
    setStatus('Reading resume…');
    try {
      const dataUrl = await fileToDataUrl(file);
      const nextFiles = { ...files, resume: { name: file.name, type: file.type || 'application/pdf', dataUrl } };
      await saveFiles(nextFiles);
      setFiles(nextFiles);

      const text = await resumeToText(file);
      let extracted = extractResume(text);
      if (settings.ai.enabled && settings.ai.apiKey) {
        setStatus('Structuring resume with AI…');
        try {
          extracted = fromAi(await structureResume(settings, text)) ?? extracted;
        } catch (e) {
          setStatus(`AI extraction failed (${(e as Error).message}); used offline extraction.`);
        }
      }
      const { profile: merged, count } = mergeExtracted(profile, extracted);
      setProfile(merged);
      setDirty(true);
      setStatus(
        count
          ? `Found ${count} details in ${file.name}. Review them below, then Save. Fields you had already filled were kept.`
          : `Stored ${file.name} for uploads. Nothing new to extract; fill the fields below.`,
      );
    } catch (e) {
      setStatus(`Couldn't read that file: ${(e as Error).message}`);
    } finally {
      setImporting(false);
    }
  };

  const storeCoverLetter = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    const next = { ...files, coverLetter: { name: file.name, type: file.type || 'application/pdf', dataUrl } };
    await saveFiles(next);
    setFiles(next);
  };

  const removeFile = async (which: keyof Files) => {
    const next = { ...files };
    delete next[which];
    await saveFiles(next);
    setFiles(next);
  };

  const toggleAnySite = async (on: boolean) => {
    if (on) {
      const ok = await chrome.permissions.request({ origins: ['<all_urls>'] });
      if (!ok) return;
    }
    await updateSettings({ anySite: on });
  };

  const toggleAi = async (on: boolean) => {
    if (on) {
      const ok = await chrome.permissions.request({ origins: [`${AI_ORIGIN}/*`] });
      if (!ok) return;
    }
    await updateSettings({ ai: { ...settings.ai, enabled: on } });
  };

  const updateJob = (i: number, patch: Partial<Job>) => change(['work', i], { ...profile.work[i], ...patch });

  return (
    <main>
      <header class="top">
        <div>
          <h1>Apply Autofill</h1>
          <p class="muted">Your details stay on this computer. Nothing is sent anywhere unless you turn on AI below.</p>
        </div>
      </header>

      <section class="resume">
        <h2>Resume</h2>
        <p class="muted desc">Upload a PDF or DOCX. It's attached to applications automatically, and its details pre-fill this page.</p>
        <div class="filerow">
          <label class="button primary">
            {files.resume ? 'Replace resume' : 'Upload resume'}
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              disabled={importing}
              onChange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) void importResume(f);
                (e.currentTarget as HTMLInputElement).value = '';
              }}
            />
          </label>
          {files.resume && (
            <span>
              {files.resume.name}{' '}
              <button class="link" onClick={() => void removeFile('resume')}>
                Remove
              </button>
            </span>
          )}
        </div>
        <div class="filerow">
          <label class="button">
            {files.coverLetter ? 'Replace cover letter' : 'Add cover letter (optional)'}
            <input
              type="file"
              accept=".pdf,.docx"
              onChange={(e) => {
                const f = (e.currentTarget as HTMLInputElement).files?.[0];
                if (f) void storeCoverLetter(f);
              }}
            />
          </label>
          {files.coverLetter && (
            <span>
              {files.coverLetter.name}{' '}
              <button class="link" onClick={() => void removeFile('coverLetter')}>
                Remove
              </button>
            </span>
          )}
        </div>
      </section>

      <Section title="Personal">
        <Text label="First name" path={['firstName']} {...bind} />
        <Text label="Middle name" path={['middleName']} {...bind} />
        <Text label="Last name" path={['lastName']} {...bind} />
        <Text label="Preferred name" path={['preferredName']} {...bind} />
        <Text label="Email" type="email" path={['email']} {...bind} />
        <Text label="Phone" type="tel" path={['phone']} {...bind} placeholder="(555) 123-4567" />
        <Text label="Phone country code" path={['phoneCountryCode']} {...bind} placeholder="+1" />
      </Section>

      <Section title="Address">
        <Text label="Street address" path={['address', 'street']} {...bind} wide />
        <Text label="Apt, suite, unit" path={['address', 'street2']} {...bind} />
        <Text label="City" path={['address', 'city']} {...bind} />
        <Text label="State / province" path={['address', 'state']} {...bind} />
        <Text label="ZIP / postal code" path={['address', 'postalCode']} {...bind} />
        <Text label="Country" path={['address', 'country']} {...bind} placeholder="United States" />
      </Section>

      <Section title="Links">
        <Text label="LinkedIn" type="url" path={['links', 'linkedin']} {...bind} />
        <Text label="GitHub" type="url" path={['links', 'github']} {...bind} />
        <Text label="Portfolio / website" type="url" path={['links', 'portfolio']} {...bind} />
        <Text label="Other link" type="url" path={['links', 'other']} {...bind} />
      </Section>

      <section>
        <h2>Work experience</h2>
        <p class="muted desc">Most recent first. The first entry is used for "current company" questions.</p>
        {profile.work.map((j, i) => (
          <div class="entry">
            <div class="grid">
              <Text label="Company" path={['work', i, 'company']} {...bind} />
              <Text label="Title" path={['work', i, 'title']} {...bind} />
              <Text label="Location" path={['work', i, 'location']} {...bind} />
              <Text label="Start" type="month" path={['work', i, 'start']} {...bind} />
              {!j.current && <Text label="End" type="month" path={['work', i, 'end']} {...bind} />}
              <div class="field check">
                <label>
                  <input type="checkbox" checked={j.current} onChange={(e) => updateJob(i, { current: (e.currentTarget as HTMLInputElement).checked, end: '' })} /> I currently work here
                </label>
              </div>
              <Area label="Description" path={['work', i, 'description']} {...bind} />
            </div>
            <button class="link danger" onClick={() => change(['work'], profile.work.filter((_, n) => n !== i))}>
              Remove this job
            </button>
          </div>
        ))}
        <button onClick={() => change(['work'], [...profile.work, emptyJob()])}>+ Add job</button>
      </section>

      <section>
        <h2>Education</h2>
        {profile.education.map((s, i) => (
          <div class="entry">
            <div class="grid">
              <Text label="School" path={['education', i, 'school']} {...bind} />
              <Text label="Degree" path={['education', i, 'degree']} {...bind} placeholder="Bachelor of Science" />
              <Text label="Major / field of study" path={['education', i, 'major']} {...bind} />
              <Text label="Minor" path={['education', i, 'minor']} {...bind} />
              <Text label="GPA" path={['education', i, 'gpa']} {...bind} />
              <Text label="Start" type="month" path={['education', i, 'start']} {...bind} />
              <Text label="End / graduation" type="month" path={['education', i, 'end']} {...bind} />
            </div>
            <button class="link danger" onClick={() => change(['education'], profile.education.filter((_, n) => n !== i))}>
              Remove {s.school || 'this school'}
            </button>
          </div>
        ))}
        <button onClick={() => change(['education'], [...profile.education, emptySchool()])}>+ Add school</button>
      </section>

      <Section title="Skills">
        <Area label="Skills" path={['skills']} {...bind} hint="Comma-separated." />
        <Text label="Languages" path={['languages']} {...bind} />
        <Text label="Certifications" path={['certifications']} {...bind} />
      </Section>

      <Section title="Work eligibility" desc="Filled whenever a form asks.">
        <Choice label="Authorized to work in the job's country?" path={['facts', 'workAuthorized']} options={YES_NO} {...bind} />
        <Choice label="Need visa sponsorship now or later?" path={['facts', 'needsSponsorship']} options={YES_NO} {...bind} />
        <Choice label="At least 18 years old?" path={['facts', 'over18']} options={YES_NO} {...bind} />
      </Section>

      <Section
        title="Citizenship and export control"
        desc="These are legal answers. They're filled only from what you set here and are never guessed, including by AI. Leave one as “Not set” and that question stays empty and is flagged for you."
      >
        <Choice
          label="U.S. citizen, green card holder, asylee, refugee, or 1986-program temporary resident?"
          path={['facts', 'usPerson']}
          options={YES_NO}
          {...bind}
        />
        <Choice
          label="National, citizen or permanent resident of Cuba, Iran, North Korea, Sudan, Syria or Crimea?"
          path={['facts', 'sanctionedCountry']}
          options={YES_NO}
          {...bind}
        />
        <Choice
          label="Tick export-control acknowledgments (“I have read and understand…”)?"
          path={['facts', 'exportControlAck']}
          options={YES_NO}
          {...bind}
        />
      </Section>

      <Section
        title="Screening answers"
        desc="Used only when the question is marked required, or when “Also answer optional questions” is on. Otherwise optional questions stay empty."
      >
        <Choice label="Willing to relocate?" path={['facts', 'willingToRelocate']} options={YES_NO} {...bind} />
        <Text label="Earliest start date" type="date" path={['facts', 'startDate']} {...bind} />
        <Text label="Desired salary" path={['facts', 'desiredSalary']} {...bind} placeholder="e.g. 120000" />
        <Text label="Notice period" path={['facts', 'noticePeriod']} {...bind} placeholder="2 weeks" />
        <Text label="How you heard about jobs" path={['facts', 'referralSource']} {...bind} placeholder="LinkedIn" />
        <Text label="Pronouns" path={['pronouns']} {...bind} />
      </Section>

      <Section
        title="Voluntary self-identification"
        desc={`Same rule as screening answers. Leave blank to always answer these yourself, or enter “${DECLINE}”.`}
      >
        <Text label="Gender" path={['facts', 'gender']} {...bind} />
        <Text label="Race / ethnicity" path={['facts', 'race']} {...bind} />
        <Choice label="Hispanic or Latino?" path={['facts', 'hispanic']} options={YES_NO} {...bind} />
        <Text label="Veteran status" path={['facts', 'veteran']} {...bind} placeholder="I am not a protected veteran" />
        <Text label="Disability status" path={['facts', 'disability']} {...bind} placeholder="No, I do not have a disability" />
      </Section>

      <section>
        <h2>Settings</h2>
        <div class="settings">
          <SettingRow title="Auto-fill" desc="Fill application forms as soon as they open. You can also flip this from the toolbar popup or with Alt+Shift+A.">
            <Switch label="Auto-fill" checked={settings.autoMode} onChange={(v) => void updateSettings({ autoMode: v })} />
          </SettingRow>
          <SettingRow
            title="Auto-fill on any site"
            desc="Out of the box, auto-fill runs on Greenhouse, Lever, Ashby, Workday, iCIMS and SmartRecruiters. Turn this on to auto-fill company career sites too (Chrome will ask for access to all sites)."
          >
            <Switch label="Auto-fill on any site" checked={settings.anySite} onChange={(v) => void toggleAnySite(v)} />
          </SettingRow>
          <SettingRow title="Keep filling later steps" desc="On multi-page applications, fill each new page as it appears. Never clicks Next or Submit.">
            <Switch label="Keep filling later steps" checked={settings.autoContinue} onChange={(v) => void updateSettings({ autoContinue: v })} />
          </SettingRow>
          <SettingRow title="Also answer optional questions" desc="Off: optional screening and self-ID questions stay empty. Free-text questions always stay empty.">
            <Switch label="Also answer optional questions" checked={settings.fillOptional} onChange={(v) => void updateSettings({ fillOptional: v })} />
          </SettingRow>
          {settings.pausedSites.length > 0 && (
            <SettingRow title="Paused sites" desc={settings.pausedSites.join(', ')}>
              <button onClick={() => void updateSettings({ pausedSites: [] })}>Clear</button>
            </SettingRow>
          )}
          <SettingRow
            title="AI help (optional)"
            desc="Adds a Draft button for free-text questions, better resume extraction, and a guess for required questions the rules can't match. Uses your own Anthropic API key; question text, the job description and your profile are sent to Anthropic only when these run."
          >
            <Switch label="AI help" checked={settings.ai.enabled} onChange={(v) => void toggleAi(v)} />
          </SettingRow>
          {settings.ai.enabled && (
            <div class="grid ai">
              <div class="field wide">
                <label for="apikey">Anthropic API key</label>
                <input
                  id="apikey"
                  type="password"
                  autocomplete="off"
                  value={settings.ai.apiKey}
                  onChange={(e) => void updateSettings({ ai: { ...settings.ai, apiKey: (e.currentTarget as HTMLInputElement).value.trim() } })}
                />
              </div>
              <div class="field">
                <label for="mapmodel">Model for matching and resume</label>
                <input id="mapmodel" value={settings.ai.mapModel} onChange={(e) => void updateSettings({ ai: { ...settings.ai, mapModel: (e.currentTarget as HTMLInputElement).value.trim() } })} />
              </div>
              <div class="field">
                <label for="draftmodel">Model for drafts</label>
                <input id="draftmodel" value={settings.ai.draftModel} onChange={(e) => void updateSettings({ ai: { ...settings.ai, draftModel: (e.currentTarget as HTMLInputElement).value.trim() } })} />
              </div>
            </div>
          )}
        </div>
      </section>

      <div class="savebar" role="region" aria-label="Save">
        <span class="muted" aria-live="polite">
          {status || (dirty ? 'Unsaved changes' : 'All changes saved')}
        </span>
        <button class="primary" onClick={() => void save()} disabled={!dirty}>
          Save profile
        </button>
      </div>
    </main>
  );
}

render(<Options />, document.getElementById('app')!);
