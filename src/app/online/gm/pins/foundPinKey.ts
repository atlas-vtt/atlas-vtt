/** How a found pin is known, wherever players opened it (the table or the world map): the scene file it is saved in and its id there. */
export const foundPinKey = (map: string, pin: string): string => `${map}\n${pin}`;
