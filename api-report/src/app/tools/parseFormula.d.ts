export type FormulaErrorCode = 'syntax' | 'length' | 'terms' | 'dice' | 'faces';
export interface FormulaError {
    readonly ok: false;
    readonly code: FormulaErrorCode;
}
export type FormulaTerm = {
    readonly kind: 'constant';
    readonly value: number;
} | {
    readonly kind: 'dice';
    readonly count: number;
    readonly faces: number;
    readonly negative: boolean;
    readonly explosions?: number;
};
export interface ParsedFormula {
    readonly ok: true;
    readonly terms: readonly FormulaTerm[];
}
export declare const FORMULA_LIMITS: {
    readonly characters: 64;
    readonly terms: 10;
    readonly dice: 100;
    readonly faces: 1000;
};
/** Validates the whole expression before the caller can consume any randomness. */
export declare function parseFormula(formula: string): ParsedFormula | FormulaError;
