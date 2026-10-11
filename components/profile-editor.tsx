'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { haptic, useMainButton, useMainButtonProgress } from '@/components/telegram-ui';
import type { DemoProfile } from '@/lib/demo/store';

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-600';

function join(values: string[]) {
  return values.join(', ');
}

export function ProfileEditor({ profile }: { profile: DemoProfile }) {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [location, setLocation] = useState(profile.location || '');
  const [country, setCountry] = useState(profile.countryEligible || '');
  const [remoteOnly, setRemoteOnly] = useState(profile.remoteOnly);
  const [salaryMin, setSalaryMin] = useState(profile.salaryMin?.toString() || '');
  const [salaryMax, setSalaryMax] = useState(profile.salaryMax?.toString() || '');
  const [languages, setLanguages] = useState(join(profile.languages));
  const [skills, setSkills] = useState(join(profile.skills));
  const [keywords, setKeywords] = useState(join(profile.stackKeywords));
  const [gaps, setGaps] = useState(join(profile.skillGaps));
  const [rules, setRules] = useState(profile.writingRules || '');
  const [companies, setCompanies] = useState(profile.watchedCompanies.join('\n'));

  async function saveProfile() {
    setSaving(true);
    setError('');
    setMessage('');
    const split = (value: string) => value.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
    const response = await fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location,
        countryEligible: country,
        remoteOnly,
        salaryMin,
        salaryMax,
        languages: split(languages),
        skills: split(skills),
        stackKeywords: split(keywords),
        skillGaps: split(gaps),
        writingRules: rules,
        watchedCompanies: companies.split('\n').map((line) => line.trim()).filter(Boolean),
      }),
    });
    setSaving(false);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || 'Could not save the profile');
      haptic('error');
      return;
    }
    setMessage('Profile saved.');
    haptic('success');
    router.refresh();
  }

  useMainButton('Save profile', () => {
    void saveProfile();
  });
  useMainButtonProgress(saving);

  function save(event: React.FormEvent) {
    event.preventDefault();
    void saveProfile();
  }

  async function upload(file: File) {
    setError('');
    setMessage('');
    const form = new FormData();
    form.append('file', file);
    const response = await fetch('/api/profile/cv', { method: 'POST', body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(body.error || 'Could not read that PDF');
      return;
    }
    setMessage(`Extracted ${body.characters} characters from ${body.fileName}.`);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <section className="space-y-3 rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">CV</h2>
        <p className="text-sm text-gray-600">
          {profile.cvFileName
            ? `${profile.cvFileName} · ${(profile.cvText || '').length} characters extracted`
            : 'No CV yet. Upload a PDF. Only the text is stored.'}
        </p>
        {profile.cvText && (
          <p className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 p-3 text-sm text-gray-700">
            {profile.cvText.slice(0, 700)}
          </p>
        )}
        <input
          type="file"
          accept="application/pdf"
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) upload(file);
          }}
        />
      </section>

      <section className="space-y-4 rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">Filters</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="font-medium">City</span>
            <input className={inputClass} value={location} onChange={(e) => setLocation(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Country you can work from</span>
            <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Salary min (yearly gross)</span>
            <input className={inputClass} inputMode="numeric" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Salary max</span>
            <input className={inputClass} inputMode="numeric" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
          Remote only
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Working languages</span>
          <input className={inputClass} value={languages} onChange={(e) => setLanguages(e.target.value)} />
        </label>
      </section>

      <section className="space-y-4 rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">Skills</h2>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Confirmed skills</span>
          <textarea className={inputClass} rows={3} value={skills} onChange={(e) => setSkills(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Role keywords</span>
          <textarea className={inputClass} rows={2} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="font-medium">Skill gaps to avoid</span>
          <textarea className={inputClass} rows={2} value={gaps} onChange={(e) => setGaps(e.target.value)} />
        </label>
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">Writing rules</h2>
        <p className="text-sm text-gray-600">Used for every cover letter. The model is told not to invent facts.</p>
        <textarea className={inputClass} rows={8} value={rules} onChange={(e) => setRules(e.target.value)} />
      </section>

      <section className="space-y-3 rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold">Company watchlist</h2>
        <p className="text-sm text-gray-600">One company per line. Sources themselves are seeded in the database.</p>
        <textarea className={inputClass} rows={6} value={companies} onChange={(e) => setCompanies(e.target.value)} />
      </section>

      {message && <p className="text-sm text-green-700">{message}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button>
    </form>
  );
}
