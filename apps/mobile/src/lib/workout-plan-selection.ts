export type WorkoutPlanSectionSource = {
  exercises?: {
    section_name?: string | null;
  }[] | null;
} | null;

export function getPlanSectionNames(plan?: WorkoutPlanSectionSource): string[] {
  const values = new Set<string>();
  for (const exercise of plan?.exercises || []) {
    if (exercise.section_name?.trim()) values.add(exercise.section_name.trim());
  }
  return Array.from(values);
}

export function resolveSelectedSection(plan?: WorkoutPlanSectionSource, preferredSection?: string | null): string | null {
  const sections = getPlanSectionNames(plan);
  if (sections.length === 0) return null;
  if (preferredSection && sections.includes(preferredSection)) return preferredSection;
  return sections[0];
}
