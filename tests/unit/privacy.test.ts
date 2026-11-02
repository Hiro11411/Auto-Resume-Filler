import { describe, expect, it } from 'vitest';
import { forContent } from '../../src/ext/messages';
import { defaultSettings } from '../../src/profile/schema';

describe('forContent', () => {
  it('removes the API key before settings reach a web page', () => {
    const s = defaultSettings();
    s.ai = { ...s.ai, enabled: true, apiKey: 'sk-ant-secret' };
    const out = forContent(s);
    expect(out.ai.apiKey).toBe('');
    expect(JSON.stringify(out)).not.toContain('sk-ant-secret');
    expect(out.ai.enabled).toBe(true);
  });

  it('reports AI as off when no key is set', () => {
    const s = defaultSettings();
    s.ai = { ...s.ai, enabled: true, apiKey: '' };
    expect(forContent(s).ai.enabled).toBe(false);
  });

  it('does not modify the stored settings object', () => {
    const s = defaultSettings();
    s.ai.apiKey = 'sk-ant-secret';
    forContent(s);
    expect(s.ai.apiKey).toBe('sk-ant-secret');
  });
});
