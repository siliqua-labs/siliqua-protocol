import { Notice } from "./primitives";
import ui from "./ui.module.css";

export type LegalSection = { heading: string; paragraphs: string[] };

export function LegalPage({
  title,
  sections,
}: {
  title: string;
  sections: LegalSection[];
}) {
  return (
    <div className={ui.page}>
      <h1>
        {title}
        <span style={{ color: "var(--em)" }}>.</span>
      </h1>
      <div style={{ marginTop: 24 }}>
        <Notice>
          Draft text. It has not been reviewed by counsel and is not legal
          advice.
        </Notice>
      </div>
      {sections.map((s, i) => (
        <div key={s.heading}>
          <h3 style={{ margin: "32px 0 8px", fontSize: 18 }}>
            {i + 1}. {s.heading}
          </h3>
          {s.paragraphs.map((text) => (
            <p key={text}>{text}</p>
          ))}
        </div>
      ))}
    </div>
  );
}
