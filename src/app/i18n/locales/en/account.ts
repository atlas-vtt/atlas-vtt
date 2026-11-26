import type { Message } from '../../types';

/** The Atlas account: signing in on this device, shared by online play and the Armarium. */
export const account = {
  'account.heading': 'Atlas account',
  'account.name': 'Account',
  'account.signIn': 'Sign in',
  'account.signOut': 'Sign out',
  'account.openAgain': 'Open the page again',
  'account.openPage': 'Open account page',
  'account.signedOut': 'Optional. Sign in to share collections in the Armarium and to host online tables.',
  'account.signedOutWithNotice': '{notice} Sign in to share collections in the Armarium and to host online tables.',
  'account.opening': 'Opening your browser…',
  'account.approve': 'Approve the sign-in in your browser. Your code is {code}.',
  'account.checking': 'Signed in. Checking your account…',
  'account.signedInAs': 'Signed in as {account}.',
  'account.signedInUnreachable': 'Signed in. Atlas cannot reach your account right now.',
  'account.unavailable': 'Signing in needs Obsidian {version} or newer, which keeps the sign-in safe on this device.',
  'account.timedOut': 'Sign-in timed out.',
  'account.declined': 'Sign-in was declined.',
  'account.unreachable': 'Atlas cannot reach the sign-in right now.',
  'account.serverSignedOut': 'You were signed out of your Atlas account.',
  'account.noStorage': 'Obsidian cannot keep the sign-in on this device: its secure storage is not available.',
} as const satisfies Record<string, Message>;
