import { KeyboardEvent, useEffect, useState } from 'react';
import { api } from '../api/client';
import { ArchivedBadge } from '../badges';

// Feature 005 FR-037: the header search. It asks the server 250 ms after the last keystroke, once 2 or more characters
// are typed; a slower answer for older text is ignored.

interface Results {
  vendors: { id: string; name: string; phone: string; archived: boolean }[];
  projects: { id: string; name: string; client_name: string | null; archived: boolean }[];
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [error, setError] = useState('');
  const text = query.trim();

  useEffect(() => {
    setResults(null);
    setError('');
    if (text.length < 2) return;
    let current = true;
    const timer = setTimeout(() => {
      api<Results>(`/api/search?q=${encodeURIComponent(text)}`)
        .then((found) => current && setResults(found))
        .catch((caught: Error) => current && setError(caught.message));
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text]);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') setQuery('');
  }

  const empty = results !== null && results.vendors.length === 0 && results.projects.length === 0;
  return (
    <div className="global-search" onKeyDown={onKeyDown}>
      <input
        type="search"
        aria-label="Search vendors and projects"
        placeholder="Search vendors and projects"
        maxLength={100}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {results || error ? (
        <div className="search-results" role="region" aria-label="Search results">
          {error ? <p className="error">{error}</p> : null}
          {empty ? <p className="empty">No vendors or projects match</p> : null}
          {results && results.vendors.length > 0 ? (
            <div role="group" aria-label="Vendors">
              <p className="search-group">Vendors</p>
              <ul>
                {results.vendors.map((vendor) => (
                  <li key={vendor.id}>
                    <a href={`#/vendors/${vendor.id}`} onClick={() => setQuery('')}>
                      <strong>{vendor.name}</strong> <span className="meta">{vendor.phone}</span>
                      {vendor.archived ? <> <ArchivedBadge /></> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {results && results.projects.length > 0 ? (
            <div role="group" aria-label="Projects">
              <p className="search-group">Projects</p>
              <ul>
                {results.projects.map((project) => (
                  <li key={project.id}>
                    <a href={`#/projects/${project.id}`} onClick={() => setQuery('')}>
                      <strong>{project.name}</strong> {project.client_name ? <span className="meta">{project.client_name}</span> : null}
                      {project.archived ? <> <ArchivedBadge /></> : null}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
