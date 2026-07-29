export function TestimonialCard({ quote, name, role, initials }) {
  return (
    <article className="testimonial-card">
      <div className="testimonial-card__stars" aria-label="5 de 5 estrellas">
        ★ ★ ★ ★ ★
      </div>
      <blockquote className="testimonial-card__quote">“{quote}”</blockquote>
      <div className="testimonial-card__person">
        <span className="testimonial-card__avatar" aria-hidden="true">
          {initials}
        </span>
        <div>
          <p className="testimonial-card__name">{name}</p>
          <p className="testimonial-card__role">{role}</p>
        </div>
      </div>
    </article>
  );
}
