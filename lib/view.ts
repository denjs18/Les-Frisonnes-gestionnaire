import { analyze, type Analysis } from "./analysis";
import type { Session } from "./state";
import { buildPlan, findStepIndex, type Plan, type Step } from "./steps";

/** Tout ce que l'interface affiche, calculé à partir de la session et du réglage « ignorer les * ». */
export interface View {
  analysis: Analysis;
  plan: Plan;
}

export function computeView(session: Session | null, ignoreStar: boolean): View | null {
  if (!session) return null;
  const analysis = analyze(session, { ignoreStar });
  return { analysis, plan: buildPlan(session, analysis) };
}

/** L'étape en cours d'après la position enregistrée (la première si on n'a pas encore commencé). */
export function currentStep(session: Session, view: View): Step | null {
  const { steps } = view.plan;
  return steps.length === 0 ? null : steps[findStepIndex(steps, session.position)];
}
