'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import StaffShell from '@/components/staff/StaffShell';
import { adminApi } from '@/lib/api';
import { money, FOOD_TYPE_LABEL } from '@/lib/format';
import type { Category, MenuItem } from '@/lib/types';
import { EmptyState, FoodTypeMark, LoadingScreen, Sheet, Spinner, Toast, useToast } from '@/components/ui';

interface DraftRow { name: string; value: string }

const emptyDraft = () => ({
  id: '' as string,
  category_id: '',
  name: '',
  description: '',
  price: '',
  food_type: 'VEG',
  kitchen_station: 'KITCHEN',
  prep_minutes: '10',
  spice_level: '0',
  is_recommended: false,
  is_available: true,
  image_url: '',
  variants: [] as DraftRow[],
  addons: [] as DraftRow[],
});
type Draft = ReturnType<typeof emptyDraft>;

function MenuManager() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: catData, mutate: refreshCats } = useSWR('admin-categories', () => adminApi.categories());
  const { data: itemData, mutate: refreshItems, isLoading } = useSWR('admin-items', () => adminApi.menuItems());

  const categories = catData?.categories ?? [];
  const items = itemData?.items ?? [];

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((i) =>
      (categoryFilter === 'ALL' || i.category_id === categoryFilter)
      && (!q || `${i.name} ${i.description}`.toLowerCase().includes(q)));
  }, [items, search, categoryFilter]);

  const openNew = () => {
    const d = emptyDraft();
    d.category_id = categoryFilter !== 'ALL' ? categoryFilter : (categories[0]?.id ?? '');
    setDraft(d);
  };

  const openEdit = (item: MenuItem) => setDraft({
    id: item.id,
    category_id: item.category_id ?? '',
    name: item.name,
    description: item.description,
    price: String(item.price / 100),
    food_type: item.food_type,
    kitchen_station: item.kitchen_station ?? 'KITCHEN',
    prep_minutes: String(item.prep_minutes),
    spice_level: String(item.spice_level),
    is_recommended: item.is_recommended,
    is_available: item.is_available,
    image_url: item.image_url ?? '',
    variants: (item.variants ?? []).map((v) => ({ name: v.name, value: String(v.price_delta / 100) })),
    addons: (item.addons ?? []).map((a) => ({ name: a.name, value: String(a.price / 100) })),
  });

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = {
        category_id: draft.category_id,
        name: draft.name.trim(),
        description: draft.description.trim(),
        price: Math.round(Number(draft.price || 0) * 100),
        food_type: draft.food_type,
        kitchen_station: draft.kitchen_station,
        prep_minutes: Number(draft.prep_minutes || 10),
        spice_level: Number(draft.spice_level || 0),
        is_recommended: draft.is_recommended,
        is_available: draft.is_available,
        image_url: draft.image_url.trim() || null,
        variants: draft.variants
          .filter((v) => v.name.trim())
          .map((v) => ({ name: v.name.trim(), price_delta: Math.round(Number(v.value || 0) * 100) })),
        addons: draft.addons
          .filter((a) => a.name.trim())
          .map((a) => ({ name: a.name.trim(), price: Math.round(Number(a.value || 0) * 100) })),
      };
      if (draft.id) await adminApi.updateMenuItem(draft.id, body);
      else await adminApi.createMenuItem(body);

      setDraft(null);
      refreshItems();
      toast.show(draft.id ? 'Item updated' : 'Item added to the menu');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not save the item', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleAvailability = async (item: MenuItem) => {
    try {
      await adminApi.setAvailability(item.id, !item.is_available);
      refreshItems();
      toast.show(item.is_available ? `${item.name} marked sold out` : `${item.name} is back on`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not update', 'error');
    }
  };

  const remove = async (item: MenuItem) => {
    if (!confirm(`Remove "${item.name}" from the menu?`)) return;
    try {
      const res = await adminApi.deleteMenuItem(item.id);
      refreshItems();
      toast.show(res.archived
        ? `${item.name} has been retired — past bills keep their history.`
        : `${item.name} deleted`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not remove the item', 'error');
    }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await adminApi.createCategory({ name: newCategory.trim(), sort_order: categories.length });
      setNewCategory('');
      refreshCats();
      toast.show('Category added');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : 'Could not add the category', 'error');
    }
  };

  if (isLoading) return <LoadingScreen label="Loading the menu…" />;

  const rowEditor = (
    label: string,
    rows: DraftRow[],
    onChange: (rows: DraftRow[]) => void,
    namePlaceholder: string,
    valueLabel: string,
  ) => (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={namePlaceholder}
              value={row.name}
              onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, name: e.target.value } : r)))}
            />
            <input
              className="input w-28"
              type="number"
              step="1"
              placeholder={valueLabel}
              value={row.value}
              onChange={(e) => onChange(rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="btn-ghost px-3 text-rose-600"
              aria-label={`Remove ${row.name || 'row'}`}
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...rows, { name: '', value: '0' }])} className="btn-secondary btn-sm">
          + Add {label.toLowerCase().replace(/s$/, '')}
        </button>
      </div>
    </fieldset>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Menu</h2>
          <p className="text-sm text-slate-500">{items.length} items across {categories.length} categories</p>
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setCategoryOpen(true)} className="btn-secondary">Categories</button>
          <button type="button" onClick={openNew} className="btn-primary" disabled={categories.length === 0}>+ New item</button>
        </div>
      </div>

      {categories.length === 0 && (
        <EmptyState
          icon="📂"
          title="Create a category first"
          hint="Items live inside categories such as Hot Coffee or Bakery."
          action={<button type="button" onClick={() => setCategoryOpen(true)} className="btn-primary">Add a category</button>}
        />
      )}

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          className="input sm:max-w-xs"
          placeholder="Search items…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search menu items"
        />
        <select
          className="input sm:w-56"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          aria-label="Filter by category"
        >
          <option value="ALL">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.item_count})</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">Item</th>
                <th className="table-head hidden sm:table-cell">Category</th>
                <th className="table-head">Price</th>
                <th className="table-head hidden lg:table-cell">Station</th>
                <th className="table-head">Available</th>
                <th className="table-head text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((item) => (
                <tr key={item.id} className={item.is_active === false ? 'opacity-50' : ''}>
                  <td className="table-cell">
                    <div className="flex items-start gap-2">
                      <FoodTypeMark type={item.food_type} />
                      <div className="min-w-0">
                        <p className="font-medium text-slate-900">
                          {item.name}
                          {item.is_recommended && <span className="ml-1.5 text-amber-500" title="Popular">★</span>}
                        </p>
                        <p className="line-clamp-1 max-w-xs text-xs text-slate-500">{item.description}</p>
                        {(item.variants?.length > 0 || item.addons?.length > 0) && (
                          <p className="mt-0.5 text-[11px] text-slate-400">
                            {item.variants?.length > 0 && `${item.variants.length} sizes`}
                            {item.variants?.length > 0 && item.addons?.length > 0 && ' · '}
                            {item.addons?.length > 0 && `${item.addons.length} add-ons`}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="table-cell hidden sm:table-cell">{item.category_name}</td>
                  <td className="table-cell font-semibold">{money(item.price)}</td>
                  <td className="table-cell hidden capitalize lg:table-cell">{item.kitchen_station?.toLowerCase()}</td>
                  <td className="table-cell">
                    <button
                      type="button"
                      onClick={() => toggleAvailability(item)}
                      className={`chip ${item.is_available
                        ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                        : 'bg-rose-50 text-rose-700 ring-rose-200'}`}
                    >
                      {item.is_available ? 'On the menu' : 'Sold out'}
                    </button>
                  </td>
                  <td className="table-cell text-right">
                    <button type="button" onClick={() => openEdit(item)} className="btn-ghost btn-sm">Edit</button>
                    <button type="button" onClick={() => remove(item)} className="btn-ghost btn-sm text-rose-600">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 && items.length > 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No items match that search.</p>
        )}
      </div>

      {/* ------------------------------------------------------ item editor */}
      <Sheet
        open={!!draft}
        onClose={() => setDraft(null)}
        title={draft?.id ? 'Edit item' : 'New menu item'}
        footer={
          <div className="flex gap-2">
            <button type="button" onClick={() => setDraft(null)} className="btn-secondary flex-1">Cancel</button>
            <button type="button" onClick={save} disabled={busy || !draft?.name.trim()} className="btn-primary flex-1">
              {busy ? <Spinner className="h-4 w-4 text-white" /> : 'Save item'}
            </button>
          </div>
        }
      >
        {draft && (
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="i-name">Name</label>
              <input id="i-name" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Cappuccino" />
            </div>

            <div>
              <label className="label" htmlFor="i-desc">Description</label>
              <textarea id="i-desc" rows={2} className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="What the guest should know about this dish" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="i-cat">Category</label>
                <select id="i-cat" className="input" value={draft.category_id} onChange={(e) => setDraft({ ...draft, category_id: e.target.value })}>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="i-price">Base price (₹)</label>
                <input id="i-price" type="number" min="0" step="1" className="input" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="180" />
              </div>
              <div>
                <label className="label" htmlFor="i-type">Food type</label>
                <select id="i-type" className="input" value={draft.food_type} onChange={(e) => setDraft({ ...draft, food_type: e.target.value })}>
                  {Object.entries(FOOD_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="i-station">Kitchen station</label>
                <select id="i-station" className="input" value={draft.kitchen_station} onChange={(e) => setDraft({ ...draft, kitchen_station: e.target.value })}>
                  {['KITCHEN', 'BAR', 'BAKERY'].map((s) => <option key={s} value={s}>{s[0] + s.slice(1).toLowerCase()}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="i-prep">Prep time (min)</label>
                <input id="i-prep" type="number" min="0" className="input" value={draft.prep_minutes} onChange={(e) => setDraft({ ...draft, prep_minutes: e.target.value })} />
              </div>
              <div>
                <label className="label" htmlFor="i-spice">Spice level</label>
                <select id="i-spice" className="input" value={draft.spice_level} onChange={(e) => setDraft({ ...draft, spice_level: e.target.value })}>
                  <option value="0">Not spicy</option>
                  <option value="1">Mild 🌶️</option>
                  <option value="2">Medium 🌶️🌶️</option>
                  <option value="3">Hot 🌶️🌶️🌶️</option>
                </select>
              </div>
            </div>

            <div>
              <label className="label" htmlFor="i-image">Image URL (optional)</label>
              <input id="i-image" className="input" value={draft.image_url} onChange={(e) => setDraft({ ...draft, image_url: e.target.value })} placeholder="https://…" />
            </div>

            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={draft.is_available} onChange={(e) => setDraft({ ...draft, is_available: e.target.checked })} />
                Available today
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" className="h-4 w-4 rounded accent-brand-600" checked={draft.is_recommended} onChange={(e) => setDraft({ ...draft, is_recommended: e.target.checked })} />
                Mark as popular
              </label>
            </div>

            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Sizes change the base price by the amount you enter (0 keeps the base price).
              Add-ons are optional extras the guest pays on top.
            </p>

            {rowEditor('Sizes', draft.variants, (variants) => setDraft({ ...draft, variants }), 'Large', '+₹')}
            {rowEditor('Add-ons', draft.addons, (addons) => setDraft({ ...draft, addons }), 'Extra shot', '₹')}
          </div>
        )}
      </Sheet>

      {/* -------------------------------------------------- category editor */}
      <Sheet open={categoryOpen} onClose={() => setCategoryOpen(false)} title="Categories">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="New category name"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addCategory()}
            />
            <button type="button" onClick={addCategory} className="btn-primary">Add</button>
          </div>

          <ul className="divide-y divide-slate-100">
            {categories.map((c: Category) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <div className="flex-1">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-xs text-slate-500">{c.item_count} items</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    await adminApi.updateCategory(c.id, { is_active: !c.is_active } as never);
                    refreshCats();
                  }}
                  className={`chip ${c.is_active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-100 text-slate-600 ring-slate-200'}`}
                >
                  {c.is_active ? 'Visible' : 'Hidden'}
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm(`Delete "${c.name}"?`)) return;
                    try {
                      await adminApi.deleteCategory(c.id);
                      refreshCats();
                    } catch (err) {
                      toast.show(err instanceof Error ? err.message : 'Could not delete', 'error');
                    }
                  }}
                  className="btn-ghost btn-sm text-rose-600"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Sheet>

      {toast.toast && <Toast message={toast.toast.message} tone={toast.toast.tone} onDone={toast.clear} />}
    </div>
  );
}

export default function AdminMenuPage() {
  return (
    <StaffShell requires={['ADMIN']} title="Menu management">
      {() => <MenuManager />}
    </StaffShell>
  );
}
