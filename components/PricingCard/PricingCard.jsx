import { Button } from "../Button/Button.jsx";

export function PricingCard({
  eyebrow,
  name,
  price,
  suffix,
  description,
  features,
  featured = false,
}) {
  return (
    <article className={`pricing-card${featured ? " pricing-card--featured" : ""}`}>
      {featured ? <span className="pricing-card__badge">Más elegido</span> : null}
      <p className="pricing-card__eyebrow">{eyebrow}</p>
      <h3 className="pricing-card__name">{name}</h3>
      <p className="pricing-card__price">
        <span className="pricing-card__amount">{price}</span>
        <span className="pricing-card__suffix">{suffix}</span>
      </p>
      <p className="pricing-card__description">{description}</p>
      <ul className="pricing-card__features">
        {features.map((feature) => (
          <li className="pricing-card__feature" key={feature}>
            <span className="pricing-card__check" aria-hidden="true">
              ✓
            </span>
            {feature}
          </li>
        ))}
      </ul>
      <Button href="#acceso" variant={featured ? "primary" : "secondary"}>
        Solicitar acceso
      </Button>
    </article>
  );
}
