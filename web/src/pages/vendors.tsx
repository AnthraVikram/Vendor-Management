import { FormEvent, useEffect, useState } from 'react';
import { ApiError, api } from '../api/client';
import { ArchivedBadge, AvailabilityBadge } from '../badges';

interface Category { id: string; name: string }
interface Project { id: string; name: string }
interface Vendor { id: string; name: string; phone: string; archived: boolean; locations: string[]; availability: string | null }
interface DuplicatePhone { body: Record<string, unknown>; matches: { id: string; name: string }[] }

function list(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function Vendors({ openVendor }: { openVendor: (id: string) => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [location, setLocation] = useState('');
  const [availability, setAvailability] = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [alternatePhone, setAlternatePhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [locationsText, setLocationsText] = useState('');
  const [servicesText, setServicesText] = useState('');
  const [materialsText, setMaterialsText] = useState('');
  const [gstRegistered, setGstRegistered] = useState(false);
  const [gstin, setGstin] = useState('');
  const [gstLegalName, setGstLegalName] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [newAvailability, setNewAvailability] = useState('');
  const [manpowerNote, setManpowerNote] = useState('');
  const [rateLabel, setRateLabel] = useState('');
  const [rateAmount, setRateAmount] = useState('');
  const [rateUnit, setRateUnit] = useState('');
  const [duplicate, setDuplicate] = useState<DuplicatePhone | null>(null);
  const [error, setError] = useState('');

  async function load(filters = { q, categoryId, location, availability, projectId, includeArchived }) {
    const params = new URLSearchParams();
    if (filters.q) params.set('q', filters.q);
    if (filters.categoryId) params.set('category_id', filters.categoryId);
    if (filters.location) params.set('location', filters.location);
    if (filters.availability) params.set('availability', filters.availability);
    if (filters.projectId) params.set('project_id', filters.projectId);
    if (filters.includeArchived) params.set('include_archived', 'true');
    const rows = await api<Vendor[]>(`/api/vendors?${params.toString()}`);
    setVendors(rows);
  }

  useEffect(() => {
    api<Category[]>('/api/categories').then(setCategories).catch((caught: Error) => setError(caught.message));
    api<Project[]>('/api/projects?include_archived=true').then(setProjects).catch((caught: Error) => setError(caught.message));
    load().catch((caught: Error) => setError(caught.message));
  }, []);

  function filter(event: FormEvent) {
    event.preventDefault();
    load().catch((caught: Error) => setError(caught.message));
  }

  function resetForm() {
    for (const clear of [
      setName, setPhone, setContactPerson, setAlternatePhone, setEmail, setAddress, setLocationsText, setServicesText,
      setMaterialsText, setGstin, setGstLegalName, setTeamSize, setNewAvailability, setManpowerNote, setRateLabel,
      setRateAmount, setRateUnit,
    ]) {
      clear('');
    }
    setGstRegistered(false);
  }

  async function submitVendor(body: Record<string, unknown>) {
    try {
      await api('/api/vendors', { method: 'POST', body: JSON.stringify(body) });
    } catch (caught) {
      if (caught instanceof ApiError && caught.body.code === 'PHONE_IN_USE') {
        const matches = (caught.body as { matches?: DuplicatePhone['matches'] }).matches ?? [];
        setDuplicate({ body, matches });
        return;
      }
      throw caught;
    }
    setDuplicate(null);
    resetForm();
    await load();
  }

  async function saveAnyway() {
    if (!duplicate) return;
    setError('');
    try {
      await submitVendor({ ...duplicate.body, confirm_duplicate_phone: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the vendor');
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    setError('');
    setDuplicate(null);
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
      const body: Record<string, unknown> = { name, phone, category_ids: [category.id], gst_registered: gstRegistered };
      if (contactPerson.trim()) body.contact_person = contactPerson.trim();
      if (alternatePhone.trim()) body.alternate_phone = alternatePhone.trim();
      if (email.trim()) body.email = email.trim();
      if (address.trim()) body.address = address.trim();
      if (list(locationsText).length) body.locations = list(locationsText);
      if (list(servicesText).length) body.services = list(servicesText);
      if (list(materialsText).length) body.materials = list(materialsText);
      if (gstRegistered) body.gstin = gstin.trim();
      if (gstLegalName.trim()) body.gst_legal_name = gstLegalName.trim();
      if (teamSize.trim()) body.team_size = Number(teamSize);
      if (newAvailability) body.availability = newAvailability;
      if (manpowerNote.trim()) body.manpower_note = manpowerNote.trim();
      if (rateLabel.trim() || rateAmount.trim() || rateUnit.trim()) {
        body.rates = [{ label: rateLabel.trim(), amount: rateAmount.trim(), unit: rateUnit.trim() }];
      }
      await submitVendor(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the vendor');
    }
  }

  return (
    <section className="grid">
      <header className="page-header">
        <div className="page-title">
          <p className="eyebrow">Directory</p>
          <h1>Vendors</h1>
          <p className="page-subtitle">Find vendors by name, category, location, availability, or project, and add new ones.</p>
        </div>
        <div className="page-actions">
          <a className="button secondary" href="#/vendors/import">Import vendors</a>
        </div>
      </header>
      <form className="card filter-bar" onSubmit={filter} aria-label="Vendor filters">
        <label className="search">
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
          Linked project
          <select aria-label="Linked project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Any</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <label className="check">
            <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
            <span>Include archived</span>
          </label>
          <button type="submit">Apply filters</button>
        </div>
      </form>
      <form className="card form-2col" onSubmit={create} aria-label="Add vendor">
        <h2>Add vendor</h2>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
        <label>Category<input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} /></label>
        <label>Contact person<input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} /></label>
        <label>Alternate phone<input value={alternatePhone} onChange={(event) => setAlternatePhone(event.target.value)} /></label>
        <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label className="span-2">Address<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
        <p className="form-section-title">Coverage</p>
        <label>Locations<input placeholder="Comma-separated" value={locationsText} onChange={(event) => setLocationsText(event.target.value)} /></label>
        <label>Services<input placeholder="Comma-separated" value={servicesText} onChange={(event) => setServicesText(event.target.value)} /></label>
        <label className="span-2">Materials<input placeholder="Comma-separated" value={materialsText} onChange={(event) => setMaterialsText(event.target.value)} /></label>
        <p className="form-section-title">GST</p>
        <label className="check span-2">
          <input type="checkbox" checked={gstRegistered} onChange={(event) => setGstRegistered(event.target.checked)} />
          <span>GST registered</span>
        </label>
        <label>GSTIN<input value={gstin} onChange={(event) => setGstin(event.target.value)} /></label>
        <label>GST legal name<input value={gstLegalName} onChange={(event) => setGstLegalName(event.target.value)} /></label>
        <p className="form-section-title">Capacity and rates</p>
        <label>Team size<input inputMode="numeric" value={teamSize} onChange={(event) => setTeamSize(event.target.value)} /></label>
        <label>
          Manpower availability
          <select aria-label="Manpower availability" value={newAvailability} onChange={(event) => setNewAvailability(event.target.value)}>
            <option value="">Not set</option>
            <option value="AVAILABLE">Available</option>
            <option value="LIMITED">Limited</option>
            <option value="UNAVAILABLE">Unavailable</option>
          </select>
        </label>
        <label>Manpower note<input value={manpowerNote} onChange={(event) => setManpowerNote(event.target.value)} /></label>
        <label>Rate label<input value={rateLabel} onChange={(event) => setRateLabel(event.target.value)} /></label>
        <label>Rate amount<input inputMode="decimal" placeholder="1500.00" value={rateAmount} onChange={(event) => setRateAmount(event.target.value)} /></label>
        <label>Rate unit<input value={rateUnit} onChange={(event) => setRateUnit(event.target.value)} /></label>
        <div className="form-actions">
          <button type="submit">Save vendor</button>
        </div>
      </form>
      {duplicate ? (
        <div className="card notice-card" role="alert">
          <p className="notice-warning">Another vendor already uses this phone number: {duplicate.matches.map((match) => match.name).join(', ')}.</p>
          <button type="button" onClick={saveAnyway}>Save anyway</button>
        </div>
      ) : null}
      {error ? <p className="error form-error" role="alert">{error}</p> : null}
      <div className="section">
        <div className="section-heading">
          <div>
            <h2>Vendor list</h2>
            <span className="count-badge">{vendors.length}</span>
          </div>
        </div>
        {vendors.length > 0 ? (
          <div className="table-wrap list-table">
            <table aria-label="Vendors">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Phone</th>
                  <th>Locations</th>
                  <th>Availability</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id}>
                    <td data-label="Vendor"><button type="button" className="link-button" onClick={() => openVendor(vendor.id)}>{vendor.name}</button></td>
                    <td data-label="Phone">{vendor.phone}</td>
                    <td data-label="Locations">{vendor.locations.join(', ')}</td>
                    <td data-label="Availability"><AvailabilityBadge availability={vendor.availability} /></td>
                    <td data-label="Status">{vendor.archived ? <ArchivedBadge /> : <span className="muted">Active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty">No vendors match these filters.</p>
        )}
      </div>
    </section>
  );
}
