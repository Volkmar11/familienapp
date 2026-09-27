import StepLayout, { PickRow } from "./StepLayout.jsx";
import { S } from "../ui.jsx";
import { STARTER_REWARDS } from "../../config/starterContent.js";

export default function RewardsStep({ nav, rewards, onChange }) {
  const set = (key, patch) => onChange({ ...rewards, [key]: { ...rewards[key], ...patch } });
  const allSelected = STARTER_REWARDS.every((r) => rewards[r.key].selected);
  const setAll = (selected) => onChange(Object.fromEntries(Object.entries(rewards).map(([k, v]) => [k, { ...v, selected }])));
  return (
    <StepLayout {...nav} title="Belohnungen auswählen" intro="Wofür können Punkte eingelöst werden? Die Punktkosten könnt ihr anpassen.">
      <button type="button" style={{ ...S.link, paddingLeft: 0 }} onClick={() => setAll(!allSelected)}>{allSelected ? "Alle abwählen" : "Alle auswählen"}</button>
      <div style={{ ...S.card, marginTop: 10, paddingTop: 8, paddingBottom: 8 }}>
        {STARTER_REWARDS.map((r) => (
          <PickRow key={r.key} id={`reward-${r.key}`} icon={r.icon} title={r.title} pointsLabel="Punktkosten"
            selected={rewards[r.key].selected} points={rewards[r.key].points}
            onToggle={(v) => set(r.key, { selected: v })} onPoints={(v) => set(r.key, { points: v })} />
        ))}
      </div>
    </StepLayout>
  );
}
