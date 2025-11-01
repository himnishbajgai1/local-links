// src/App.jsx
import React, { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import {
  MapPin, Phone, Clock, ExternalLink, BarChart3,
  LogOut, Plus, Trash2, Eye, Loader2, GripVertical, Share2,
} from 'lucide-react';
import {
  DndContext, closestCenter, KeyboardSensor,
  PointerSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import QRCode from 'qrcode.react';

// ---------------------------------------------------------------------
// SUPABASE CLIENT
// ---------------------------------------------------------------------
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://fknghykuixdpiumxhoce.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrbmdoeWt1aXhkcGl1bXhob2NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MjIwMTI5MTQsImV4cCI6MjA3NzU4ODkxNH0.J65Ys-1viaFu9exmzQ-VDrv7l9L4wbPb3hbGL2eIbSk';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------
type View = 'landing' | 'login' | 'signup' | 'dashboard' | 'public';

interface Business {
  id: number;
  user_id: string;
  slug: string;
  name: string;
  description?: string;
  phone?: string;
  address?: string;
  hours?: string;
  theme_color: string;
}

interface LinkItem {
  id: number;
  business_id: number;
  title: string;
  url: string;
  order: number;
  clicks: number;
}

// ---------------------------------------------------------------------
// URL VALIDATION HELPER
// ---------------------------------------------------------------------
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------
// MAIN APP
// ---------------------------------------------------------------------
export default function App() {
  const [view, setView] = useState<View>('landing');
  const [user, setUser] = useState<any>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------------------------------------------
  // AUTH LISTENER
  // -----------------------------------------------------------------
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
        loadBusiness(data.session.user.id, data.session.access_token);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session) {
        setUser(session.user);
        await loadBusiness(session.user.id, session.access_token);
        setView('dashboard');
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setBusiness(null);
        setLinks([]);
        setView('landing');
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // -----------------------------------------------------------------
  // LOAD BUSINESS + LINKS
  // -----------------------------------------------------------------
  const loadBusiness = async (userId: string, token: string) => {
    const { data: biz, error: e1 } = await supabase
      .from('businesses')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (e1) {
      setError(e1.message);
      return;
    }
    setBusiness(biz);

    const { data: lnks, error: e2 } = await supabase
      .from('links')
      .select('*')
      .eq('business_id', biz.id)
      .order('order', { ascending: true });

    if (e2) setError(e2.message);
    else setLinks(lnks ?? []);
  };

  // -----------------------------------------------------------------
  // SIGNUP
  // -----------------------------------------------------------------
  const handleSignUp = async (email: string, password: string, name: string, slug: string) => {
    setLoading(true);
    setError(null);

    // Slug uniqueness check
    const { data: existing, error: checkError } = await supabase
      .from('businesses')
      .select('id')
      .eq('slug', slug)
      .single();

    if (checkError && checkError.code !== 'PGRST116') { // Ignore no rows error
      setError(checkError.message);
      setLoading(false);
      return;
    }

    if (existing) {
      setError('Slug is already taken. Try another one.');
      setLoading(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { business_name: name, slug } },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    if (data.user) {
      const { data: biz, error: e2 } = await supabase
        .from('businesses')
        .insert({
          user_id: data.user.id,
          slug,
          name,
          theme_color: '#6366f1',
        })
        .select()
        .single();

      if (e2) setError(e2.message);
      else {
        setBusiness(biz);
        setView('dashboard');
      }
    }
    setLoading(false);
  };

  // -----------------------------------------------------------------
  // LOGIN
  // -----------------------------------------------------------------
  const handleLogin = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
    }
    setLoading(false);
  };

  // -----------------------------------------------------------------
  // LOGOUT
  // -----------------------------------------------------------------
  const handleLogout = () => supabase.auth.signOut();

  // -----------------------------------------------------------------
  // LINK CRUD
  // -----------------------------------------------------------------
  const addLink = async (title: string, url: string) => {
    if (!business) return;
    if (!title || !url) {
      setError('Title and URL are required.');
      return;
    }
    if (!isValidUrl(url)) {
      setError('Invalid URL. Must be a valid http/https link.');
      return;
    }
    const { data, error } = await supabase
      .from('links')
      .insert({
        business_id: business.id,
        title,
        url,
        order: links.length,
        clicks: 0,
      })
      .select()
      .single();
    if (error) {
      setError(error.message);
    } else if (data) {
      setLinks((p) => [...p, data]);
      setError(null);
    }
  };

  const deleteLink = async (id: number) => {
    await supabase.from('links').delete().eq('id', id);
    setLinks((p) => p.filter((l) => l.id !== id));
  };

  // -----------------------------------------------------------------
  // DRAG & DROP
  // -----------------------------------------------------------------
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIdx = links.findIndex((l) => l.id === active.id);
    const newIdx = links.findIndex((l) => l.id === over.id);
    const newOrder = arrayMove(links, oldIdx, newIdx);

    setLinks(newOrder);
    const updates = newOrder.map((l, i) => ({ id: l.id, order: i }));
    await supabase.from('links').upsert(updates);
  };

  // -----------------------------------------------------------------
  // SETTINGS UPDATE
  // -----------------------------------------------------------------
  const updateBusiness = async (updates: Partial<Business>) => {
    if (!business) return;
    const { data, error } = await supabase
      .from('businesses')
      .update(updates)
      .eq('id', business.id)
      .select()
      .single();
    if (!error && data) setBusiness(data);
  };

  // -----------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------
  if (view === 'landing') return <LandingPage setView={setView} />;
  if (view === 'login')
    return <LoginPage setView={setView} handleLogin={handleLogin} loading={loading} error={error} />;
  if (view === 'signup')
    return <SignupPage setView={setView} handleSignUp={handleSignUp} loading={loading} error={error} />;
  if (view === 'dashboard')
    return (
      <Dashboard
        business={business}
        links={links}
        setView={setView}
        handleLogout={handleLogout}
        addLink={addLink}
        deleteLink={deleteLink}
        updateBusiness={updateBusiness}
        onDragEnd={handleDragEnd}
        sensors={sensors}
        error={error}
        setError={setError}
      />
    );
  if (view === 'public')
    return <PublicProfile business={business} links={links} setView={setView} />;

  return null;
}

// ---------------------------------------------------------------------
// LANDING PAGE
// ---------------------------------------------------------------------
function LandingPage({ setView }: { setView: (v: View) => void }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-indigo-600">LocalLinks</h1>
          <div className="space-x-4">
            <button onClick={() => setView('login')} className="text-gray-600 hover:text-gray-900">Login</button>
            <button onClick={() => setView('signup')} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700">Get Started</button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-20 text-center">
        <h2 className="text-5xl font-bold text-gray-900 mb-6">One Link For Your Entire Business</h2>
        <p className="text-xl text-gray-600 mb-8">Menu, hours, booking, socials – all in one tap.</p>
        <button onClick={() => setView('signup')} className="bg-indigo-600 text-white px-8 py-4 rounded-lg text-lg font-semibold hover:bg-indigo-700 shadow-lg">
          Start Free Trial – $10/month
        </button>
        <p className="text-sm text-gray-500 mt-4">Perfect for cafes, salons, gyms, restaurants & more</p>
      </div>

      {/* Feature cards, example – omitted for brevity (copy from your original) */}
    </div>
  );
}

// ---------------------------------------------------------------------
// LOGIN PAGE
// ---------------------------------------------------------------------
function LoginPage({ setView, handleLogin, loading, error }: {
  setView: (v: View) => void;
  handleLogin: (e: string, p: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full">
        <h2 className="text-3xl font-bold mb-6 text-center">Welcome Back</h2>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
        <div className="space-y-4">
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded-lg px-4 py-2" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded-lg px-4 py-2" />
          <button onClick={() => handleLogin(email, password)} disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 flex items-center justify-center">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Login'}
          </button>
        </div>
        <p className="text-center mt-4 text-sm text-gray-600">
          No account? <button onClick={() => setView('signup')} className="text-indigo-600 hover:underline">Sign up</button>
        </p>
        <button onClick={() => setView('landing')} className="text-sm text-gray-500 hover:text-gray-700 mt-4 block mx-auto">Back to home</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// SIGNUP PAGE
// ---------------------------------------------------------------------
function SignupPage({ setView, handleSignUp, loading, error }: {
  setView: (v: View) => void;
  handleSignUp: (e: string, p: string, n: string, s: string) => void;
  loading: boolean;
  error: string | null;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white p-8 rounded-xl shadow-md max-w-md w-full">
        <h2 className="text-3xl font-bold mb-2 text-center">Start Your Free Trial</h2>
        <p className="text-center text-gray-600 mb-6">$10/month after 14 days. Cancel anytime.</p>
        {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}
        <div className="space-y-4">
          <input type="text" placeholder="Business Name" value={name} onChange={e => setName(e.target.value)} className="w-full border rounded-lg px-4 py-2" />
          <div className="flex items-center border rounded-lg overflow-hidden">
            <span className="bg-gray-100 px-3 py-2 text-sm text-gray-600">locallinks.io/</span>
            <input type="text" placeholder="your-slug" value={slug}
              onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              className="flex-1 px-2 py-2 outline-none" />
          </div>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} className="w-full border rounded-lg px-4 py-2" />
          <input type="password" placeholder="Password" value={password} onChange={e => setPassword(e.target.value)} className="w-full border rounded-lg px-4 py-2" />
          <button onClick={() => handleSignUp(email, password, name, slug)} disabled={loading}
            className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 flex items-center justify-center">
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Account'}
          </button>
        </div>
        <p className="text-center mt-4 text-sm text-gray-600">
          Already have an account? <button onClick={() => setView('login')} className="text-indigo-600 hover:underline">Login</button>
        </p>
        <button onClick={() => setView('landing')} className="text-sm text-gray-500 hover:text-gray-700 mt-4 block mx-auto">Back to home</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// DASHBOARD
// ---------------------------------------------------------------------
function Dashboard({
  business, links, setView, handleLogout, addLink, deleteLink,
  updateBusiness, onDragEnd, sensors, error, setError,
}: {
  business: Business | null;
  links: LinkItem[];
  setView: (v: View) => void;
  handleLogout: () => void;
  addLink: (t: string, u: string) => void;
  deleteLink: (id: number) => void;
  updateBusiness: (u: Partial<Business>) => void;
  onDragEnd: any;
  sensors: any;
  error: string | null;
  setError: (e: string | null) => void;
}) {
  const [tab, setTab] = useState<'links' | 'settings'>('links');
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [showQR, setShowQR] = useState(false);

  // Settings form state
  const [form, setForm] = useState<Partial<Business>>({
    name: business?.name ?? '',
    description: business?.description ?? '',
    phone: business?.phone ?? '',
    address: business?.address ?? '',
    hours: business?.hours ?? '',
    theme_color: business?.theme_color ?? '#6366f1',
  });

  const saveSettings = () => updateBusiness(form);

  if (!business) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="w-10 h-10 animate-spin text-indigo-600" /></div>;

  const publicUrl = `https://locallinks.io/${business.slug}`;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* NAV */}
      <nav className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold text-indigo-600">LocalLinks Dashboard</h1>
          <div className="flex items-center space-x-4">
            <button onClick={() => setView('public')} className="flex items-center text-sm text-gray-600 hover:text-gray-900"><Eye className="w-4 h-4 mr-1" />View Public</button>
            <button onClick={handleLogout} className="flex items-center text-sm text-gray-600 hover:text-gray-900"><LogOut className="w-4 h-4 mr-1" />Logout</button>
          </div>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">{business.name}</h2>
          <p className="text-gray-600">{publicUrl}</p>
        </div>

        {/* TABS */}
        <div className="flex space-x-4 mb-6 border-b">
          <button onClick={() => setTab('links')} className={`pb-3 px-2 font-medium ${tab === 'links' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-600'}`}>Links</button>
          <button onClick={() => setTab('settings')} className={`pb-3 px-2 font-medium ${tab === 'settings' ? 'border-b-2 border-indigo-600 text-indigo-600' : 'text-gray-600'}`}>Settings</button>
        </div>

        {/* LINKS TAB */}
        {tab === 'links' && (
          <>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Your Links</h3>
              <div className="space-x-2">
                <button onClick={() => setShowQR(true)} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center"><Share2 className="w-4 h-4 mr-2" />QR Code</button>
                <button onClick={() => setShowAdd(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 flex items-center"><Plus className="w-4 h-4 mr-2" />Add Link</button>
              </div>
            </div>

            {error && <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-4 text-sm">{error}</div>}

            {showQR && (
              <div className="bg-white p-6 rounded-lg shadow-md mb-6 text-center">
                <h4 className="font-bold mb-4">QR Code for {publicUrl}</h4>
                <div className="mx-auto w-fit">
                  <QRCode value={publicUrl} size={256} />
                </div>
                <p className="text-sm text-gray-500 mt-2">Scan to preview/share your page</p>
                <button onClick={() => setShowQR(false)} className="mt-4 bg-gray-200 text-gray-700 px-4 py-2 rounded-lg">Close</button>
              </div>
            )}

            {showAdd && (
              <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                <h4 className="font-bold mb-4">Add New Link</h4>
                <div className="grid md:grid-cols-2 gap-4">
                  <input placeholder="Title" value={title} onChange={e => setTitle(e.target.value)} className="border rounded-lg px-3 py-2" />
                  <input placeholder="https://..." value={url} onChange={e => setUrl(e.target.value)} className="border rounded-lg px-3 py-2" />
                </div>
                <div className="flex space-x-2 mt-4">
                  <button onClick={() => { addLink(title, url); setTitle(''); setUrl(''); setShowAdd(false); }} className="bg-indigo-600 text-white px-4 py-2 rounded-lg">Save</button>
                  <button onClick={() => setShowAdd(false)} className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg">Cancel</button>
                </div>
              </div>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={links.map(l => l.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {links.length === 0 && <p className="text-center py-8 text-gray-500">No links yet – add one above!</p>}
                  {links.map(l => <SortableLink key={l.id} link={l} onDelete={deleteLink} theme={business.theme_color} />)}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <div>
            <h3 className="text-xl font-bold mb-6">Business Settings</h3>
            <div className="bg-white p-6 rounded-lg shadow-md space-y-6">
              {['name', 'description', 'phone', 'address', 'hours'].map(field => (
                <div key={field}>
                  <label className="block text-sm font-medium mb-1">{field.charAt(0).toUpperCase() + field.slice(1)}</label>
                  {field === 'description' ? (
                    <textarea rows={3} value={form[field as keyof typeof form] ?? ''} onChange={e => setForm({ ...form, [field]: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                  ) : (
                    <input type={field === 'phone' ? 'tel' : 'text'} value={form[field as keyof typeof form] ?? ''} onChange={e => setForm({ ...form, [field]: e.target.value })} className="w-full border rounded-lg px-3 py-2" />
                  )}
                </div>
              ))}
              <div>
                <label className="block text-sm font-medium mb-1">Theme Color</label>
                <input type="color" value={form.theme_color ?? '#6366f1'} onChange={e => setForm({ ...form, theme_color: e.target.value })} className="w-20 h-10 border rounded" />
              </div>
              <button onClick={saveSettings} className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">Save Changes</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// SORTABLE LINK ROW
// ---------------------------------------------------------------------
function SortableLink({ link, onDelete, theme }: { link: LinkItem; onDelete: (id: number) => void; theme: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: link.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div ref={setNodeRef} style={style} className="bg-white p-4 rounded-lg shadow-sm flex items-center justify-between">
      <div className="flex items-center flex-1">
        <button className="cursor-grab text-gray-400 hover:text-gray-600 mr-3" {...attributes} {...listeners}><GripVertical className="w-5 h-5" /></button>
        <div>
          <h4 className="font-semibold">{link.title}</h4>
          <p className="text-sm text-gray-600">{link.url}</p>
          <p className="text-xs text-gray-500 mt-1">{link.clicks} clicks</p>
        </div>
      </div>
      <button onClick={() => onDelete(link.id)} className="p-2 text-gray-600 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
    </div>
  );
}

// ---------------------------------------------------------------------
// PUBLIC PROFILE
// ---------------------------------------------------------------------
function PublicProfile({ business, links, setView }: { business: Business | null; links: LinkItem[]; setView: (v: View) => void }) {
  if (!business) return null;

  const publicUrl = `https://locallinks.io/${business.slug}`;
  const shareText = `Check out ${business.name} – menu, hours, and more: ${publicUrl}`;

  const trackClick = async (linkId: number) => {
    await fetch(`${SUPABASE_URL}/functions/v1/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify({ link_id: linkId }),
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="h-32" style={{ backgroundColor: business.theme_color }} />
          <div className="px-6 pb-6">
            <div className="text-center -mt-16 mb-6">
              <div className="w-24 h-24 bg-white rounded-full mx-auto shadow-lg flex items-center justify-center text-4xl">Coffee</div>
            </div>

            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold mb-2">{business.name}</h1>
              <p className="text-gray-600">{business.description}</p>
            </div>

            <div className="space-y-3 mb-8">
              {links.map(l => (
                <a key={l.id} href={l.url} target="_blank" rel="noopener noreferrer"
                  onClick={() => trackClick(l.id)}
                  className="block w-full py-4 px-6 rounded-xl text-center font-semibold transition-all hover:scale-105"
                  style={{ backgroundColor: business.theme_color, color: 'white' }}>
                  {l.title}
                </a>
              ))}
            </div>

            {(business.hours || business.phone || business.address) && (
              <div className="border-t pt-6 space-y-4">
                {business.hours && <div className="flex items-center text-gray-700"><Clock className="w-5 h-5 mr-3" style={{ color: business.theme_color }} /><span className="text-sm">{business.hours}</span></div>}
                {business.phone && <a href={`tel:${business.phone}`} className="flex items-center text-gray-700 hover:text-gray-900"><Phone className="w-5 h-5 mr-3" style={{ color: business.theme_color }} /><span className="text-sm">{business.phone}</span></a>}
                {business.address && <a href={`https://maps.google.com/?q=${encodeURIComponent(business.address)}`} target="_blank" rel="noopener noreferrer" className="flex items-center text-gray-700 hover:text-gray-900"><MapPin className="w-5 h-5 mr-3" style={{ color: business.theme_color }} /><span className="text-sm">{business.address}</span></a>}
              </div>
            )}
          </div>
        </div>

        <div className="text-center mt-6 space-x-4">
          <button onClick={() => setView('dashboard')} className="text-sm text-gray-600 hover:text-gray-900">Back to Dashboard</button>
          <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} className="text-sm text-gray-600 hover:text-gray-900 flex items-center inline-flex"><Share2 className="w-4 h-4 mr-1" />Share</a>
        </div>
      </div>
    </div>
  );
}
