
// app/seed/route.ts
export const runtime = 'nodejs';
import { sql } from '@vercel/postgres';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Forbidden in production', { status: 403 });
  }

  try {
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;

    // Ensure schema
    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        image_url TEXT
      );
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,      -- cents
        status TEXT NOT NULL,         -- 'paid' | 'pending'
        date DATE DEFAULT CURRENT_DATE
      );
    `;

    // Add missing columns if needed
    await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS image_url TEXT;`;
    await sql`ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;`;
    await sql`ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';`;

    // Seed customers (use your real images or a default)
    await sql`
      
INSERT INTO customers (name, email, image_url) VALUES
  ('Delba de Oliveira', 'delba@oliveira.com', '/customers/delba-de-oliveira.png'),
  ('Lee Robinson',       'lee@robinson.com',   '/customers/lee-robinson.png'),
  ('Evil Rabbit',        'evil@example.com',   '/customers/evil-rabbit.png'),
  ('Amy Burns',          'amy@burns.com',      '/customers/amy-burns.png'),
  ('Balazs Orban',       'balazs@orban.com',   '/customers/balazs-orban.png'),
  ('Michael Novotny',    'michael@novotny.com','/customers/michael-novotny.png')
ON CONFLICT (email) DO NOTHING;

    `;

    const { rows: customers } = await sql<{ id: string; name: string }>`
      SELECT id, name FROM customers;
    `;
    const idFor = (name: string) => customers.find(c => c.name === name)?.id;

    // Latest Invoices (to match screenshot values; amounts are cents)
    const latest = [
      { name: 'Delba de Oliveira', amount: 8945,  status: 'paid',    date: '2025-03-01' }, // $89.45
      { name: 'Jared Palmer',      amount: 44800, status: 'paid',    date: '2025-03-02' }, // $448.00
      { name: 'Lee Robinson',      amount: 500,   status: 'paid',    date: '2025-03-03' }, // $5.00
      { name: 'Tom Occhino',       amount: 34577, status: 'pending', date: '2025-03-04' }, // $345.77
      { name: 'Emil Kowalski',     amount: 54246, status: 'paid',    date: '2025-03-05' }, // $542.46
    ];

    // A few more invoices for cards and chart
    const extra = [
      { name: 'Acme Corp', amount: 120000, status: 'pending', date: '2025-01-20' },
      { name: 'Acme Corp', amount: 30000,  status: 'paid',    date: '2025-02-18' },
      { name: 'Globex',    amount: 80000,  status: 'paid',    date: '2025-01-10' },
      { name: 'Globex',    amount: 50000,  status: 'pending', date: '2025-02-22' },
      { name: 'Lime Green',amount: 71000,  status: 'pending', date: '2025-03-17' },
      { name: 'Lime Green',amount: 15500,  status: 'paid',    date: '2025-01-12' },
    ];

    // Prevent duplicates on repeated seeding without needing an index
    async function insertInvoice(name: string, amountCents: number, status: 'paid'|'pending', dateISO: string) {
      const cid = idFor(name);
      if (!cid) return;
      await sql`
        INSERT INTO invoices (customer_id, amount, status, date)
        SELECT ${cid}::uuid, ${amountCents}, ${status}, ${dateISO}::date
        WHERE NOT EXISTS (
          SELECT 1 FROM invoices
          WHERE customer_id = ${cid}::uuid
            AND amount       = ${amountCents}
            AND date         = ${dateISO}::date
        );
      `;
    }

    for (const inv of [...latest, ...extra]) {
      await insertInvoice(inv.name, inv.amount, inv.status as 'paid'|'pending', inv.date);
    }

    // Fallback images if missing
    await sql`
      UPDATE customers
      SET image_url = COALESCE(image_url, '/customers/default.png');
    `;

    return Response.json({ message: 'Seeded tutorial-style dataset (cents).' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Seed Error]', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
