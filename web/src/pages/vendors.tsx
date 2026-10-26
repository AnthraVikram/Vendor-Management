import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api/client';

interface Category { id: string; name: string }
interface Vendor { id: string; name: string; phone: string; archived: boolean; locations: string[]; availability: string | null }

export function Vendors({ openVendor }: { openVendor: (id: string) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [location, setLocation] = useState('');
  const [availability, setAvailability] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');

  async function load(filters = { q, categoryId, location, availability, includeArchived }) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.categoryId) params.set('category_id', filters.categoryId);
    if (filters.location) params.set('location', filters.location);
    if (filters.availability) params.set('availability', filters.availability);
    if (filters.includeArchived) params.set('include_archived', 'true');
    const rows = await api<Vendor[]>(`/api/vendors?${params.toString()}`);
    setVendors(rows);
  }

  useEffect(() => {
    api<Category[]>('/api/categories').then(setCategories).catch((caught: Error) => setError(caught.message));
    load().catch((caught: Error) => setError(caught.message));
  }, []);

  function filter(event: FormEvent) {
    event.preventDefault();
    load().catch((caught: Error) => setError(caught.message));
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      let category = categories.find((item) => item.name.toLowerCase() === newCategory.trim().toLowerCase());
      if (!category && newCategory.trim()) {
        category = await api<Category>('/api/categories', { method: 'POST', body: JSON.stringify({ name: newCategory.trim() }) });
        setCategories((current) => [...current, category!]);
      }
      if (!category) {
        setError('A category is required.');
        return;
      }
      await api('/api/vendors', {
        method: 'POST',
        body: JSON.stringify({ name, phone, category_ids: [category.id], gst_registered: false }),
      });
      setName('');
      setPhone('');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the vendor');
    }
  }

  return (
    <section className="grid">
      <h1>Vendors</h1>
      <form className="card filters" onSubmit={filter} aria-label="Vendor filters">
        <label>
          Search
          <input aria-label="Search" value={q} onChange={(event) => setQ(event.target.value)} />
        </label>
        <label>
          Category
          <select aria-label="Category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            <option value="">Any</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          Location
          <input aria-label="Location" value={location} onChange={(event) => setLocation(event.target.value)} />
        </label>
        <label>
          Availability
          <select aria-label="Availability" value={availability} onChange={(event) => setAvailability(event.target.value)}>
            <option value="">Any</option>
            <option value="AVAILABLE">Available</option>
            <option value="LIMITED">Limited</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </select>
        </label>
        <label>
          <span>Include archived</span>
          <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
        </label>
        <button type="submit">Apply filters</button>
      </form>
      <form className="card grid" onSubmit={create}>
        <h2>Add vendor</h2>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label>Category<input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} /></label>
        <button type="submit">Save vendor</button>
      </form>
      {error ? <p className="error">{error}</p> : null}
      <div className="grid">
        {vendors.map((vendor) => (
          <article className="card" key={vendor.id}>
            <button type="button" onClick={() => openVendor(vendor.id)}>{vendor.name}</button>
            <p>{vendor.phone} {vendor.locations.join(', ')} {vendor.archived ? '(archived)' : ''}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
