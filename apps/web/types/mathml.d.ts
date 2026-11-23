import "react";

// React's JSX types omit MathML. Only the elements the methodology page uses.
type MathProps = import("react").HTMLAttributes<HTMLElement> & {
  display?: "block" | "inline";
};

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      math: MathProps;
      mrow: MathProps;
      mi: MathProps;
      mn: MathProps;
      mo: MathProps;
      msub: MathProps;
      msup: MathProps;
      msubsup: MathProps;
      mfrac: MathProps;
    }
  }
}
