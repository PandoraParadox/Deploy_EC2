require('dotenv').config();
const db = require('./db');

async function seed() {
  await db.init();
  const [{ count }] = await db.query('SELECT COUNT(*) AS count FROM projects');
  if (Number(count) === 0) {
    const [{ id: api }] = await db.query(
      'INSERT INTO projects (name, environment, repository) VALUES ($1, $2, $3) RETURNING id',
      ['Order API', 'production', 'github.com/acme/order-api']
    );
    const [{ id: web }] = await db.query(
      'INSERT INTO projects (name, environment, repository) VALUES ($1, $2, $3) RETURNING id',
      ['Storefront', 'staging', 'github.com/acme/storefront']
    );
    const [{ id: worker }] = await db.query(
      'INSERT INTO projects (name, environment, repository) VALUES ($1, $2, $3) RETURNING id',
      ['Email Worker', 'production', 'github.com/acme/email-worker']
    );

    const deployments = [
      [api, 'v2.4.1', 'success', 'Linh Nguyen', '2026-09-30T08:42:00Z'],
      [web, 'v1.8.0', 'running', 'Minh Tran', '2026-09-30T09:18:00Z'],
      [worker, 'v3.1.2', 'success', 'Linh Nguyen', '2026-09-29T16:25:00Z']
    ];
    for (const deployment of deployments) {
      await db.query(`
        INSERT INTO deployments (project_id, version, status, deployed_by, deployed_at)
        VALUES ($1, $2, $3, $4, $5)
      `, deployment);
    }

    const logs = [
      [api, 'deployed v2.4.1 to production', 'Linh Nguyen', '2026-09-30T08:42:00Z'],
      [web, 'started deployment v1.8.0', 'Minh Tran', '2026-09-30T09:18:00Z'],
      [worker, 'deployed v3.1.2 to production', 'Linh Nguyen', '2026-09-29T16:25:00Z']
    ];
    for (const log of logs) {
      await db.query(`
        INSERT INTO activity_logs (project_id, action, actor, created_at)
        VALUES ($1, $2, $3, $4)
      `, log);
    }
  }

  await db.close();
  console.log(`Database ready (${db.driver}).`);
}

seed().catch((error) => {
  console.error('Could not seed database:', error);
  process.exit(1);
});
