/**
 * Render source prose, preserving the paragraph breaks the ingest pipeline kept.
 *
 * The text is plain — markup was stripped at ingest — so it is rendered as
 * text nodes rather than raw HTML.
 */
export const Prose = ({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) => (
  <div className={`space-y-4 text-sm leading-relaxed text-muted ${className}`}>
    {text.split("\n\n").map((paragraph, index) => (
      <p key={index}>{paragraph}</p>
    ))}
  </div>
);
