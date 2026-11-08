import type { IslandAchievements, IslandScene } from '../../domain/game/island';
import { format, formatCount } from '../../i18n/format';
import fr from '../../i18n/fr.json';

/** Everything drawn on the island, as short words for its text alternative. */
function drawnItems(scene: IslandScene, achievements: IslandAchievements): string[] {
  const { shape, decors } = scene;
  return [
    formatCount(fr.island.parcels, shape.parcels),
    ...(shape.stream ? [fr.island.stream] : []),
    ...decors.map(({ id }) => fr.island.decors[id]),
    ...(achievements.fireflies > 0
      ? [formatCount(fr.island.fireflies, achievements.fireflies)]
      : []),
    ...(achievements.floatingLanterns > 0
      ? [formatCount(fr.island.lanterns, achievements.floatingLanterns)]
      : []),
  ];
}

/** The text alternative of the drawn island: what it shows, then what comes next. */
export function islandLabel(
  level: number,
  scene: IslandScene,
  achievements: IslandAchievements,
): string {
  const items = drawnItems(scene, achievements).join(', ');
  const main =
    scene.palette === 'spring'
      ? format(fr.island.label, { level, items })
      : format(fr.island.labelWithPalette, {
          level,
          items,
          palette: fr.island.palettes[scene.palette],
        });
  const { next } = scene;
  return next === undefined
    ? main
    : `${main} ${format(fr.island.nextItem, { name: fr.island.decors[next.id], level: next.level })}`;
}
