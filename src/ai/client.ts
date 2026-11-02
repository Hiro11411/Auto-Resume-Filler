import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import type { FieldType } from '../engine/types';
import type { Profile, Settings } from '../profile/schema';
import { DRAFT_SYSTEM, MAP_SYSTEM, RESUME_SYSTEM } from './prompts';

// Runs only in the background service worker. The key is the user's own and
// never reaches page context; `dangerouslyAllowBrowser` is required because a
// service worker looks like a browser to the SDK.
function client(settings: Settings): Anthropic {
  if (!settings.ai.enabled || !settings.ai.apiKey) throw new Error('AI is turned off');
  return new Anthropic({ apiKey: settings.ai.apiKey, dangerouslyAllowBrowser: true });
}

/** Models that accept server-side refusal fallbacks (`fallbacks: "default"`). */
const FALLBACK_MODELS = new Set(['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-fable-5-1']);

/**
 * Field types the AI is allowed to map unknown questions onto. Never free text,
 * and never citizenship / export-control / work-authorization (SENSITIVE_TYPES):
 * those are answered only by rules that match the user's saved profile answers.
 */
export const MAPPABLE: FieldType[] = [
  'firstName', 'lastName', 'fullName', 'preferredName', 'email', 'phone', 'city', 'state', 'country',
  'postalCode', 'location', 'linkedin', 'github', 'portfolio', 'website', 'currentCompany', 'currentTitle',
  'school', 'degree', 'major', 'gpa', 'over18', 'relocate',
  'startDate', 'salary', 'noticePeriod', 'referralSource', 'gender', 'race', 'hispanic', 'veteran', 'disability',
];

export async function mapQuestions(
  settings: Settings,
  questions: { label: string; options: string[] }[],
): Promise<(FieldType | null)[]> {
  const schema = z.object({
    mappings: z.array(z.object({ index: z.number().int(), key: z.enum(['none', ...MAPPABLE] as [string, ...string[]]) })),
  });
  const list = questions
    .map((q, i) => `${i}. ${q.label}${q.options.length ? ` [options: ${q.options.slice(0, 20).join(' | ')}]` : ''}`)
    .join('\n');
  const res = await client(settings).messages.parse({
    model: settings.ai.mapModel,
    max_tokens: 2000,
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
    system: MAP_SYSTEM,
    messages: [{ role: 'user', content: `Profile keys: ${MAPPABLE.join(', ')}\n\nQuestions:\n${list}` }],
  });
  if (res.stop_reason === 'refusal' || !res.parsed_output) return questions.map(() => null);
  const out: (FieldType | null)[] = questions.map(() => null);
  for (const m of res.parsed_output.mappings) {
    if (m.index >= 0 && m.index < out.length && m.key !== 'none') out[m.index] = m.key as FieldType;
  }
  return out;
}

function profileSummary(p: Profile): string {
  const jobs = p.work
    .map((j) => `- ${j.title} at ${j.company} (${j.start}–${j.current ? 'present' : j.end})${j.description ? `: ${j.description}` : ''}`)
    .join('\n');
  const schools = p.education.map((s) => `- ${s.degree} ${s.major}, ${s.school} (${s.end})`).join('\n');
  return [
    `Name: ${p.firstName} ${p.lastName}`,
    jobs && `Experience:\n${jobs}`,
    schools && `Education:\n${schools}`,
    p.skills && `Skills: ${p.skills}`,
    p.certifications && `Certifications: ${p.certifications}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function draftAnswer(settings: Settings, profile: Profile, question: string, jobDescription: string): Promise<string> {
  const model = settings.ai.draftModel;
  const params = {
    model,
    max_tokens: 4000,
    output_config: { effort: 'medium' as const },
    system: DRAFT_SYSTEM,
    messages: [
      {
        role: 'user' as const,
        content: `<profile>\n${profileSummary(profile)}\n</profile>\n\n<job_description>\n${jobDescription || '(not available)'}\n</job_description>\n\nQuestion: ${question}`,
      },
    ],
  };
  const c = client(settings);
  const res = FALLBACK_MODELS.has(model)
    ? await c.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
    : await c.messages.create(params);
  if (res.stop_reason === 'refusal') throw new Error('The model declined to draft this answer');
  const text = res.content
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  if (!text) throw new Error('Empty draft');
  return text;
}

const ym = z.string().describe('YYYY-MM or ""');
const ResumeSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string(),
  state: z.string(),
  country: z.string(),
  linkedin: z.string(),
  github: z.string(),
  portfolio: z.string(),
  skills: z.string(),
  work: z.array(
    z.object({ company: z.string(), title: z.string(), location: z.string(), start: ym, end: ym, current: z.boolean(), description: z.string() }),
  ),
  education: z.array(
    z.object({ school: z.string(), degree: z.string(), major: z.string(), gpa: z.string(), start: ym, end: ym }),
  ),
});
export type AiResume = z.infer<typeof ResumeSchema>;

export async function structureResume(settings: Settings, text: string): Promise<AiResume | null> {
  const res = await client(settings).messages.parse({
    model: settings.ai.mapModel,
    max_tokens: 8000,
    output_config: { effort: 'low', format: zodOutputFormat(ResumeSchema) },
    system: RESUME_SYSTEM,
    messages: [{ role: 'user', content: `<resume>\n${text}\n</resume>` }],
  });
  if (res.stop_reason === 'refusal') return null;
  return res.parsed_output ?? null;
}
