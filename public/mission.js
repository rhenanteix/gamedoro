// public/mission.js

const missionContainer = document.getElementById('missions');
if (missionContainer) {
  async function loadMissions() {
    const resp = await fetch('/api/missions');
    if (!resp.ok) throw new Error('Failed to load missions');
    const data = await resp.json();
    const missions = data.missions || [];
    missionContainer.innerHTML = missions.map(m => `
      <div class="mission glass">
        <p>${m.description}</p>
        <button class="complete" data-id="${m.id}">Concluir</button>
      </div>`).join('');
  }

  missionContainer.addEventListener('click', async e => {
    if (e.target.matches('.complete')) {
      const id = e.target.dataset.id;
      const resp = await fetch('/api/missions/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ missionId: id })
      });
      if (!resp.ok) {
        const err = await resp.json();
        console.error(err.error || 'Error completing mission');
      }
      loadMissions();
    }
  });

  loadMissions();
}
