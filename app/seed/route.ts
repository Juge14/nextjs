
// app/seed/route.ts
export const runtime = 'nodejs';

import { sql } from '@vercel/postgres';

export async function GET() {
  // ❌ Do NOT allow seeding in production
  if (process.env.NODE_ENV === 'production') {
    return new Response('Forbidden in production', { status: 403 });
  }

  try {
    // 1) Create extension safely
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`;

    // 2) Create tables (safe if already exist)
    await sql`
      CREATE TABLE IF NOT EXISTS customers (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
        customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;

    // 3) Seed customers (won't duplicate)
    await sql`
      INSERT INTO customers (name, email)
      VALUES
        ('Acme Corp', 'acme@example.com'),
        ('Globex', 'globex@example.com'),
        ('Soylent', 'soylent@example.com')
      ON CONFLICT (email) DO NOTHING;
    `;

    // Get seeded customer ids
    const { rows: customers } = await sql`SELECT id, name FROM customers;`;

    const acme = customers.find(c => c.name === 'Acme Corp');
    const globex = customers.find(c => c.name === 'Globex');

    // 4) Seed invoices (won't duplicate)
    if (acme) {
      await sql`
        INSERT INTO invoices (customer_id, amount, status)
        VALUES
          (${acme.id}::uuid, 666, 'paid'),
          (${acme.id}::uuid, 1200, 'pending')
        ON CONFLICT DO NOTHING;
      `;
    }

    if (globex) {
      await sql`
        INSERT INTO invoices (customer_id, amount, status)
        VALUES
          (${globex.id}::uuid, 300, 'paid')
        ON CONFLICT DO NOTHING;
      `;
    }

    return Response.json({ message: "Database seeded successfully" });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
}
