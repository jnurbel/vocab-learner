<script lang="ts">
  import {
    addSeparator,
    moveSeparator,
    removeSeparator,
    setColumnRole,
    type Axis,
  } from '../../domain/photo/gridEditing';
  import { bands, COLUMN_ROLES, type ColumnRole, type Grid } from '../../domain/photo/tableGrid';
  import { format } from '../../i18n/format';
  import fr from '../../i18n/fr.json';

  interface Props {
    grid: Grid;
    /** The photo read, through a temporary blob: URL. */
    photoUrl: string;
    /** Goes on with these zones: the words are read again in the cells they cut. */
    onApply: (grid: Grid) => void;
    /** Back to the words, when the zones were opened from them. */
    onBack?: () => void;
  }

  const { grid: found, photoUrl, onApply, onBack }: Props = $props();

  // The zones found are a starting point: the learner adjusts them from there.
  // svelte-ignore state_referenced_locally
  let grid = $state.raw<Grid>(found);
  let selected = $state<{ axis: Axis; index: number }>();
  let announcement = $state('');
  let dragging: { axis: Axis; index: number; pointerId: number } | undefined;
  let svg = $state<SVGSVGElement>();

  const changed = $derived(grid !== found);
  const columnBands = $derived(bands(grid.columnSeparators, grid.size.width));
  /** The labels of the columns, at a size that follows the photo's. */
  const labelSize = $derived(Math.round(grid.size.width / 45));
  /** One hundredth of the photo per arrow key, ten with Shift. */
  const step = (axis: Axis, large: boolean) =>
    Math.round((axis === 'column' ? grid.size.width : grid.size.height) / 100) * (large ? 10 : 1);

  function nameOf(axis: Axis, index: number): string {
    return format(axis === 'column' ? fr.photoZones.columnSeparator : fr.photoZones.rowSeparator, {
      index: index + 1,
    });
  }

  function separatorsOf(axis: Axis): number[] {
    return axis === 'column' ? grid.columnSeparators : grid.rowSeparators;
  }

  function move(axis: Axis, index: number, position: number) {
    grid = moveSeparator(grid, axis, index, position);
    announcement = format(fr.photoZones.moved, { separator: nameOf(axis, index) });
  }

  function remove(axis: Axis, index: number) {
    grid = removeSeparator(grid, axis, index);
    selected = undefined;
  }

  /** Adds a separator in the middle of the widest band, to move from there. */
  function add(axis: Axis) {
    const length = axis === 'column' ? grid.size.width : grid.size.height;
    const widest = bands(separatorsOf(axis), length).reduce((best, band) =>
      band.end - band.start > best.end - best.start ? band : best,
    );
    grid = addSeparator(grid, axis, (widest.start + widest.end) / 2);
  }

  function onKeydown(event: KeyboardEvent, axis: Axis, index: number) {
    const backward = axis === 'column' ? 'ArrowLeft' : 'ArrowUp';
    const forward = axis === 'column' ? 'ArrowRight' : 'ArrowDown';
    const position = separatorsOf(axis)[index] ?? 0;
    if (event.key === backward || event.key === forward) {
      event.preventDefault();
      const direction = event.key === forward ? 1 : -1;
      move(axis, index, position + direction * step(axis, event.shiftKey));
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      remove(axis, index);
    }
  }

  /** The position on the photo under the pointer, in pixels of the photo. */
  function pointOf(event: PointerEvent): { x: number; y: number } {
    const rect = svg?.getBoundingClientRect() ?? new DOMRect();
    return {
      x: ((event.clientX - rect.left) / (rect.width || 1)) * grid.size.width,
      y: ((event.clientY - rect.top) / (rect.height || 1)) * grid.size.height,
    };
  }

  function select(axis: Axis, index: number) {
    selected = { axis, index };
    announcement = format(fr.photoZones.selected, { separator: nameOf(axis, index) });
  }

  function startDrag(event: PointerEvent, axis: Axis, index: number) {
    select(axis, index);
    dragging = { axis, index, pointerId: event.pointerId };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
  }

  function drag(event: PointerEvent) {
    if (dragging?.pointerId !== event.pointerId) {
      return;
    }
    const point = pointOf(event);
    move(dragging.axis, dragging.index, dragging.axis === 'column' ? point.x : point.y);
  }

  function stopDrag() {
    dragging = undefined;
  }
</script>

<section aria-labelledby="photo-zones-title" class="zones">
  <h3 id="photo-zones-title">{fr.photoZones.title}</h3>
  <p class="help">{fr.photoZones.help}</p>

  <svg
    bind:this={svg}
    role="group"
    aria-label={fr.photoZones.photoLabel}
    viewBox="0 0 {grid.size.width} {grid.size.height}"
    preserveAspectRatio="xMinYMin meet"
  >
    <image href={photoUrl} width={grid.size.width} height={grid.size.height} />
    {#each columnBands as band, index (index)}
      {@const name = fr.photoZones.roles[grid.columnRoles[index] ?? 'ignore']}
      <!-- Drawn only where the column has room; the list under the photo names every column. -->
      {#if band.end - band.start > name.length * labelSize * 0.7}
        <text
          class="role"
          x={band.start + labelSize / 3}
          y={labelSize / 3}
          font-size={labelSize}
          dominant-baseline="hanging">{name}</text
        >
      {/if}
    {/each}
    {#each grid.rowSeparators as position, index (index)}
      <!-- A focusable separator is a widget (WAI-ARIA window splitter): moved by keys and pointer. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <g
        role="separator"
        tabindex="0"
        aria-label={nameOf('row', index)}
        aria-orientation="horizontal"
        aria-valuenow={position}
        aria-valuemin="0"
        aria-valuemax={grid.size.height}
        class="separator"
        class:selected={selected?.axis === 'row' && selected.index === index}
        onkeydown={(event) => {
          onKeydown(event, 'row', index);
        }}
        onfocus={() => {
          select('row', index);
        }}
        onpointerdown={(event) => {
          startDrag(event, 'row', index);
        }}
        onpointermove={drag}
        onpointerup={stopDrag}
        onpointercancel={stopDrag}
      >
        <line class="hit" x1="0" x2={grid.size.width} y1={position} y2={position} />
        <line class="mark" x1="0" x2={grid.size.width} y1={position} y2={position} />
      </g>
    {/each}
    {#each grid.columnSeparators as position, index (index)}
      <!-- A focusable separator is a widget (WAI-ARIA window splitter): moved by keys and pointer. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
      <g
        role="separator"
        tabindex="0"
        aria-label={nameOf('column', index)}
        aria-orientation="vertical"
        aria-valuenow={position}
        aria-valuemin="0"
        aria-valuemax={grid.size.width}
        class="separator column"
        class:selected={selected?.axis === 'column' && selected.index === index}
        onkeydown={(event) => {
          onKeydown(event, 'column', index);
        }}
        onfocus={() => {
          select('column', index);
        }}
        onpointerdown={(event) => {
          startDrag(event, 'column', index);
        }}
        onpointermove={drag}
        onpointerup={stopDrag}
        onpointercancel={stopDrag}
      >
        <line class="hit" x1={position} x2={position} y1="0" y2={grid.size.height} />
        <line class="mark" x1={position} x2={position} y1="0" y2={grid.size.height} />
      </g>
    {/each}
  </svg>

  <div class="roles">
    {#each grid.columnRoles as role, index (index)}
      <label>
        {format(fr.photoZones.columnRole, { index: index + 1 })}
        <select
          value={role}
          onchange={(event) => {
            grid = setColumnRole(grid, index, event.currentTarget.value as ColumnRole);
          }}
        >
          {#each COLUMN_ROLES as option (option)}
            <option value={option}>{fr.photoZones.roles[option]}</option>
          {/each}
        </select>
      </label>
    {/each}
  </div>

  <div class="tools">
    <button
      type="button"
      onclick={() => {
        add('column');
      }}>{fr.photoZones.addColumn}</button
    >
    <button
      type="button"
      onclick={() => {
        add('row');
      }}>{fr.photoZones.addRow}</button
    >
    <button
      type="button"
      disabled={selected === undefined}
      onclick={() => {
        if (selected !== undefined) {
          remove(selected.axis, selected.index);
        }
      }}>{fr.photoZones.removeSelected}</button
    >
  </div>

  <p role="status" class="sr-only">{announcement}</p>

  <div class="actions">
    {#if changed}
      <button
        type="button"
        class="primary"
        onclick={() => {
          onApply(grid);
        }}>{fr.photoZones.reread}</button
      >
    {:else}
      <button
        type="button"
        class="primary"
        onclick={() => {
          onApply(grid);
        }}>{fr.photoZones.confirm}</button
      >
    {/if}
    {#if onBack !== undefined}
      <button type="button" onclick={onBack}>{fr.photoZones.back}</button>
    {/if}
  </div>
</section>

<style>
  .help {
    color: var(--muted);
    font-size: var(--text-sm);
  }

  svg {
    display: block;
    width: 100%;
    max-height: 80vh;
    border: 1px solid var(--line);
    border-radius: var(--radius-md);
    touch-action: none;
  }

  .role {
    fill: var(--on-ink);
    paint-order: stroke;
    stroke: var(--ink);
    stroke-width: 3px;
    font-weight: var(--weight-bold);
    vector-effect: non-scaling-stroke;
  }

  /* The visible line, and a wide invisible one around it: a target of 44 px for a finger. */
  .separator {
    cursor: row-resize;
    outline: none;
  }

  .separator.column {
    cursor: col-resize;
  }

  .hit {
    stroke: transparent;
    stroke-width: var(--target);
    vector-effect: non-scaling-stroke;
  }

  .mark {
    stroke: var(--jade);
    stroke-width: 3px;
    vector-effect: non-scaling-stroke;
  }

  .separator.selected .mark,
  .separator:focus-visible .mark {
    stroke: var(--ochre);
    stroke-width: 6px;
  }

  .roles,
  .tools,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-3);
    margin: var(--space-3) 0;
  }

  .roles label {
    display: grid;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }

  select {
    min-height: var(--target);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
