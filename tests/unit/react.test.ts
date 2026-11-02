import { act, createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { setText } from '../../src/engine/widgets/native';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Controlled() {
  const [v, setV] = useState('');
  return createElement('div', null,
    createElement('input', { id: 'c', value: v, onChange: (e: { target: HTMLInputElement }) => setV(e.target.value) }),
    createElement('output', { id: 'state' }, v),
  );
}

describe('React controlled inputs', () => {
  it('accepts values set through the native setter', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    await act(async () => createRoot(root).render(createElement(Controlled)));
    const input = document.getElementById('c') as HTMLInputElement;
    await act(async () => setText(input, 'Ada'));
    expect(document.getElementById('state')!.textContent).toBe('Ada');
    expect(input.value).toBe('Ada');
  });

  it('a plain .value assignment would be lost (sanity check)', async () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    await act(async () => createRoot(root).render(createElement(Controlled)));
    const input = root.querySelector('input')!;
    await act(async () => {
      input.value = 'Ada';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(root.querySelector('output')!.textContent).toBe('');
  });
});
