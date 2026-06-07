// Example player pool (add more as needed)
let playerPool = [];

fetch('goatPlayers_with_img.json')
  .then(response => response.json())
  .then(data => {
    playerPool = data;
    console.log("Loaded players:", playerPool); // Add this line
    randomizeTiles();
  });

const positions = [
    { key: "PG", label: "Point Guard (PG)" },
    { key: "SG", label: "Shooting Guard (SG)" },
    { key: "SF", label: "Small Forward (SF)" },
    { key: "PF", label: "Power Forward (PF)" },
    { key: "C",  label: "Center (C)" },
    { key: "6th", label: "6th Man" }
];

let selectedPlayers = {}; // { PG: playerObj, ... }
let currentTiles = {};    // { PG: playerObj, ... }

function getRandomPlayerForPosition(posKey, excludeNames = []) {
    let pool;
    if (posKey === "6th") {
        // For 6th Man, allow any player not already selected
        pool = playerPool.filter(
            p => !excludeNames.includes(p.name)
        );
    } else {
        // For other positions, filter by position
        pool = playerPool.filter(
            p => p.pos.includes(posKey) && !excludeNames.includes(p.name)
        );
    }
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

function randomizeTiles() {
    positions.forEach(pos => {
        if (!selectedPlayers[pos.key]) {
            // Exclude already selected players for other positions
            const exclude = Object.values(selectedPlayers).map(p => p.name);
            currentTiles[pos.key] = getRandomPlayerForPosition(pos.key, exclude);
        }
    });
    renderTiles();
}

function selectPlayer(posKey) {
    selectedPlayers[posKey] = currentTiles[posKey];
    renderTiles();
    checkGoal();
    // Automatically randomize after selection if not all positions are filled
    if (Object.keys(selectedPlayers).length < positions.length) {
        setTimeout(randomizeTiles, 400); // slight delay for UX
    }
}

function renderTiles() {
    const container = document.getElementById('lineupContainer');
    container.innerHTML = '';
    // Track already selected player names to avoid duplicates
    const usedNames = new Set(Object.values(selectedPlayers).map(p => p && p.name));
    positions.forEach(pos => {
        let player = selectedPlayers[pos.key] || currentTiles[pos.key];
        // If the player is already selected for another position, pick a new random one
        if (player && usedNames.has(player.name) && !selectedPlayers[pos.key]) {
            // Exclude already selected players
            const exclude = Array.from(usedNames);
            player = getRandomPlayerForPosition(pos.key, exclude);
            currentTiles[pos.key] = player;
        }
        const isSelected = !!selectedPlayers[pos.key];
        const tile = document.createElement('div');
        tile.className = 'player-tile' + (isSelected ? ' selected' : '');
        tile.innerHTML = `
            <div class="tile-title">${pos.key}</div>
            <img class="player-img" src="${player ? player.img : ''}" alt="${player ? player.name : ''}">
            <div class="player-name">${player ? player.name : '---'}</div>
            <button class="select-btn" ${isSelected ? 'disabled' : ''}>
                ${isSelected ? 'Selected' : 'Select'}
            </button>
        `;
        tile.querySelector('.select-btn').onclick = () => {
            if (!isSelected) selectPlayer(pos.key);
        };
        container.appendChild(tile);
    });
}

// Max achievable score: PG=16 (Magic/Curry), SG=18 (Jordan/Kobe), SF=18 (LeBron),
// PF=16 (Duncan/KG), C=18 (Shaq), 6th=18 (remaining GOAT) → 104
const MAX_LINEUP_SCORE = 104;

function getLineupRecord(selectedPlayers) {
    let totalScore = 0;
    positions.forEach(pos => {
        const player = selectedPlayers[pos.key];
        if (player) totalScore += player.score || 0;
    });
    const wins = Math.min(82, Math.floor(totalScore / MAX_LINEUP_SCORE * 82));
    return { wins, losses: Math.max(0, 82 - wins) };
}

function checkGoal() {
    const filledCount = Object.keys(selectedPlayers).length;
    const msgEl = document.getElementById('goalMessage');

    if (filledCount === 0) {
        msgEl.textContent = "Select one player for each position to build your dream team!";
        return;
    }

    if (filledCount === positions.length) {
        const { wins, losses } = getLineupRecord(selectedPlayers);
        if (wins === 82 && losses === 0) {
            msgEl.textContent = "Congrats! You built your 82-0 GOAT lineup!";
        } else {
            msgEl.textContent = `Final record: ${wins}-${losses}. Try to find the 82-0 combo!`;
        }
        return;
    }

    // Project the final record based on the average score of picked players so far
    const partialScore = Object.values(selectedPlayers).reduce((sum, p) => sum + (p.score || 0), 0);
    const avgScore = partialScore / filledCount;
    const projectedTotal = Math.round(avgScore * positions.length);
    const projected = Math.min(82, Math.floor(projectedTotal / MAX_LINEUP_SCORE * 82));
    const projLosses = Math.max(0, 82 - projected);
    msgEl.textContent = `${filledCount}/${positions.length} picked — Projected record: ${projected}-${projLosses}`;
}

function restartGame() {
    selectedPlayers = {};
    currentTiles = {};
    randomizeTiles();
    document.getElementById('goalMessage').textContent = "Select one player for each position to build your dream team!";
}

// call to randomize the tiles  
randomizeTiles();