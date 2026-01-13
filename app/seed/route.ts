
// app/seed/route.ts
export const runtime = 'nodejs';

import { sql } from '@vercel/postgres';

export async function GET() {
  // Block seeding on production for safety
  if (process.env.NODE_ENV === 'production') {
    return new Response('Forbidden in production', { status: 403 });
  }

  try {
    // 1) Extension
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;

    // 2) Ensure base tables exist
    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
        -- image_url will be added below if missing
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL, -- 'paid' | 'pending'
        date DATE DEFAULT CURRENT_DATE
      );
    `;

    // 3) Bring schema up to date regardless of previous state
    await sql`ALTER TABLE customers ADD COLUMN IF NOT EXISTS image_url TEXT;`;
    await sql`ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS date DATE DEFAULT CURRENT_DATE;`;
    await sql`ALTER TABLE invoices  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending';`;

    // 4) Seed customers (now that image_url exists)
    await sql`
      INSERT INTO customers (name, email, image_url)
      VALUES
        ('Evil Rabbit',     'evil@example.com',       '/customers/evil-rabbit.png'),
        ('Acme Corp',       'acme@example.com',       '/customers/acme.png'),
        ('Globex',          'globex@example.com',     '/customers/globex.png'),
        ('Soylent',         'soylent@example.com',    '/customers/soylent.png'),
        ('Blue Bottle',     'bluebottle@example.com', '/customers/blue-bottle.png'),
        ('Orange Inc',      'orange@example.com',     '/customers/orange-inc.png'),
        ('Lime Green',      'lime@example.com',       '/customers/lime-green.png'),
        ('Pink Panther',    'pink@example.com',       '/customers/pink-panther.png'),
        ('Red Rocket',      'red@example.com',        '/customers/red-rocket.png'),
        ('Yellow Bird',     'yellow@example.com',     '/customers/yellow-bird.png')
      ON CONFLICT (email) DO NOTHING;
    `;

    // Ensure any missing image_url is filled with a default
    await sql`
      UPDATE customers
      SET image_url = COALESCE(image_url, '/customers/default.png');
    `;

    // 5) Read customer IDs
    const { rows: customers } = await sql<{ id: string; name: string }>`
      SELECT id, name FROM customers;
    `;
    const idFor = (name: string) => customers.find(c => c.name === name)?.id;

    // 6) Create a unique index to avoid duplicate invoice rows on repeated seeding
    await sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE c.relname = 'uniq_invoices_customer_amount_date'
            AND n.nspname = 'public'
        ) THEN
          CREATE UNIQUE INDEX uniq_invoices_customer_amount_date
            ON invoices (customer_id, amount, date);
        END IF;
      END$$;
    `;

    // 7) Seed invoices
    const seeds = [
      { name: 'Evil Rabbit', amount: 666,  status: 'paid',    date: '2025-01-15' },
      { name: 'Evil Rabbit', amount: 320,  status: 'pending', date: '2025-02-10' },
      { name: 'Evil Rabbit', amount: 980,  status: 'paid',    date: '2025-03-05' },
      { name: 'Acme Corp',   amount: 1200, status: 'pending', date: '2025-01-20' },
      { name: 'Acme Corp',   amount: 300,  status: 'paid',    date: '2025-02-18' },
      { name: 'Acme Corp',   amount: 450,  status: 'paid',    date: '2025-03-28' },
      { name: 'Globex',      amount: 800,  status: 'paid',    date: '2025-01-10' },
      { name: 'Globex',      amount: 500,  status: 'pending', date: '2025-02-22' },
      { name: 'Soylent',     amount: 300,  status: 'paid',    date: '2025-01-05' },
      { name: 'Soylent',     amount: 680,  status: 'pending', date: '2025-03-11' },
      { name: 'Blue Bottle', amount: 220,  status: 'paid',    date: '2025-01-08' },
      { name: 'Blue Bottle', amount: 420,  status: 'pending', date: '2025-02-09' },
      { name: 'Orange Inc',  amount: 615,  status: 'paid',    date: '2025-03-02' },
      { name: 'Lime Green',  amount: 155,  status: 'paid',    date: '2025-01-12' },
      { name: 'Lime Green',  amount: 710,  status: 'pending', date: '2025-03-17' },
      { name: 'Pink Panther',amount: 370,  status: 'paid',    date: '2025-02-04' },
      { name: 'Red Rocket',  amount: 990,  status: 'pending', date: '2025-02-14' },
      { name: 'Yellow Bird', amount: 260,  status: 'paid',    date: '2025-03-07' },
    ] as const;

    for (const s of seeds) {
      const cid = idFor(s.name);
      if (!cid) continue;
      await sql`  INSERT INTO invoices (customer_id, amount, status, date)  SELECT ${cid}::uuid, ${s.amount}, ${s.status}, ${s.date}::date  WHERE NOT EXISTS (    SELECT 1 FROM invoices    WHERE customer_id = ${cid}::uuid      AND amount = ${s.amount}      AND date = ${s.date}::date  );`;``
    }

    return Response.json({ message: 'Database seeded successfully (idempotent).' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Seed Error]', msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
