// public/mission.js
import { fetchJson } from './shared.js';

const missionContainer = document.getElementById('missions');
if (missionContainer) {
  async function loadMissions() {
    const { missions } = await fetchJson('/api/missions');
    missionContainer.innerHTML = missions.map(m => `
      <div class="mission glass">
        <p>${m.description}</p>
        <button class="complete" data-id="${m.id}">Concluir</button>
      </div>`).join('');
  }

  missionContainer.addEventListener('click', async e => {
    if (e.target.matches('.complete')) {
      const id = e.target.dataset.id;
      await fetchJson('/api/missions/complete', { method: 'POST', body: { missionId: id } });
      loadMissions();
    }
  });

  loadMissions();
}
