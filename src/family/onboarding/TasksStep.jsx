import StepLayout, { PickRow } from "./StepLayout.jsx";
import { S, C } from "../ui.jsx";
import { STARTER_CATEGORIES, STARTER_TASKS } from "../../config/starterContent.js";

export default function TasksStep({ nav, tasks, onChange }) {
  const set = (key, patch) => onChange({ ...tasks, [key]: { ...tasks[key], ...patch } });
  const allSelected = STARTER_TASKS.every((t) => tasks[t.key].selected);
  const setAll = (selected) => onChange(Object.fromEntries(Object.entries(tasks).map(([k, v]) => [k, { ...v, selected }])));
  return (
    <StepLayout {...nav} title="Aufgaben auswählen" intro="Wählt passende Startaufgaben und passt die Punkte an. Weitere Aufgaben könnt ihr später hinzufügen.">
      <button type="button" style={{ ...S.link, paddingLeft: 0 }} onClick={() => setAll(!allSelected)}>{allSelected ? "Alle abwählen" : "Alle auswählen"}</button>
      {STARTER_CATEGORIES.map((cat) => (
        <div key={cat.key} style={{ ...S.card, marginTop: 10, paddingTop: 12, paddingBottom: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 16, color: C.accent }}><span aria-hidden="true">{cat.icon} </span>{cat.name}</div>
          {STARTER_TASKS.filter((t) => t.category === cat.key).map((t) => (
            <PickRow key={t.key} id={`task-${t.key}`} icon={t.icon} title={t.title} pointsLabel="Punkte"
              selected={tasks[t.key].selected} points={tasks[t.key].points}
              onToggle={(v) => set(t.key, { selected: v })} onPoints={(v) => set(t.key, { points: v })} />
          ))}
        </div>
      ))}
    </StepLayout>
  );
}
