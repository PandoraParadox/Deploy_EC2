const path = require('node:path');
const express = require('express');
const db = require('./db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'launchpad', timestamp: new Date().toISOString() });
});

app.get('/api/dashboard', (req, res) => {
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM deployments WHERE status = 'success') AS successful_deployments,
      (SELECT COUNT(*) FROM deployments WHERE status = 'running') AS active_deployments,
      (SELECT COUNT(*) FROM deployments WHERE status = 'failed') AS failed_deployments
  `).get();

  const deployments = db.prepare(`
    SELECT d.id, d.version, d.status, d.deployed_by, d.deployed_at,
           p.name AS project_name, p.environment
    FROM deployments d
    JOIN projects p ON p.id = d.project_id
    ORDER BY datetime(d.deployed_at) DESC
    LIMIT 6
  `).all();

  const activity = db.prepare(`
    SELECT a.action, a.actor, a.created_at, p.name AS project_name
    FROM activity_logs a
    JOIN projects p ON p.id = a.project_id
    ORDER BY datetime(a.created_at) DESC
    LIMIT 5
  `).all();

  res.json({ stats, deployments, activity });
});

app.get('/api/projects', (req, res) => {
  const projects = db.prepare(`
    SELECT p.id, p.name, p.environment, p.repository, p.created_at,
           COUNT(d.id) AS deployment_count
    FROM projects p
    LEFT JOIN deployments d ON d.project_id = p.id
    GROUP BY p.id
    ORDER BY p.name
  `).all();
  res.json(projects);
});

app.post('/api/deployments', (req, res) => {
  const { projectId, version, deployedBy } = req.body;
  if (!Number.isInteger(Number(projectId)) || !version?.trim() || !deployedBy?.trim()) {
    return res.status(400).json({ error: 'projectId, version and deployedBy are required.' });
  }

  const project = db.prepare('SELECT id, name, environment FROM projects WHERE id = ?').get(projectId);
  if (!project) return res.status(404).json({ error: 'Project not found.' });

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const createDeployment = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO deployments (project_id, version, status, deployed_by, deployed_at)
      VALUES (?, ?, 'running', ?, ?)
    `).run(projectId, version.trim(), deployedBy.trim(), now);
    db.prepare(`
      INSERT INTO activity_logs (project_id, action, actor, created_at)
      VALUES (?, ?, ?, ?)
    `).run(projectId, `started deployment ${version.trim()}`, deployedBy.trim(), now);
    return result.lastInsertRowid;
  });

  const id = createDeployment();
  res.status(201).json({ id, project, status: 'running' });
});

app.listen(port, () => {
  console.log(`Launchpad is running at http://localhost:${port}`);
});
