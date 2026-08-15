// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { askNotice, showNotice } from './noticeModal.js';

let root: HTMLElement;

beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

const card = (): HTMLElement | null => root.querySelector('.notice-modal');
const buttons = (): HTMLButtonElement[] =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('.notice-btn'));
const press = (key: string, target: EventTarget = document): void => {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
};

describe('rendering', () => {
  it('shows a single dismiss button by default', () => {
    showNotice(root, { title: 'Done' });
    expect(card()).not.toBeNull();
    expect(buttons()).toHaveLength(1);
    expect(buttons()[0]!.textContent).toBe('Continue');
  });

  it('renders each line as its own paragraph, plus an optional hint', () => {
    showNotice(root, { title: 'T', lines: ['one', 'two'], hint: 'do this next' });
    expect(root.querySelectorAll('.notice-line')).toHaveLength(2);
    expect(root.querySelector('.notice-hint')!.textContent).toBe('do this next');
  });

  it('escapes player-supplied text rather than injecting it as markup', () => {
    showNotice(root, {
      title: '<img src=x onerror=alert(1)>',
      lines: ['<script>bad()</script>'],
    });
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('.notice-title')!.textContent).toBe('<img src=x onerror=alert(1)>');
  });

  it('applies the tone as a class so the accent matches the news', () => {
    showNotice(root, { title: 'T', tone: 'setback' });
    expect(card()!.classList.contains('notice-setback')).toBe(true);
  });
});

describe('actions', () => {
  it('runs the chosen action and removes the modal', () => {
    const first = vi.fn();
    const second = vi.fn();
    showNotice(root, {
      title: 'Pick',
      actions: [
        { label: 'No', variant: 'secondary', onSelect: first },
        { label: 'Yes', onSelect: second },
      ],
    });
    buttons()[1]!.click();
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    expect(card()).toBeNull();
  });

  it('reports the outcome to onDismiss', () => {
    const onDismiss = vi.fn();
    showNotice(root, { title: 'T', actions: [{ label: 'A' }, { label: 'B' }] }, onDismiss);
    buttons()[1]!.click();
    expect(onDismiss).toHaveBeenCalledWith(
      expect.objectContaining({ actionIndex: 1, label: 'B' }),
    );
  });

  it('ignores a second click once closed', () => {
    const onSelect = vi.fn();
    showNotice(root, { title: 'T', actions: [{ label: 'Go', onSelect }] });
    const btn = buttons()[0]!;
    btn.click();
    btn.click();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('checkbox', () => {
  /**
   * Every branch must see the checkbox. This is the bug that shipped once: the
   * opt-out saved on one button but not the other.
   */
  it('passes its state to whichever action is chosen', () => {
    for (const index of [0, 1]) {
      document.body.innerHTML = '';
      root = document.createElement('div');
      document.body.appendChild(root);

      const seen: boolean[] = [];
      showNotice(root, {
        title: 'T',
        checkbox: { label: "Don't show again" },
        actions: [
          { label: 'No', variant: 'secondary', onSelect: (r) => seen.push(r.checked) },
          { label: 'Yes', onSelect: (r) => seen.push(r.checked) },
        ],
      });
      root.querySelector<HTMLInputElement>('.notice-checkbox-input')!.checked = true;
      buttons()[index]!.click();
      expect(seen).toEqual([true]);
    }
  });

  it('fires onChange regardless of which action closed it', () => {
    const onChange = vi.fn();
    showNotice(root, {
      title: 'T',
      checkbox: { label: 'x', onChange },
      actions: [{ label: 'A' }, { label: 'B' }],
    });
    root.querySelector<HTMLInputElement>('.notice-checkbox-input')!.checked = true;
    buttons()[0]!.click();
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('reports false when left unticked', () => {
    const onSelect = vi.fn();
    showNotice(root, { title: 'T', checkbox: { label: 'x' }, actions: [{ label: 'Go', onSelect }] });
    buttons()[0]!.click();
    expect(onSelect).toHaveBeenCalledWith({ checked: false, value: '' });
  });
});

describe('text input', () => {
  it('focuses the field and returns its trimmed value', () => {
    const onSelect = vi.fn();
    showNotice(root, { title: 'Name', input: {}, actions: [{ label: 'Save', onSelect }] });
    const field = root.querySelector<HTMLInputElement>('.notice-input')!;
    expect(document.activeElement).toBe(field);
    field.value = '  Storm Signal  ';
    buttons()[0]!.click();
    expect(onSelect).toHaveBeenCalledWith({ checked: false, value: 'Storm Signal' });
  });

  it('blocks the primary action while a required field is empty', () => {
    showNotice(root, {
      title: 'Name',
      input: { required: true },
      actions: [{ label: 'Cancel', variant: 'secondary' }, { label: 'Save' }],
    });
    const [cancel, save] = buttons();
    expect(save!.disabled).toBe(true);
    // Cancel must stay reachable — it is not an answer to the prompt.
    expect(cancel!.disabled).toBe(false);

    const field = root.querySelector<HTMLInputElement>('.notice-input')!;
    field.value = 'Quiet Lantern';
    field.dispatchEvent(new Event('input'));
    expect(save!.disabled).toBe(false);
  });

  it('treats whitespace as empty', () => {
    showNotice(root, { title: 'Name', input: { required: true }, actions: [{ label: 'Save' }] });
    const field = root.querySelector<HTMLInputElement>('.notice-input')!;
    field.value = '   ';
    field.dispatchEvent(new Event('input'));
    expect(buttons()[0]!.disabled).toBe(true);
  });

  it('will not close through a blocked action', () => {
    const onSelect = vi.fn();
    showNotice(root, {
      title: 'Name',
      input: { required: true },
      actions: [{ label: 'Save', onSelect }],
    });
    buttons()[0]!.click();
    expect(onSelect).not.toHaveBeenCalled();
    expect(card()).not.toBeNull();
  });

  it('submits on Enter from the field', () => {
    const onSelect = vi.fn();
    showNotice(root, { title: 'Name', input: {}, actions: [{ label: 'Save', onSelect }] });
    const field = root.querySelector<HTMLInputElement>('.notice-input')!;
    field.value = 'Bay Colt';
    press('Enter', field);
    expect(onSelect).toHaveBeenCalledWith({ checked: false, value: 'Bay Colt' });
  });

  it('prefills and seeds the value', () => {
    showNotice(root, { title: 'Name', input: { value: 'Existing' } });
    expect(root.querySelector<HTMLInputElement>('.notice-input')!.value).toBe('Existing');
  });
});

describe('dismissal rules', () => {
  it('closes a single-action notice on Escape', () => {
    showNotice(root, { title: 'T' });
    press('Escape');
    expect(card()).toBeNull();
  });

  it('leaves a choice open on Escape — dismissing would be ambiguous', () => {
    showNotice(root, { title: 'T', actions: [{ label: 'A' }, { label: 'B' }] });
    press('Escape');
    expect(card()).not.toBeNull();
  });

  it('leaves a prompt open on Escape rather than discarding typed text', () => {
    showNotice(root, { title: 'T', input: {} });
    press('Escape');
    expect(card()).not.toBeNull();
  });

  it('closes a single-action notice on a backdrop click, but not a choice', () => {
    showNotice(root, { title: 'T' });
    root.querySelector<HTMLElement>('.modal-overlay')!.click();
    expect(card()).toBeNull();

    showNotice(root, { title: 'T', actions: [{ label: 'A' }, { label: 'B' }] });
    root.querySelector<HTMLElement>('.modal-overlay')!.click();
    expect(card()).not.toBeNull();
  });

  it('does not close when the click lands inside the card', () => {
    showNotice(root, { title: 'T' });
    card()!.click();
    expect(card()).not.toBeNull();
  });

  it('honours an explicit dismissOnBackdrop override', () => {
    showNotice(root, { title: 'T', dismissOnBackdrop: false });
    root.querySelector<HTMLElement>('.modal-overlay')!.click();
    expect(card()).not.toBeNull();
  });

  it('closes via the returned handle, for a screen tearing down', () => {
    const close = showNotice(root, { title: 'T' });
    close();
    expect(card()).toBeNull();
  });
});

describe('stacking', () => {
  it('only the frontmost notice answers to Escape', () => {
    showNotice(root, { title: 'first' });
    showNotice(root, { title: 'second' });
    expect(root.querySelectorAll('.modal-overlay')).toHaveLength(2);

    press('Escape');
    const remaining = root.querySelectorAll('.notice-title');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.textContent).toBe('first');
  });

  it('detaches its key listener once closed', () => {
    showNotice(root, { title: 'T' });
    press('Escape');
    expect(card()).toBeNull();
    // A stray listener would throw or re-close; nothing should happen here.
    expect(() => press('Escape')).not.toThrow();
  });
});

describe('focus', () => {
  it('focuses the first enabled button', () => {
    showNotice(root, { title: 'T', actions: [{ label: 'A' }, { label: 'B' }] });
    expect(document.activeElement).toBe(buttons()[0]);
  });

  it('restores focus to whatever was focused before', () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();

    showNotice(root, { title: 'T' });
    expect(document.activeElement).not.toBe(opener);

    buttons()[0]!.click();
    expect(document.activeElement).toBe(opener);
  });

  it('wraps Tab from the last control back to the first', () => {
    showNotice(root, { title: 'T', actions: [{ label: 'A' }, { label: 'B' }] });
    const [first, last] = buttons();
    last!.focus();
    press('Tab', last!);
    expect(document.activeElement).toBe(first);
  });

  it('wraps Shift+Tab from the first control to the last', () => {
    showNotice(root, { title: 'T', actions: [{ label: 'A' }, { label: 'B' }] });
    const [first, last] = buttons();
    first!.focus();
    first!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(last);
  });
});

describe('askNotice', () => {
  it('resolves with the chosen action and state', async () => {
    const pending = askNotice(root, {
      title: 'Pick',
      checkbox: { label: 'x' },
      actions: [{ label: 'No', variant: 'secondary' }, { label: 'Yes' }],
    });
    root.querySelector<HTMLInputElement>('.notice-checkbox-input')!.checked = true;
    buttons()[1]!.click();

    await expect(pending).resolves.toEqual({
      actionIndex: 1,
      label: 'Yes',
      checked: true,
      value: '',
    });
  });

  it('resolves with the typed value', async () => {
    const pending = askNotice(root, { title: 'Name', input: {}, actions: [{ label: 'Save' }] });
    root.querySelector<HTMLInputElement>('.notice-input')!.value = 'Nightjar';
    buttons()[0]!.click();
    await expect(pending).resolves.toMatchObject({ value: 'Nightjar' });
  });
});
