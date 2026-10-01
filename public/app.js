const elements = {
  projectStat: document.querySelector('#projectStat'),
  successStat: document.querySelector('#successStat'),
  activeStat: document.querySelector('#activeStat'),
  failedStat: document.querySelector('#failedStat'),
  activeNavCount: document.querySelector('#activeNavCount'),
  deploymentRows: document.querySelector('#deploymentRows'),
  activityList: document.querySelector('#activityList'),
  projectId: document.querySelector('#projectId'),
  form: document.querySelector('#deployForm'),
  message: document.querySelector('#formMessage')
};

const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[character]));
const formatTime = (date) => new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(`${date.replace(' ', 'T')}Z`));

async function loadDashboard() {
  const response = await fetch('/api/dashboard');
  if (!response.ok) throw new Error('Could not load dashboard');
  const { stats, deployments, activity } = await response.json();
  elements.projectStat.textContent = stats.projects;
  elements.successStat.textContent = stats.successful_deployments;
  elements.activeStat.textContent = stats.active_deployments;
  elements.failedStat.textContent = stats.failed_deployments;
  elements.activeNavCount.textContent = stats.active_deployments;
  elements.deploymentRows.innerHTML = deployments.length ? deployments.map((item) => `
    <tr><td>${escapeHtml(item.project_name)} <span class="environment">· ${escapeHtml(item.environment)}</span></td><td class="version">${escapeHtml(item.version)}</td><td><span class="status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td><td>${escapeHtml(item.deployed_by)}</td><td>${formatTime(item.deployed_at)}</td></tr>
  `).join('') : '<tr><td colspan="5" class="loading">No deployments yet.</td></tr>';
  elements.activityList.innerHTML = activity.length ? activity.map((item) => `
    <div class="timeline-item"><p><strong>${escapeHtml(item.project_name)}</strong> ${escapeHtml(item.action)}</p><small>${escapeHtml(item.actor)} · ${formatTime(item.created_at)}</small></div>
  `).join('') : '<div class="loading">No activity yet.</div>';
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  const projects = await response.json();
  elements.projectId.innerHTML = projects.map((project) => `<option value="${project.id}">${escapeHtml(project.name)} · ${escapeHtml(project.environment)}</option>`).join('');
}

elements.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = elements.form.querySelector('button');
  button.disabled = true;
  elements.message.textContent = 'Starting deployment...';
  try {
    const response = await fetch('/api/deployments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId: Number(elements.projectId.value), version: document.querySelector('#version').value, deployedBy: document.querySelector('#deployedBy').value }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    elements.message.textContent = `Deployment ${result.id} started successfully.`;
    document.querySelector('#version').value = '';
    await loadDashboard();
  } catch (error) { elements.message.textContent = error.message; } finally { button.disabled = false; }
});

document.querySelector('#refreshButton').addEventListener('click', loadDashboard);
Promise.all([loadDashboard(), loadProjects()]).catch(() => { elements.message.textContent = 'Could not connect to the server.'; });
