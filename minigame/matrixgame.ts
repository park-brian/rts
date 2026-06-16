// Exact solver for a two-player zero-sum matrix game.
//
// Given a payoff matrix `M` (M[i][j] = payoff to the ROW player when row plays i
// and column plays j; the column player gets -M[i][j]), returns the game value
// and an optimal MIXED strategy for each player.
//
// Method: the classic reduction to a linear program. Shift M so every entry is
// positive, then solve
//     maximize 1·w   subject to  M·w <= 1,  w >= 0
// by the simplex method. The optimum `w` (normalized) is the column player's
// strategy; the dual variables (slack reduced costs) give the row player's.
// Mixed strategies are required in general (e.g. Matching Pennies), so a pure
// minimax would NOT be a correct oracle — hence the LP.

export type GameSolution = {
  value: number; // value to the row (maximizing) player
  row: number[]; // row player's optimal mixed strategy
  col: number[]; // column player's optimal mixed strategy
};

const EPS = 1e-9;

// Solve  max c·x  s.t.  A x <= b,  x >= 0,  with b >= 0 (so x=0 is feasible).
// Returns the optimal x, objective, and dual variables (shadow prices).
// Bland's rule guarantees termination on degenerate tableaus.
const simplexMax = (
  A: number[][],
  b: number[],
  c: number[],
): { x: number[]; z: number; dual: number[] } => {
  const m = A.length; // constraints
  const n = c.length; // structural variables
  const cols = n + m + 1; // structural | slack | RHS
  const rhs = cols - 1;

  // Tableau: rows 0..m-1 constraints, row m objective.
  const T: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row = new Array(cols).fill(0);
    for (let j = 0; j < n; j++) row[j] = A[i]![j]!;
    row[n + i] = 1; // slack
    row[rhs] = b[i]!;
    T.push(row);
  }
  const obj = new Array(cols).fill(0);
  for (let j = 0; j < n; j++) obj[j] = -c[j]!; // maximize c·x  <=>  drive -c to >= 0
  T.push(obj);

  const basis = new Array(m).fill(0).map((_, i) => n + i); // slacks start basic

  for (let iter = 0; iter < 10000; iter++) {
    // Entering variable: smallest index with negative objective coefficient.
    let pivotCol = -1;
    for (let j = 0; j < cols - 1; j++) {
      if (T[m]![j]! < -EPS) {
        pivotCol = j;
        break;
      }
    }
    if (pivotCol === -1) break; // optimal

    // Leaving variable: min-ratio test (Bland tie-break by basis index).
    let pivotRow = -1;
    let best = Infinity;
    for (let i = 0; i < m; i++) {
      const a = T[i]![pivotCol]!;
      if (a > EPS) {
        const ratio = T[i]![rhs]! / a;
        if (ratio < best - EPS || (Math.abs(ratio - best) <= EPS && (pivotRow === -1 || basis[i]! < basis[pivotRow]!))) {
          best = ratio;
          pivotRow = i;
        }
      }
    }
    if (pivotRow === -1) throw new Error('matrix game LP unbounded — payoff shift failed');

    // Pivot.
    const piv = T[pivotRow]![pivotCol]!;
    const prow = T[pivotRow]!;
    for (let j = 0; j < cols; j++) prow[j]! /= piv;
    for (let i = 0; i <= m; i++) {
      if (i === pivotRow) continue;
      const factor = T[i]![pivotCol]!;
      if (Math.abs(factor) < EPS) continue;
      const ri = T[i]!;
      for (let j = 0; j < cols; j++) ri[j]! -= factor * prow[j]!;
    }
    basis[pivotRow] = pivotCol;
  }

  const x = new Array(n).fill(0);
  for (let i = 0; i < m; i++) {
    if (basis[i]! < n) x[basis[i]!] = T[i]![rhs]!;
  }
  const z = T[m]![rhs]!;
  const dual = new Array(m).fill(0);
  for (let i = 0; i < m; i++) dual[i] = T[m]![n + i]!; // shadow price of constraint i
  return { x, z, dual };
};

// Pure saddle point: a cell that is simultaneously the min of its row and the
// max of its column. When maximin === minimax one exists and the game value is
// pure — no LP needed. This short-circuits the large majority of game-tree
// nodes (deep positions are usually decided), which is the main speedup.
const saddlePoint = (M: number[][]): GameSolution | null => {
  const m = M.length;
  const n = M[0]!.length;
  const rowMin = M.map((r) => Math.min(...r));
  const maximin = Math.max(...rowMin);
  const colMax = new Array(n).fill(-Infinity);
  for (let j = 0; j < n; j++) for (let i = 0; i < m; i++) colMax[j] = Math.max(colMax[j], M[i]![j]!);
  const minimax = Math.min(...colMax);
  if (Math.abs(maximin - minimax) > EPS) return null;
  const ri = rowMin.findIndex((v) => Math.abs(v - maximin) <= EPS);
  const ci = colMax.findIndex((v) => Math.abs(v - minimax) <= EPS);
  const row = new Array(m).fill(0);
  const col = new Array(n).fill(0);
  row[ri] = 1;
  col[ci] = 1;
  return { value: maximin, row, col };
};

// Iterated removal of (weakly) dominated rows/columns. Preserves the game value
// and at least one optimal strategy, while shrinking the matrix the LP must
// handle. Row r dominated if some other row is >= it everywhere; column c
// dominated if some other column is <= it everywhere (the minimizer prefers it).
const reduceDominance = (M: number[][]): { sub: number[][]; rows: number[]; cols: number[] } => {
  let rows = M.map((_, i) => i);
  let cols = M[0]!.map((_, j) => j);
  let changed = true;
  while (changed && rows.length > 1 && cols.length > 1) {
    changed = false;
    // Drop a dominated row.
    outerR: for (let a = 0; a < rows.length; a++) {
      for (let b = 0; b < rows.length; b++) {
        if (a === b) continue;
        let dom = true;
        for (const c of cols) if (M[rows[b]!]![c]! < M[rows[a]!]![c]! - EPS) { dom = false; break; }
        if (dom) { rows = rows.filter((_, i) => i !== a); changed = true; break outerR; }
      }
    }
    if (changed) continue;
    // Drop a dominated column.
    outerC: for (let a = 0; a < cols.length; a++) {
      for (let b = 0; b < cols.length; b++) {
        if (a === b) continue;
        let dom = true;
        for (const r of rows) if (M[r]![cols[b]!]! > M[r]![cols[a]!]! + EPS) { dom = false; break; }
        if (dom) { cols = cols.filter((_, i) => i !== a); changed = true; break outerC; }
      }
    }
  }
  const sub = rows.map((r) => cols.map((c) => M[r]![c]!));
  return { sub, rows, cols };
};

export const solveZeroSum = (M: number[][]): GameSolution => {
  const m = M.length;
  const n = M[0]!.length;

  // Degenerate dimensions.
  if (m === 1 && n === 1) return { value: M[0]![0]!, row: [1], col: [1] };

  // Fast path: a pure saddle point avoids the LP entirely.
  const saddle = saddlePoint(M);
  if (saddle) return saddle;

  // Shrink by dominance, then solve the (often much smaller) core by LP and
  // scatter the strategies back to full size.
  const { sub, rows, cols } = reduceDominance(M);
  if (rows.length < m || cols.length < n) {
    const core = solveZeroSumCore(sub);
    const row = new Array(m).fill(0);
    const col = new Array(n).fill(0);
    rows.forEach((r, i) => (row[r] = core.row[i]!));
    cols.forEach((c, j) => (col[c] = core.col[j]!));
    return { value: core.value, row, col };
  }
  return solveZeroSumCore(M);
};

const solveZeroSumCore = (M: number[][]): GameSolution => {
  const m = M.length;
  const n = M[0]!.length;
  if (m === 1 && n === 1) return { value: M[0]![0]!, row: [1], col: [1] };

  // Shift so all entries are strictly positive (value of shifted game > 0).
  let min = Infinity;
  for (const r of M) for (const v of r) if (v < min) min = v;
  const shift = 1 - min; // every entry >= 1
  const P: number[][] = M.map((r) => r.map((v) => v + shift));

  // max 1·w  s.t.  P w <= 1,  w >= 0   (w over columns; one constraint per row)
  const b = new Array(m).fill(1);
  const c = new Array(n).fill(1);
  const { x: w, z, dual } = simplexMax(P, b, c);

  const total = z; // = sum(w) = 1 / value_of_shifted_game
  const valueShifted = 1 / total;
  const value = valueShifted - shift;

  const col = w.map((v) => v / total);
  const row = dual.map((v) => v / total);

  // Clean tiny negatives / renormalize against floating error.
  const norm = (arr: number[]): number[] => {
    const cleaned = arr.map((v) => (v < 0 ? 0 : v));
    const sum = cleaned.reduce((a, v) => a + v, 0) || 1;
    return cleaned.map((v) => v / sum);
  };
  return { value, row: norm(row), col: norm(col) };
};
