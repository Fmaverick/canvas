const fs = require("fs");
const postgres = require("postgres");
const rawUrl = process.env.DATABASE_URL || process.env.PG_URL;
(async () => {
  if (rawUrl === undefined || rawUrl === "") {
    fs.writeFileSync("/Users/hjr/canvas/.trae/checkdb-result.json", JSON.stringify({ ok: false, reason: "missing_db_url" }, null, 2));
    return;
  }
  const parsed = new URL(rawUrl);
  parsed.searchParams.delete("directConnection");
  const sql = postgres(parsed.toString(), { prepare: false });
  let result = {};
  try {
    const tables = await sql.unsafe("select table_name from information_schema.tables where table_schema = 'public' and table_name in ('__drizzle_migrations','assets','library_items') order by table_name");
    const assetCols = await sql.unsafe("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'assets' and column_name like 'volcengine%' order by ordinal_position");
    const itemCols = await sql.unsafe("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'library_items' and column_name like 'volcengine%' order by ordinal_position");
    result = { ok: true, tables: tables.map((r) => r.table_name), assetCols: assetCols.map((r) => r.column_name), itemCols: itemCols.map((r) => r.column_name) };
  } catch (e) {
    result = { ok: false, reason: "db_query_failed", message: e && e.message ? e.message : String(e), code: e && e.code ? e.code : null };
  } finally {
    await sql.end({ timeout: 1 });
  }
  fs.writeFileSync("/Users/hjr/canvas/.trae/checkdb-result.json", JSON.stringify(result, null, 2));
})();
