require('dotenv').config();
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

app.get('/api/dashboard', async (req, res, next) => {
  try {
    const [stats] = await db.query(`
    SELECT
      (SELECT COUNT(*) FROM projects) AS projects,
      (SELECT COUNT(*) FROM deployments WHERE status = 'success') AS successful_deployments,
      (SELECT COUNT(*) FROM deployments WHERE status = 'running') AS active_deployments,
      (SELECT COUNT(*) FROM deployments WHERE status = 'failed') AS failed_deployments
  `);

    const deployments = await db.query(`
    SELECT d.id, d.version, d.status, d.deployed_by, d.deployed_at,
           p.name AS project_name, p.environment
    FROM deployments d
    JOIN projects p ON p.id = d.project_id
    ORDER BY d.deployed_at DESC
    LIMIT 6
  `);

    const activity = await db.query(`
    SELECT a.action, a.actor, a.created_at, p.name AS project_name
    FROM activity_logs a
    JOIN projects p ON p.id = a.project_id
    ORDER BY a.created_at DESC
    LIMIT 5
  `);

    res.json({ stats, deployments, activity });
  } catch (error) {
    next(error);
  }
});

app.get('/api/projects', async (req, res, next) => {
  try {
    const projects = await db.query(`
    SELECT p.id, p.name, p.environment, p.repository, p.created_at,
           COUNT(d.id) AS deployment_count
    FROM projects p
    LEFT JOIN deployments d ON d.project_id = p.id
    GROUP BY p.id
    ORDER BY p.name
  `);
    res.json(projects);
  } catch (error) {
    next(error);
  }
});

app.post('/api/deployments', async (req, res, next) => {
  try {
    const { projectId, version, deployedBy } = req.body;
    if (!Number.isInteger(Number(projectId)) || !version?.trim() || !deployedBy?.trim()) {
      return res.status(400).json({ error: 'projectId, version and deployedBy are required.' });
    }

    const [project] = await db.query('SELECT id, name, environment FROM projects WHERE id = $1', [projectId]);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const now = new Date().toISOString();
    const [deployment] = await db.query(`
      INSERT INTO deployments (project_id, version, status, deployed_by, deployed_at)
      VALUES ($1, $2, 'running', $3, $4)
      RETURNING id
    `, [projectId, version.trim(), deployedBy.trim(), now]);
    await db.query(`
      INSERT INTO activity_logs (project_id, action, actor, created_at)
      VALUES ($1, $2, $3, $4)
    `, [projectId, `started deployment ${version.trim()}`, deployedBy.trim(), now]);

    res.status(201).json({ id: deployment.id, project, status: 'running' });
  } catch (error) {
    next(error);
  }
});

async function start() {
  await db.init();
  app.listen(port, () => {
    console.log(`Launchpad is running at http://localhost:${port} (${db.driver})`);
  });
}

start().catch((error) => {
  console.error('Could not initialize database:', error);
  process.exit(1);
});
