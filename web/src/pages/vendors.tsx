import { FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api, apiWithHeaders } from '../api/client';
import { ArchivedBadge, AvailabilityBadge } from '../badges';
import { ListView, readListPrefs, writeListPrefs } from '../list-prefs';
import { notify } from '../notify';
import { countHeader, ViewSwitch } from '../ui/list-controls';
import { Skeleton } from '../ui/skeleton';
import { useUnsavedGuard } from '../ui/unsaved-guard';

interface Category { id: string; name: string }
interface Project { id: string; name: string }
interface Vendor {
  id: string;
  name: string;
  phone: string;
  archived: boolean;
  locations: string[];
  availability: string | null;
  contact_person?: string | null;
  categories?: { id: string; name: string }[];
  project_count?: number;
}
interface DuplicatePhone { body: Record<string, unknown>; matches: { id: string; name: string }[] }

// Feature 005 FR-004: list sorts; ties keep name order.
const SORTS = [
  { value: 'name', label: 'Name' },
  { value: 'category', label: 'Category' },
  { value: 'availability', label: 'Availability' },
  { value: 'project_count', label: 'Most projects' },
] as const;
const PREFS_KEY = 'vm.list.vendors';
const PAGE_SIZE = 50;

function list(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

// `add` and `view` come from dashboard links (#/vendors?add=1, #/vendors?view=archived; Feature 005 FR-021, FR-024).
export function Vendors({ openVendor, add = false, view: linkedView }: { openVendor: (id: string) => void; add?: boolean; view?: ListView }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [q, setQ] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [location, setLocation] = useState('');
  const [availability, setAvailability] = useState('');
  const [prefs, setPrefs] = useState(() => {
    const remembered = readListPrefs(PREFS_KEY, SORTS.map((option) => option.value), { sort: 'name', view: 'active' });
    return linkedView ? { ...remembered, view: linkedView } : remembered;
  });
  const [counts, setCounts] = useState({ total: 0, active: 0, archived: 0 });
  const [formOpen, setFormOpen] = useState(add);
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
  const [loaded, setLoaded] = useState(false);
  // Whether the list on screen came from a search or filter, so an empty list gets the right message (FR-031).
  const [narrowed, setNarrowed] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const formFields = [
    name, phone, newCategory, contactPerson, alternatePhone, email, address, locationsText, servicesText, materialsText, gstin,
    gstLegalName, teamSize, newAvailability, manpowerNote, rateLabel, rateAmount, rateUnit,
  ];
  const dirty = formOpen && (gstRegistered || formFields.some((value) => value.trim() !== ''));
  useUnsavedGuard(dirty);

  // Loads the first page, or the next one with `more`. Search and filters are read from the form; sort and view
  // from the remembered choice (FR-005).
  async function load(options: { more?: boolean; view?: ListView; sort?: string } = {}) {
    const view = options.view ?? prefs.view;
    const sort = options.sort ?? prefs.sort;
    const offset = options.more ? vendors.length : 0;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (categoryId) params.set('category_id', categoryId);
    if (location) params.set('location', location);
    if (availability) params.set('availability', availability);
    if (projectId) params.set('project_id', projectId);
    if (view !== 'active') params.set('view', view);
    if (sort !== 'name') params.set('sort', sort);
    params.set('limit', String(PAGE_SIZE));
    if (offset) params.set('offset', String(offset));
    const { data: rows, headers } = await apiWithHeaders<Vendor[]>(`/api/vendors?${params.toString()}`);
    const shown = options.more ? [...vendors, ...rows] : rows;
    setVendors(shown);
    setCounts({
      total: countHeader(headers, 'X-Total-Count', shown.length),
      active: countHeader(headers, 'X-Active-Count', view === 'active' ? shown.length : 0),
      archived: countHeader(headers, 'X-Archived-Count', view === 'archived' ? shown.length : 0),
    });
    setNarrowed(Boolean(q || categoryId || location || availability || projectId));
    setLoaded(true);
  }

  function changePrefs(next: { view?: ListView; sort?: string }) {
    const updated = { ...prefs, ...next };
    setPrefs(updated);
    writeListPrefs(PREFS_KEY, updated);
    load(next).catch((caught: Error) => setError(caught.message));
  }

  function openForm() {
    setFormOpen(true);
  }

  useEffect(() => {
    if (!formOpen) return;
    nameInput.current?.focus();
    nameInput.current?.scrollIntoView?.({ block: 'nearest' });
  }, [formOpen]);

  function closeForm() {
    if (dirty && !window.confirm('You have unsaved changes. Discard them?')) return;
    resetForm();
    setNewCategory('');
    setDuplicate(null);
    setFormOpen(false);
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
    notify('Vendor added');
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
          <button type="button" onClick={openForm} aria-expanded={formOpen} aria-controls="add-vendor-form">Add vendor</button>
          <a className="button secondary" href="#/vendors/import">Import vendors</a>
        </div>
      </header>
      <form className="card filter-bar" onSubmit={filter} aria-label="Vendor filters">
        <label className="search">
          Search
          <input type="search" aria-label="Search" value={q} onChange={(event) => setQ(event.target.value)} />
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
          <button type="submit">Apply filters</button>
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
            <span className="count-badge">{counts.total === 1 ? '1 vendor' : `${counts.total} vendors`}</span>
          </div>
          <div className="list-controls">
            <ViewSwitch view={prefs.view} active={counts.active} archived={counts.archived} onChange={(view) => changePrefs({ view })} />
            <label className="sort-select">
              Sort by
              <select value={prefs.sort} onChange={(event) => changePrefs({ sort: event.target.value })}>
                {SORTS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {prefs.view === 'archived' ? <p className="notice archived-note">Archived records are kept and can be restored.</p> : null}
        {!loaded ? (
          <Skeleton label="Loading vendors" />
        ) : vendors.length > 0 ? (
          <div className="table-wrap list-table">
            <table aria-label="Vendors">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>Contact person</th>
                  <th>Phone</th>
                  <th>Categories</th>
                  <th>Locations</th>
                  <th>Availability</th>
                  <th>Projects</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map((vendor) => (
                  <tr key={vendor.id} className={vendor.archived ? 'is-archived' : undefined}>
                    <td data-label="Vendor"><button type="button" className="link-button" onClick={() => openVendor(vendor.id)}>{vendor.name}</button></td>
                    <td data-label="Contact person">{vendor.contact_person ?? ''}</td>
                    <td data-label="Phone">{vendor.phone}</td>
                    <td data-label="Categories">{(vendor.categories ?? []).map((category) => category.name).join(', ')}</td>
                    <td data-label="Locations">{vendor.locations.join(', ')}</td>
                    <td data-label="Availability"><AvailabilityBadge availability={vendor.availability} /></td>
                    <td data-label="Projects">{vendor.project_count === 1 ? '1 project' : `${vendor.project_count ?? 0} projects`}</td>
                    <td data-label="Status">{vendor.archived ? <ArchivedBadge /> : <span className="muted">Active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {vendors.length < counts.total ? (
              <div className="show-more">
                <button type="button" className="secondary" onClick={() => load({ more: true }).catch((caught: Error) => setError(caught.message))}>Show more</button>
              </div>
            ) : null}
          </div>
        ) : narrowed ? (
          <p className="empty">No vendors match your search and filters</p>
        ) : (
          <div className="empty-box">
            <p className="empty">No vendors have been added yet</p>
            <div className="form-actions">
              <button type="button" onClick={openForm}>Add a vendor</button>
              <a className="button secondary" href="#/vendors/import">Import spreadsheet</a>
            </div>
          </div>
        )}
      </div>
      {formOpen ? (
        <form id="add-vendor-form" className="card form-2col" onSubmit={create} aria-label="Add vendor">
          <h2 className="span-2">Add vendor</h2>
          <fieldset className="form-section span-2">
            <legend>Contact</legend>
            <label>Name<input ref={nameInput} value={name} onChange={(event) => setName(event.target.value)} /></label>
            <label>Phone<input value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
            <label>Contact person<input value={contactPerson} onChange={(event) => setContactPerson(event.target.value)} /></label>
            <label>Alternate phone<input value={alternatePhone} onChange={(event) => setAlternatePhone(event.target.value)} /></label>
            <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Address<input value={address} onChange={(event) => setAddress(event.target.value)} /></label>
          </fieldset>
          <fieldset className="form-section span-2">
            <legend>What they do</legend>
            <label>Category<input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} /></label>
            <label>Locations<input placeholder="Comma-separated" value={locationsText} onChange={(event) => setLocationsText(event.target.value)} /></label>
            <label>Services<input placeholder="Comma-separated" value={servicesText} onChange={(event) => setServicesText(event.target.value)} /></label>
            <label>Materials<input placeholder="Comma-separated" value={materialsText} onChange={(event) => setMaterialsText(event.target.value)} /></label>
          </fieldset>
          <fieldset className="form-section span-2">
            <legend>Manpower</legend>
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
          </fieldset>
          <fieldset className="form-section span-2">
            <legend>GST</legend>
            <label className="check">
              <input type="checkbox" checked={gstRegistered} onChange={(event) => setGstRegistered(event.target.checked)} />
              <span>GST registered</span>
            </label>
            <label>GSTIN<input value={gstin} onChange={(event) => setGstin(event.target.value)} /></label>
            <label>GST legal name<input value={gstLegalName} onChange={(event) => setGstLegalName(event.target.value)} /></label>
          </fieldset>
          <fieldset className="form-section span-2">
            <legend>Rates</legend>
            <label>Rate label<input value={rateLabel} onChange={(event) => setRateLabel(event.target.value)} /></label>
            <label>Rate amount<input inputMode="decimal" placeholder="1500.00" value={rateAmount} onChange={(event) => setRateAmount(event.target.value)} /></label>
            <label>Rate unit<input value={rateUnit} onChange={(event) => setRateUnit(event.target.value)} /></label>
          </fieldset>
          <div className="form-actions span-2">
            <button type="submit">Save vendor</button>
            <button type="button" className="secondary" onClick={closeForm}>Cancel</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
