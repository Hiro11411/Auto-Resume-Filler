import type { AiResume } from '../ai/client';
import { emptyJob, emptySchool, type Profile } from '../profile/schema';
import type { ExtractedResume } from './extract';

/**
 * Fold extracted resume details into the profile without touching anything the
 * user already filled. Returns how many details were added.
 */
export function mergeExtracted(p: Profile, x: ExtractedResume): { profile: Profile; count: number } {
  let count = 0;
  const next = structuredClone(p);
  const put = (cur: string, v: string, set: (v: string) => void) => {
    if (!cur && v) {
      set(v);
      count++;
    }
  };
  put(next.firstName, x.firstName, (v) => (next.firstName = v));
  put(next.middleName, x.middleName, (v) => (next.middleName = v));
  put(next.lastName, x.lastName, (v) => (next.lastName = v));
  put(next.email, x.email, (v) => (next.email = v));
  put(next.phone, x.phone, (v) => (next.phone = v));
  put(next.address.city, x.city, (v) => (next.address.city = v));
  put(next.address.state, x.state, (v) => (next.address.state = v));
  put(next.links.linkedin, x.linkedin, (v) => (next.links.linkedin = v));
  put(next.links.github, x.github, (v) => (next.links.github = v));
  put(next.links.portfolio, x.portfolio, (v) => (next.links.portfolio = v));
  put(next.skills, x.skills, (v) => (next.skills = v));
  if (!next.work.length && x.work.length) {
    next.work = x.work;
    count += x.work.length;
  }
  if (!next.education.length && x.education.length) {
    next.education = x.education;
    count += x.education.length;
  }
  return { profile: next, count };
}

/** Convert the AI's structured resume into the same shape the offline extractor returns. */
export function fromAi(ai: AiResume | null): ExtractedResume | null {
  if (!ai) return null;
  return {
    firstName: ai.firstName,
    middleName: '',
    lastName: ai.lastName,
    email: ai.email,
    phone: ai.phone,
    city: ai.city,
    state: ai.state,
    linkedin: ai.linkedin,
    github: ai.github,
    portfolio: ai.portfolio,
    skills: ai.skills,
    work: ai.work.map((w) => ({ ...emptyJob(), ...w })),
    education: ai.education.map((e) => ({ ...emptySchool(), ...e })),
  };
}
