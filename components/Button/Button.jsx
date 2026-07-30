export function Button({
  children,
  href,
  variant = "primary",
  ariaLabel,
}) {
  return (
    <a
      className={`button button--${variant}`}
      href={href}
      aria-label={ariaLabel}
    >
      <span className="button__label">{children}</span>
      <span className="button__arrow" aria-hidden="true" />
    </a>
  );
}
