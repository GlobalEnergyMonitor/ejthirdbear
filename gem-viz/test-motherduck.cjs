const duckdb = require('duckdb');
require('dotenv').config();

// Use the JWT token (second PUBLIC_MOTHERDUCK_TOKEN line in .env)
const token = process.env.PUBLIC_MOTHERDUCK_TOKEN;
console.log('Token exists:', !!token, 'length:', token?.length);

const db = new duckdb.Database(':memory:');
const conn = db.connect();

conn.run('INSTALL motherduck; LOAD motherduck;', (err) => {
  if (err) {
    console.log('Install error:', err.message);
    return;
  }
  console.log('MotherDuck extension loaded');

  conn.run(`SET motherduck_token='${token}';`, (err2) => {
    if (err2) {
      console.log('Token error:', err2.message);
      return;
    }
    console.log('Token set');

    // Attach the MotherDuck database
    conn.run(`ATTACH 'md:gem_data';`, (err3) => {
      if (err3) {
        console.log('Attach error:', err3.message);
        return;
      }
      console.log('Database attached');

      conn.all('SELECT COUNT(*) as cnt FROM gem_data.global_energy_ownership_tracker_october_2025_v1.asset_ownership', (err4, rows) => {
        if (err4) {
          console.log('Query error:', err4.message);
        } else {
          console.log('Query success:', rows);
        }
        db.close();
      });
    });
  });
});
