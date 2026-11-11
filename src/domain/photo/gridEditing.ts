import type { ColumnRole, Grid } from './tableGrid';

/** The direction a separator cuts: between columns, or between rows. */
export type Axis = 'column' | 'row';

/** No band of the grid gets narrower than this, in pixels of the photo. */
export const MIN_BAND = 8;

function separatorsOf(grid: Grid, axis: Axis): number[] {
  return axis === 'column' ? grid.columnSeparators : grid.rowSeparators;
}

function lengthOf(grid: Grid, axis: Axis): number {
  return axis === 'column' ? grid.size.width : grid.size.height;
}

function withSeparators(grid: Grid, axis: Axis, separators: number[]): Grid {
  return axis === 'column'
    ? { ...grid, columnSeparators: separators }
    : { ...grid, rowSeparators: separators };
}

/** Moves a separator, kept between its neighbours so that every band keeps some room. */
export function moveSeparator(grid: Grid, axis: Axis, index: number, position: number): Grid {
  const separators = separatorsOf(grid, axis);
  if (index < 0 || index >= separators.length || !Number.isFinite(position)) {
    return grid;
  }
  const edges = [0, ...separators, lengthOf(grid, axis)];
  const lowest = Number(edges[index]) + MIN_BAND;
  const highest = Number(edges[index + 2]) - MIN_BAND;
  const moved = Math.min(highest, Math.max(lowest, Math.round(position)));
  return withSeparators(
    grid,
    axis,
    separators.map((separator, at) => (at === index ? moved : separator)),
  );
}

/** Adds a separator, unless it would leave a band too narrow. */
export function addSeparator(grid: Grid, axis: Axis, position: number): Grid {
  const rounded = Math.round(position);
  const edges = [0, ...separatorsOf(grid, axis), lengthOf(grid, axis)];
  if (!Number.isFinite(position) || edges.some((edge) => Math.abs(edge - rounded) < MIN_BAND)) {
    return grid;
  }
  const separators = [...separatorsOf(grid, axis), rounded].sort((one, other) => one - other);
  if (axis === 'row') {
    return withSeparators(grid, axis, separators);
  }
  const index = separators.indexOf(rounded);
  const roles = [...grid.columnRoles];
  roles.splice(index, 0, ...roles.slice(index, index + 1));
  return { ...grid, columnSeparators: separators, columnRoles: roles };
}

/** Removes a separator: the two bands become one; a joined column keeps a role worth reading. */
export function removeSeparator(grid: Grid, axis: Axis, index: number): Grid {
  const separators = separatorsOf(grid, axis);
  if (index < 0 || index >= separators.length) {
    return grid;
  }
  const kept = separators.filter((_, at) => at !== index);
  if (axis === 'row') {
    return withSeparators(grid, axis, kept);
  }
  const joined: ColumnRole =
    grid.columnRoles.slice(index, index + 2).find((role) => role !== 'ignore') ?? 'ignore';
  const roles = [...grid.columnRoles.slice(0, index), joined, ...grid.columnRoles.slice(index + 2)];
  return { ...grid, columnSeparators: kept, columnRoles: roles };
}

export function setColumnRole(grid: Grid, column: number, role: ColumnRole): Grid {
  if (column < 0 || column >= grid.columnRoles.length) {
    return grid;
  }
  return {
    ...grid,
    columnRoles: grid.columnRoles.map((current, at) => (at === column ? role : current)),
  };
}
