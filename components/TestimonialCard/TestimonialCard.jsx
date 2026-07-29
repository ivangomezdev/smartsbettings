import Image from "next/image";
import { shouldSkipImageOptimization } from "../../lib/image.js";

export function TestimonialCard({ quote, name, role, avatar }) {
  return (
    <article className="testimonial-card">
      <div className="testimonial-card__top">
        <div className="testimonial-card__stars" aria-label="5 de 5 estrellas">
          ★ ★ ★ ★ ★
        </div>
        <span className="testimonial-card__verified">
          <span className="testimonial-card__verified-dot" aria-hidden="true" />
          Verificada
        </span>
      </div>
      <span className="testimonial-card__quote-mark" aria-hidden="true">
        “
      </span>
      <blockquote className="testimonial-card__quote">{quote}</blockquote>
      <div className="testimonial-card__person">
        <span className="testimonial-card__avatar">
          <Image
            className="testimonial-card__avatar-image"
            src={avatar}
            alt=""
            width={256}
            height={256}
            sizes="2.75rem"
            unoptimized={shouldSkipImageOptimization}
          />
        </span>
        <div className="testimonial-card__identity">
          <p className="testimonial-card__name">{name}</p>
          <p className="testimonial-card__role">{role}</p>
        </div>
        <span className="testimonial-card__brand-mark" aria-hidden="true">
          ∞
        </span>
      </div>
    </article>
  );
}
