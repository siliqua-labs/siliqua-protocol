import { Notice } from "./primitives";
import ui from "./ui.module.css";

export function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: string[];
}) {
  return (
    <div className={ui.page}>
      <h1>
        {title}
        <span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <div style={{ marginTop: 24 }}>
        <Notice>
          Placeholder text. To be replaced by counsel-approved copy.
        </Notice>
      </div>
      {sections.map((s, i) => (
        <div key={s}>
          <h3 style={{ margin: "32px 0 8px", fontSize: 18 }}>
            {i + 1}. {s}
          </h3>
          <p>Section text to be provided.</p>
        </div>
      ))}
    </div>
  );
}
