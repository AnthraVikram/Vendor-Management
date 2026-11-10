// Feature 005 FR-038: where the page sits. Earlier parts link back; the last part is the current page.
export function Breadcrumbs({ trail }: { trail: { label: string; href?: string }[] }) {
  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((part, index) => (
          <li key={part.label}>
            {index > 0 ? <span className="crumb-separator" aria-hidden="true">/</span> : null}
            {index < trail.length - 1 && part.href ? <a href={part.href}>{part.label}</a> : <span aria-current="page">{part.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
