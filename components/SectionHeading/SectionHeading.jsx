export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  size = "default",
}) {
  return (
    <div className={`section-heading section-heading--${align}`}>
      <p className="section-heading__eyebrow">{eyebrow}</p>
      <h2
        className={`section-heading__title section-heading__title--${size}`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`section-heading__description section-heading__description--${size}`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}
