// Mehrstufiger Einrichtungsassistent. Alles bleibt im React-State, bis am Ende
// eine einzige atomare RPC die Familie anlegt. Die requestId ist pro Wizard fest,
// damit ein erneuter Klick nach Netzwerkfehler keine zweite Familie erzeugt.
import { useState } from "react";
import { getFamilyClient } from "../../lib/supabaseFamily.js";
import {
  initialOnboardingState, validateFamilyName, validateChildren, validatePin, validatePoints,
  buildOnboardingPayload, createFamilyWithOnboarding,
} from "../../lib/onboarding.js";
import { LIMITS } from "./options.js";
import { Shell, Spinner } from "../ui.jsx";
import WelcomeStep from "./WelcomeStep.jsx";
import FamilyStep from "./FamilyStep.jsx";
import ChildrenStep from "./ChildrenStep.jsx";
import PinStep from "./PinStep.jsx";
import TasksStep from "./TasksStep.jsx";
import RewardsStep from "./RewardsStep.jsx";
import SettingsStep from "./SettingsStep.jsx";
import IntroStep from "./IntroStep.jsx";
import FinishStep from "./FinishStep.jsx";

const STEPS = ["welcome", "family", "children", "pin", "tasks", "rewards", "settings", "intro"];
const TOTAL = STEPS.length - 1; // Fortschritt ohne Begrüßung: 7 Schritte

const VALIDATORS = {
  family: (s) => validateFamilyName(s.familyName),
  children: (s) => validateChildren(s.children),
  pin: (s) => validatePin(s.pin, s.pin2),
  tasks: (s) => validatePoints(s.tasks, LIMITS.TASK_POINTS_MAX, "Aufgaben"),
  rewards: (s) => validatePoints(s.rewards, LIMITS.REWARD_POINTS_MAX, "Belohnungen"),
};

export default function OnboardingWizard({ onCreated, onFinish, onLogout, onAccount, onJoinWithCode }) {
  const [state, setState] = useState(initialOnboardingState);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [requestId] = useState(() => crypto.randomUUID());
  const [created, setCreated] = useState(null); // { familyId, familyName, kids }

  const patch = (p) => { setState((s) => ({ ...s, ...p })); setError(""); };
  const stepKey = STEPS[index];
  const goBack = () => { setError(""); setIndex((i) => Math.max(0, i - 1)); };
  const goNext = () => {
    const msg = VALIDATORS[stepKey]?.(state) || "";
    if (msg) { setError(msg); return; }
    setError("");
    setIndex((i) => Math.min(STEPS.length - 1, i + 1));
    window.scrollTo?.(0, 0);
  };

  const submit = async () => {
    if (busy) return;
    for (const key of Object.keys(VALIDATORS)) {
      const msg = VALIDATORS[key](state);
      if (msg) { setError(msg); setIndex(STEPS.indexOf(key)); return; }
    }
    setBusy(true); setError("");
    const r = await createFamilyWithOnboarding(getFamilyClient(), requestId, buildOnboardingPayload(state));
    if (!r.ok) { setBusy(false); setError(r.error); return; }
    const summary = { familyId: r.familyId, familyName: state.familyName.trim(), kids: state.children.map((c) => ({ ...c, name: c.name.trim() })) };
    setState((s) => ({ ...s, pin: "", pin2: "" })); // PIN nach Erfolg sofort verwerfen
    setCreated(summary);
    setBusy(false);
    onCreated?.(r.familyId);
  };

  if (created) return <FinishStep familyName={created.familyName} kids={created.kids} onStart={() => onFinish?.(created.familyId)} />;
  if (busy) return <Shell><Spinner label="Eure Familie wird eingerichtet …" /></Shell>;

  const nav = {
    step: index, total: TOTAL, error, busy,
    onBack: index > 0 ? goBack : undefined,
    onNext: stepKey === "intro" ? submit : goNext,
    nextLabel: stepKey === "intro" ? "Familie einrichten" : "Weiter",
  };
  switch (stepKey) {
    case "welcome": return <WelcomeStep onNext={goNext} onLogout={onLogout} onAccount={onAccount} onJoinWithCode={onJoinWithCode} />;
    case "family": return <FamilyStep nav={nav} value={state.familyName} onChange={(v) => patch({ familyName: v })} />;
    case "children": return <ChildrenStep nav={nav} kids={state.children} onChange={(v) => patch({ children: v })} />;
    case "pin": return <PinStep nav={nav} pin={state.pin} pin2={state.pin2} onChange={(k, v) => patch({ [k]: v })} />;
    case "tasks": return <TasksStep nav={nav} tasks={state.tasks} onChange={(v) => patch({ tasks: v })} />;
    case "rewards": return <RewardsStep nav={nav} rewards={state.rewards} onChange={(v) => patch({ rewards: v })} />;
    case "settings": return <SettingsStep nav={nav} settings={state.settings} onChange={(v) => patch({ settings: v })} />;
    default: return <IntroStep nav={nav} />;
  }
}
