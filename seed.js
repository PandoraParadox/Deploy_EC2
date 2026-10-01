const db = require('./db');

const projectCount = db.prepare('SELECT COUNT(*) AS count FROM projects').get().count;
if (projectCount === 0) {
  const insertProject = db.prepare('INSERT INTO projects (name, environment, repository) VALUES (?, ?, ?)');
  const api = insertProject.run('Order API', 'production', 'github.com/acme/order-api').lastInsertRowid;
  const web = insertProject.run('Storefront', 'staging', 'github.com/acme/storefront').lastInsertRowid;
  const worker = insertProject.run('Email Worker', 'production', 'github.com/acme/email-worker').lastInsertRowid;

  const insertDeployment = db.prepare('INSERT INTO deployments (project_id, version, status, deployed_by, deployed_at) VALUES (?, ?, ?, ?, ?)');
  insertDeployment.run(api, 'v2.4.1', 'success', 'Linh Nguyen', '2026-09-30 08:42:00');
  insertDeployment.run(web, 'v1.8.0', 'running', 'Minh Tran', '2026-09-30 09:18:00');
  insertDeployment.run(worker, 'v3.1.2', 'success', 'Linh Nguyen', '2026-09-29 16:25:00');

  const insertLog = db.prepare('INSERT INTO activity_logs (project_id, action, actor, created_at) VALUES (?, ?, ?, ?)');
  insertLog.run(api, 'deployed v2.4.1 to production', 'Linh Nguyen', '2026-09-30 08:42:00');
  insertLog.run(web, 'started deployment v1.8.0', 'Minh Tran', '2026-09-30 09:18:00');
  insertLog.run(worker, 'deployed v3.1.2 to production', 'Linh Nguyen', '2026-09-29 16:25:00');
}

console.log('Database ready.');
