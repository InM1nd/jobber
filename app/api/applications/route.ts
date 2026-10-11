import { NextResponse } from 'next/server';
import { createApplication, requireUser } from '@/lib/data/service';

export const instant = false;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }
  const data = body as Record<string, unknown>;
  const company = String(data.company || '').trim();
  const role = String(data.role || '').trim();
  if (!company || !role) {
    return NextResponse.json({ error: 'Company and role are required' }, { status: 400 });
  }

  const application = await createApplication(user.id, {
    company: company.slice(0, 160),
    role: role.slice(0, 160),
    url: data.url ? String(data.url).slice(0, 500) : null,
    status: data.status ? String(data.status) : 'to_apply',
    notes: data.notes ? String(data.notes).slice(0, 4000) : null,
    contact: data.contact ? String(data.contact).slice(0, 200) : null,
    salaryExpectation: data.salaryExpectation ? String(data.salaryExpectation).slice(0, 120) : null,
    appliedAt: data.appliedAt ? String(data.appliedAt) : null,
  });

  return NextResponse.json({ application });
}
