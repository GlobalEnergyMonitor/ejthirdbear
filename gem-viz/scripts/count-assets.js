import duckdb from 'duckdb';
import dotenv from 'dotenv';

dotenv.config();

const { Database } = duckdb;
const MOTHERDUCK_TOKEN = process.env.PUBLIC_MOTHERDUCK_TOKEN;

const db = new Database(':memory:', async (err) => {
  if (err) {
    console.error('Failed to create database:', err);
    process.exit(1);
  }

  db.exec(`
    INSTALL motherduck;
    LOAD motherduck;
    SET motherduck_token='${MOTHERDUCK_TOKEN}';
    ATTACH 'md:gem_data' AS gem;
    USE gem;
  `, async (err) => {
    if (err) {
      console.error('Failed to connect:', err);
      process.exit(1);
    }

    db.all(`
      SELECT table_name, row_count
      FROM catalog
      WHERE LOWER(table_name) NOT IN ('about', 'metadata', 'readme')
        AND row_count > 100
      ORDER BY row_count DESC
    `, (err, rows) => {
      if (err) {
        console.error('Query failed:', err);
        process.exit(1);
      }

      console.log('\nTables and row counts:');
      let total = 0;
      rows.forEach(row => {
        const count = typeof row.row_count === 'bigint' ? Number(row.row_count) : row.row_count;
        total += count;
        console.log(`  ${row.table_name}: ${count.toLocaleString()} rows`);
      });

      console.log(`\nTotal rows across all tables: ${total.toLocaleString()}`);

      // Estimate build size at 1KB per page
      const htmlSizeMB = (total * 1024) / (1024 * 1024);
      const clientBundleMB = 6.4;
      const serverBundleMB = 1.4;
      const totalBuildMB = htmlSizeMB + clientBundleMB + serverBundleMB;

      console.log(`\nBuild size estimate:`);
      console.log(`  HTML pages: ${htmlSizeMB.toFixed(1)} MB (${total.toLocaleString()} × 1KB)`);
      console.log(`  Client bundles: ${clientBundleMB} MB`);
      console.log(`  Server bundles: ${serverBundleMB} MB`);
      console.log(`  Total: ~${totalBuildMB.toFixed(1)} MB\n`);

      db.close();
      process.exit(0);
    });
  });
});
