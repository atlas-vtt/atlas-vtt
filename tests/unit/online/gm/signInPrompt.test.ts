import { describe, expect, it } from 'vitest';
import type { AccountView } from '../../../../src/app/online/gm/account/accountView.ts';
import { signInActions, signInPrompt, type SignInPrompt } from '../../../../src/app/online/gm/account/signInPrompt.ts';
import { accountRig, APPROVED, MARA, MAY_HOST } from './accountRig.ts';

const WORDS = { intro: 'What the feature is.', unreachable: 'What goes on meanwhile.' };

/** The prompt as the GM reads it: its lines, the code, and its buttons by their words (disabled ones marked). */
function read(prompt: SignInPrompt | null): { lines: string[]; code: string | null; buttons: string[]; startWaits: boolean } | null {
  if (prompt === null) return null;
  return {
    lines: prompt.lines.map((line) => `${line.tone}: ${line.text}`),
    code: prompt.code?.text ?? null,
    buttons: prompt.buttons.map((button) => `${button.kind}${button.disabled ? ' (disabled)' : ''}: ${button.label}`),
    startWaits: prompt.startWaits,
  };
}

describe('the shared sign-in', () => {
  it('asks a signed-out GM to sign in to host, after the feature\'s sentence and how the last sign-in ended', () => {
    expect(read(signInPrompt({ kind: 'signed-out', notice: null }, WORDS))).toEqual({ lines: ['help: What the feature is.'], code: null, buttons: ['cta: Sign in to host'], startWaits: false });
    expect(read(signInPrompt({ kind: 'signed-out', notice: 'timed-out' }, { ...WORDS, intro: null }))?.lines).toEqual(['red: Sign-in timed out.']);
    expect(read(signInPrompt({ kind: 'signed-out', notice: 'server' }, { ...WORDS, intro: null }))?.lines).toEqual(['amber: You were signed out. Running tables keep going.']);
  });

  it('shows the code to approve in the browser, in two groups of four, with the page to open again and a cancel', () => {
    const waiting = signInPrompt({ kind: 'waiting', userCode: 'ABCDEFGH' }, WORDS);
    expect(read(waiting)).toEqual({ lines: ['help: Approve this code in your browser. Atlas waits here.'], code: 'ABCD-EFGH', buttons: ['plain: Open again', 'plain: Cancel'], startWaits: false });
    expect(waiting?.code?.label).toBe('Code A B C D E F G H');
    // Before the service gave a code, nothing can be opened again.
    expect(read(signInPrompt({ kind: 'waiting', userCode: null }, WORDS))).toEqual({ lines: ['amber: Opening your browser…'], code: null, buttons: ['plain (disabled): Open again', 'plain: Cancel'], startWaits: false });
  });

  it('keeps the feature\'s start waiting while the account is checked, and offers a retry while the server cannot be reached', () => {
    expect(read(signInPrompt({ kind: 'checking' }, WORDS))).toEqual({ lines: ['muted: Checking your account…'], code: null, buttons: [], startWaits: true });
    expect(read(signInPrompt({ kind: 'unreachable' }, WORDS))?.lines).toEqual(['red: Can’t reach Atlas sign-in right now.', 'help: What goes on meanwhile.']);
    expect(read(signInPrompt({ kind: 'unreachable' }, { ...WORDS, unreachable: null }))).toEqual({ lines: ['red: Can’t reach Atlas sign-in right now.'], code: null, buttons: ['plain: Try again'], startWaits: false });
  });

  it('says plainly why an account may not host, with the way to the account page and to sign out, and steps aside for one that may', () => {
    const noAccess: AccountView = { kind: 'no-access', account: MARA, reason: 'access-ended' };
    expect(read(signInPrompt(noAccess, WORDS))).toEqual({ lines: ['help: Your access to online play has ended. See your account page.'], code: null, buttons: ['ghost: Sign out', 'cta: Open account page'], startWaits: false });
    expect(signInPrompt({ kind: 'can-host', account: MARA, access: { plan: 'beta', maxPlayers: 12, endsAt: null } }, WORDS)).toBeNull();
  });

  it('signs in through the account: the approve page opens, and once approved the account may host', async () => {
    const rig = accountRig();
    const actions = signInActions(rig.control);
    actions.signIn();
    await rig.settle();
    expect(rig.opened).toEqual(['http://site.test/device?user_code=ABCDEFGH']);
    expect(read(signInPrompt(rig.control.view(), WORDS))?.code).toBe('ABCD-EFGH');
    rig.poll = APPROVED;
    rig.timers.advance(5000);
    await rig.settle();
    expect(rig.tokens.value).toBe('bearer-token');
    expect(signInPrompt(rig.control.view(), WORDS)).toBeNull();
  });

  it('asks the relay again on a retry, opens the account page, and signs out', async () => {
    const rig = accountRig('bearer-token');
    rig.reachable = false;
    await rig.control.refresh(true);
    expect(rig.control.view().kind).toBe('unreachable');
    rig.reachable = true;
    rig.me = MAY_HOST;
    const actions = signInActions(rig.control);
    actions.retry();
    await rig.settle();
    expect(rig.control.view().kind).toBe('can-host');
    actions.openAccountPage();
    expect(rig.opened).toHaveLength(1);
    actions.signOut();
    await rig.settle();
    expect(rig.tokens.value).toBeNull();
    expect(rig.control.view()).toEqual({ kind: 'signed-out', notice: null });
  });
});
