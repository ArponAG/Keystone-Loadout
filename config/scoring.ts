/**
 * Tunable scoring constants. Deliberately data, not logic — change these rather than
 * the algorithm in lib/scoring/score.ts.
 */

/**
 * Weight applied to a secondary stat by its rank in the user's ordering.
 * Index 0 is the #1 stat, index 3 the #4.
 *
 * Flatten toward [1, .85, .7, .55] if results feel too binary;
 * steepen toward [1, .5, .25, .1] to punish off-stats harder.
 *
 * The last value sets the floor of the score range: a item whose entire secondary
 * budget is on your #4 stat scores exactly RANK_WEIGHTS[3].
 */
export const RANK_WEIGHTS = [1.0, 0.7, 0.45, 0.25] as const;
