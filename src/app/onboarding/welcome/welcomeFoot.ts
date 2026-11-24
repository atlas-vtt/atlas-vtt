import { createContext } from 'react';

/**
 * The start of the welcome dialog's foot, where a page may put controls of its own beside Skip and Next (the
 * carousel's chips). Null outside the dialog: the page then keeps them in its own flow.
 */
export const WelcomeFootStart = createContext<HTMLElement | null>(null);
