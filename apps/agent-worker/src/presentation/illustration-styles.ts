import { canonicalStoryboardStyle } from '@openscience/domain';
import { loadInstalledMediaSkills, mergeDesignSkillUsage, type InstalledMediaSkills } from '../skills/installed-media-skills';

/** Load each requested scene style once without repeating shared scientific/design guidance. */
export function loadIllustrationStyleSkills(styles: readonly string[], instruction: string,
  stage: 'plan' | 'review'): InstalledMediaSkills {
  const selected = [...new Set(styles.map(canonicalStoryboardStyle))]
    .map(style => loadInstalledMediaSkills(style, instruction, stage));
  if (selected.length === 1) return selected[0]!;
  const blocks = [...new Set(selected.flatMap(skills => skills.instructions.split(/\n\n(?=SOURCE: )/u)))];
  return {
    instructions: 'Apply each style reference only to scenes assigned that style in perSceneStyle; never blend different scene styles.\n' + blocks.join('\n\n'),
    usage: mergeDesignSkillUsage(...selected.map(skills => skills.usage)),
  };
}
