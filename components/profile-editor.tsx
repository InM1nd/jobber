'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Globe2, Languages, MapPin, Upload, Wallet, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Group, Notice, Row, inlineFieldClass } from '@/components/ui/kit';
import { cn } from '@/lib/utils';
import { haptic, useMainButton, useMainButtonProgress } from '@/components/telegram-ui';
import type { DemoProfile } from '@/lib/demo/store';

const areaClass =
  'block w-full resize-none bg-transparent px-4 py-3 text-[15px] leading-relaxed text-fg placeholder:text-subtle outline-none md:text-sm';

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn('relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors', checked ? 'bg-success' : 'bg-[#dcdce2] dark:bg-[#3a3a42]')}
    >
      <span className={cn('absolute top-[2px] size-[26px] rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-[2px]')} />
    </button>
  );
}

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
  const fileRef = useRef<HTMLInputElement>(null);

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
    <form onSubmit={save} className="space-y-6">
      {message && <Notice tone="success">{message}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}

      <Group title="CV" footer="Only the extracted text is stored. Jobber never invents facts that aren’t in it.">
        <Row
          icon={FileText}
          label={profile.cvFileName || 'No CV yet'}
          detail={profile.cvText ? `${profile.cvText.length.toLocaleString()} characters extracted` : 'Upload a PDF to get started'}
          trailing={
            <Button type="button" size="sm" variant="soft" onClick={() => fileRef.current?.click()}>
              <Upload /> {profile.cvFileName ? 'Replace' : 'Upload'}
            </Button>
          }
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </Group>

      <Group title="What you’re looking for">
        <Row icon={MapPin} label="City" trailing={<input className={cn(inlineFieldClass, 'max-w-[55%]')} placeholder="Vienna" value={location} onChange={(e) => setLocation(e.target.value)} />} />
        <Row icon={Globe2} iconTone="success" label="Work from" trailing={<input className={cn(inlineFieldClass, 'max-w-[55%]')} placeholder="Austria" value={country} onChange={(e) => setCountry(e.target.value)} />} />
        <Row icon={Wifi} iconTone="neutral" label="Remote only" trailing={<Toggle checked={remoteOnly} onChange={setRemoteOnly} />} />
        <Row icon={Languages} iconTone="warning" label="Languages" trailing={<input className={cn(inlineFieldClass, 'max-w-[55%]')} placeholder="English, German" value={languages} onChange={(e) => setLanguages(e.target.value)} />} />
        <Row
          icon={Wallet}
          iconTone="success"
          label="Salary, €/year"
          trailing={
            <div className="flex max-w-[55%] items-center gap-1 text-subtle">
              <input className={cn(inlineFieldClass, 'w-20')} inputMode="numeric" placeholder="min" value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} />
              –
              <input className={cn(inlineFieldClass, 'w-20')} inputMode="numeric" placeholder="max" value={salaryMax} onChange={(e) => setSalaryMax(e.target.value)} />
            </div>
          }
        />
      </Group>

      <Group title="Skills" footer="Comma separated. Roles that lean on your skill gaps get scored down.">
        <label className="block">
          <span className="block px-4 pt-3 text-[12px] font-medium text-muted">Confirmed skills</span>
          <textarea className={areaClass} rows={2} value={skills} onChange={(e) => setSkills(e.target.value)} />
        </label>
        <label className="block">
          <span className="block px-4 pt-3 text-[12px] font-medium text-muted">Role keywords</span>
          <textarea className={areaClass} rows={2} value={keywords} onChange={(e) => setKeywords(e.target.value)} />
        </label>
        <label className="block">
          <span className="block px-4 pt-3 text-[12px] font-medium text-muted">Skill gaps to avoid</span>
          <textarea className={areaClass} rows={2} value={gaps} onChange={(e) => setGaps(e.target.value)} />
        </label>
      </Group>

      <Group title="Writing rules" footer="Applied to every cover letter.">
        <textarea className={areaClass} rows={5} placeholder="e.g. 3 short paragraphs, no clichés, one concrete story." value={rules} onChange={(e) => setRules(e.target.value)} />
      </Group>

      <Group title="Company watchlist" footer="One company per line.">
        <textarea className={areaClass} rows={4} placeholder={'Bitpanda\nStoryblok'} value={companies} onChange={(e) => setCompanies(e.target.value)} />
      </Group>

      <Button type="submit" size="lg" className="w-full md:w-auto" disabled={saving}>{saving ? 'Saving…' : 'Save profile'}</Button>
    </form>
  );
}
