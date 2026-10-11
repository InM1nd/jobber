'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import type { DemoApplication } from '@/lib/demo/store';

const STATUSES = ['to_apply', 'applied', 'interview', 'on_hold', 'offer', 'rejected', 'skip'] as const;

const LABELS: Record<string, string> = {
  to_apply: 'To apply',
  applied: 'Applied',
  interview: 'Interview',
  on_hold: 'On hold',
  offer: 'Offer',
  rejected: 'Rejected',
  skip: 'Skip',
};

const inputClass =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-green-600';

export function TrackerBoard({ applications }: { applications: DemoApplication[] }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [url, setUrl] = useState('');
  const [salary, setSalary] = useState('');
  const [notes, setNotes] = useState('');

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ company, role, url, salaryExpectation: salary, notes, status: 'to_apply' }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error || 'Could not add the application');
      return;
    }
    setCompany('');
    setRole('');
    setUrl('');
    setSalary('');
    setNotes('');
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    router.refresh();
  }

  const counts = Object.fromEntries(STATUSES.map((status) => [status, applications.filter((app) => app.status === status).length]));

  return (
    <div className="space-y-10">
      <form onSubmit={add} className="grid gap-3 rounded-xl border border-gray-200 p-6 md:grid-cols-2">
        <input className={inputClass} placeholder="Company" value={company} onChange={(e) => setCompany(e.target.value)} required />
        <input className={inputClass} placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} required />
        <input className={inputClass} placeholder="Listing URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        <input className={inputClass} placeholder="Salary you named" value={salary} onChange={(e) => setSalary(e.target.value)} />
        <textarea className={`${inputClass} md:col-span-2`} rows={2} placeholder="What you sent" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="md:col-span-2">
          <Button type="submit">Add application</Button>
          {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        </div>
      </form>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {(['to_apply', 'applied', 'interview', 'offer'] as const).map((status) => (
          <div key={status} className="rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-sm text-gray-500">{LABELS[status]}</p>
            <p className="text-2xl font-semibold">{counts[status] || 0}</p>
          </div>
        ))}
      </div>

      {applications.length === 0 && (
        <p className="text-sm text-gray-600">Nothing tracked yet. Add the first application above.</p>
      )}

      <div className="space-y-4">
        {applications.map((app) => (
          <article key={app.id} className="space-y-3 rounded-xl border border-gray-200 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{app.role}</h2>
                <p className="text-sm text-gray-600">{app.company}</p>
              </div>
              <select
                className="rounded-md border border-gray-300 px-2 py-1 text-sm"
                value={STATUSES.includes(app.status as typeof STATUSES[number]) ? app.status : 'to_apply'}
                onChange={(event) => setStatus(app.id, event.target.value)}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>{LABELS[status]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1 text-sm text-gray-600">
              {app.appliedAt && <p>Applied {new Date(app.appliedAt).toLocaleDateString()}</p>}
              {app.followUpAt && (
                <p>Follow up {new Date(app.followUpAt).toLocaleDateString()}{app.followUpSent ? ' · reminder sent' : ''}</p>
              )}
              {app.salaryExpectation && <p>Expectation: {app.salaryExpectation}</p>}
              {app.notes && <p className="whitespace-pre-wrap text-gray-800">{app.notes}</p>}
            </div>
            {app.url && (
              <a className="text-sm text-green-700 underline" href={app.url} target="_blank" rel="noreferrer">
                Open listing
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
