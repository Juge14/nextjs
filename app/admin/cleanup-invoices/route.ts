
export const runtime = 'nodejs';
import { sql } from '@vercel/postgres';

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new Response('Forbidden', { status: 403 });
  }

  try {
    // 1) Find duplicates
    const dupes = await sql<{
      customer_id: string;
      amount: number;
      date: string;
      count: number;
    }>`
      SELECT customer_id, amount, date, COUNT(*)::int AS count
      FROM invoices
      GROUP BY customer_id, amount, date
      HAVING COUNT(*) > 1
      ORDER BY count DESC;
    `;

    // If none, we’re done
    if (dupes.rows.length === 0) {
      return Response.json({ message: 'No duplicate invoices found.' });
    }

    // 2) Delete duplicates (keep one row per group)
    const deleteResult = await sql`
      WITH dups AS (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY customer_id, amount, date
                 ORDER BY id
               ) AS rn
        FROM invoices
      )
      DELETE FROM invoices i
      USING dups
      WHERE i.id = dups.id
        AND dups.rn > 1;
    `;

    // 3) (Optional) create the unique index now that data is clean
    await sql`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_customer_amount_date
      ON invoices (customer_id, amount, date);
    `;

    return Response.json({
      message: 'Duplicates removed and unique index ensured.',
      duplicatesFound: dupes.rows,
      deleteCommand: 'completed',
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return Response.json({ error: msg }, { status: 500 });
  }
}
