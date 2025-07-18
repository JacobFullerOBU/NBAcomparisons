document.addEventListener('DOMContentLoaded', () => {
    let playerPool = [];
    let userTeam = {};
    let cpuTeam = {};
    let currentDraftPositionIndex = 0;
    const positions = ["PG", "SG", "SF", "PF", "C", "6th"];

    // DOM Elements
    const userGrid = document.getElementById('userPlayerGrid');
    const cpuGrid = document.getElementById('cpuPlayerGrid');
    const battleButton = document.getElementById('battleButton');
    const gameMessage = document.getElementById('gameMessage');

    // New draft area elements
    const draftArea = document.getElementById('draft-selection-area');
    const selectionGrid = document.getElementById('selectionGrid');
    const selectionTitle = document.getElementById('selectionTitle');

    // Results Modal Elements
    const resultsModal = document.getElementById('resultsModal');
    const simulationLog = document.getElementById('simulationLog');
    const finalScoreEl = document.getElementById('finalScore');
    const userBoxScoreTable = document.querySelector('#userBoxScore table');
    const cpuBoxScoreTable = document.querySelector('#cpuBoxScore table');
    const playAgainButton = document.getElementById('playAgainButton');

    // Hide reroll button as it's not used in this flow
    const rerollButton = document.getElementById('rerollButton');
    if (rerollButton) rerollButton.style.display = 'none';

    fetch('playerAttributes.json')
        .then(response => response.json())
        .then(data => {
            playerPool = data.players.filter(p => p && p.name);
            if (playerPool.length > 0) {
                initializeGame();
            } else {
                gameMessage.textContent = "Failed to load valid player data.";
            }
        })
        .catch(error => console.error('Error fetching player data:', error));

    let bonusModifiers = [];

    fetch('bonusModifiers.json')
        .then(response => response.json())
        .then(data => {
            bonusModifiers = data;
            // ...existing player fetch/init logic...
        });

    let gameEvents = [];

    fetch('gameEvents.json')
        .then(response => response.json())
        .then(data => {
            gameEvents = data;
        });

    function initializeGame() {
        userTeam = {};
        cpuTeam = {};
        currentDraftPositionIndex = 0;
        battleButton.disabled = true;
        generateCpuTeam();
        renderCpuGrid();
        renderUserGrid(); // Render empty slots initially
        startDraftForPosition(currentDraftPositionIndex);
    }

    function getRandomPlayer(pos, exclude = []) {
        const eligiblePlayers = playerPool.filter(p => {
            // If pos is 'ANY', we don't filter by position. Otherwise, we check.
            const isCorrectPosition = pos === 'ANY' || pos === '6th' || (p.position && p.position.includes(pos));
            return isCorrectPosition && !exclude.some(ex => ex && ex.name === p.name);
        });
        if (eligiblePlayers.length === 0) {
            // Fallback: if no player is found for a specific position, grab any player.
            const fallbackPlayers = playerPool.filter(p => !exclude.some(ex => ex && ex.name === p.name));
            if (fallbackPlayers.length === 0) return null;
            return fallbackPlayers[Math.floor(Math.random() * fallbackPlayers.length)];
        };
        return eligiblePlayers[Math.floor(Math.random() * eligiblePlayers.length)];
    }

    function generateCpuTeam() {
        const excludedForCpu = [];
        positions.forEach(pos => {
            // Find the best available player for this position
            const eligiblePlayers = playerPool.filter(p => {
                const isCorrectPosition = pos === 'ANY' || pos === '6th' || (p.position && p.position.includes(pos));
                return isCorrectPosition && !excludedForCpu.some(ex => ex && ex.name === p.name);
            });
            if (eligiblePlayers.length === 0) return;

            // After sorting by score, pick from the top 2-3
            const sorted = eligiblePlayers
                .map(p => {
                    let score = 0;
                    if (p.stats) {
                        Object.keys(STAT_WEIGHTS).forEach(attr => {
                            score += (p.stats[attr] || 0) * (STAT_WEIGHTS[attr] || 1);
                        });
                    }
                    return {
                        player: p,
                        score
                    };
                })
                .sort((a, b) => b.score - a.score);

            const pickFromTop = Math.min(3, sorted.length);
            const bestPlayer = sorted[Math.floor(Math.random() * pickFromTop)].player;
            cpuTeam[pos] = bestPlayer;
            excludedForCpu.push(bestPlayer);
        });
    }

    function startDraftForPosition(index) {
        if (index >= positions.length) {
            checkCompletion();
            return;
        }

        const pos = positions[index];
        selectionTitle.textContent = `Choose Your Player`;
        selectionGrid.innerHTML = '';

        const excludedForDraft = [...Object.values(userTeam), ...Object.values(cpuTeam)];
        const options = [];

        const corePositions = ["PG", "SG", "SF", "PF", "C"];
        const userTeamPositions = Object.values(userTeam).map(p => p.position);
        const neededPositions = corePositions.filter(p => !userTeamPositions.includes(p));

        let draftModePos;
        // For the first 4 picks, allow any position. For the last 2, guarantee needed positions.
        if (index < 4 && neededPositions.length > 0) {
            gameMessage.textContent = `Select any player for the ${pos} slot.`;
            draftModePos = 'ANY';
        } else {
            // If there are still core positions needed, pick one of them.
            if (neededPositions.length > 0) {
                gameMessage.textContent = `Your team needs a ${neededPositions.join('/')}. Select one.`;
                // Pick a random needed position to offer players from
                draftModePos = neededPositions[Math.floor(Math.random() * neededPositions.length)];
            } else {
                // If all core positions are filled, the 6th man can be anyone
                gameMessage.textContent = `Your core team is set! Choose a 6th man.`;
                draftModePos = 'ANY';
            }
        }

        for (let i = 0; i < 5; i++) {
            const option = getRandomPlayer(draftModePos, [...excludedForDraft, ...options]);
            if (option) options.push(option);
        }

        options.forEach(player => {
            const card = createPlayerCard(player, player.position || 'Bench'); // Show actual position on card
            card.onclick = () => selectPlayer(player); // Pass only the player object
            selectionGrid.appendChild(card);
        });

        draftArea.style.display = 'block';
    }

    function selectPlayer(player) {
        const primaryPos = player.position;

        // Check if the player's primary position is available
        if (primaryPos && !userTeam[primaryPos]) {
            userTeam[primaryPos] = player;
        }
        // If primary position is taken or doesn't exist, try the 6th man slot
        else if (!userTeam['6th']) {
            userTeam['6th'] = player;
        }
        // If both are taken, find the first available empty slot from the core positions
        else {
            const openSlot = positions.find(p => p !== '6th' && !userTeam[p]);
            if (openSlot) {
                userTeam[openSlot] = player;
            }
            // If no slots are open, the pick can't be made (this is a fallback)
            else {
                console.error("No available slot for this player.");
                // Don't advance the draft if no slot is found
                return;
            }
        }

        renderUserGrid();
        renderCpuGrid();

        currentDraftPositionIndex++;
        startDraftForPosition(currentDraftPositionIndex);
    }

    function createPlayerCard(player, title) {
        const card = document.createElement('div');
        card.className = 'player-card';

        if (!player) {
            card.innerHTML = `<div class="card-title">${title}</div>`;
            return card;
        }

        // --- Archetype Icon Logic ---
        const archetypeIcons = {
            '3PT Specialist': 'fa-solid fa-crosshairs',
            'Slasher': 'fa-solid fa-bolt',
            'Lockdown Defender': 'fa-solid fa-shield-halved',
            'Floor General': 'fa-solid fa-chess-king',
            'Mid-Range Assassin': 'fa-solid fa-bullseye',
            'All-Around': 'fa-solid fa-star',
            'Gravity': 'fa-solid fa-magnet'
        };

        let archetypeIconsHtml = '<div class="archetype-icons">';
        if (player.tags) {
            player.tags.forEach(tag => {
                if (archetypeIcons[tag]) {
                    archetypeIconsHtml += `<i class="${archetypeIcons[tag]}" title="${tag}"></i>`;
                }
            });
        }
        archetypeIconsHtml += '</div>';
        // --- End of Icon Logic ---

        // Build stats HTML
        let statsHtml = '<div class="player-stats">';
        for (const [stat, value] of Object.entries(player.stats)) {
            statsHtml += `<div class="stat-item">
                            <span class="stat-name">${stat.substring(0, 3).toUpperCase()}</span>
                            <span class="stat-value">${value}</span>
                          </div>`;
        }
        statsHtml += '</div>';

        // Build tags HTML
        let tagsHtml = '<div class="player-tags">';
        if (player.tags && player.tags.length > 0) {
            player.tags.forEach(tag => {
                tagsHtml += `<span class="tag-badge">${tag}</span>`;
            });
        }
        tagsHtml += '</div>';

        card.innerHTML = `
            ${archetypeIconsHtml}
            <div class="card-title">${title}</div>
            <img src="${player.photo}" alt="${player.name}" style="width:120px; height:auto;">
            <div>${player.name}</div>
            ${statsHtml}
            ${tagsHtml}
        `;
        return card;
    }

    function renderUserGrid() {
        userGrid.innerHTML = '';
        positions.forEach(pos => {
            const player = userTeam[pos];
            const card = createPlayerCard(player, pos);
            if (player) {
                card.classList.add('selected');
            }
            userGrid.appendChild(card);
        });
    }

    function renderCpuGrid() {
        cpuGrid.innerHTML = '';
        positions.forEach(pos => {
            // Check if the user has drafted for this position yet
            if (userTeam[pos]) {
                const player = cpuTeam[pos];
                const card = createPlayerCard(player, pos);
                card.classList.add('selected');
                cpuGrid.appendChild(card);
            } else {
                // If not, render a placeholder card
                const placeholderCard = createPlayerCard(null, pos);
                cpuGrid.appendChild(placeholderCard);
            }
        });
    }

    function checkCompletion() {
        if (Object.keys(userTeam).length === positions.length) {
            // Let the user pick a modifier card (or skip)
            showModifierCardModal(bonusModifiers, function (selectedCards) {
                if (selectedCards && selectedCards.length) {
                    selectedCards.forEach(card => applyModifier(userTeam, card));
                    gameMessage.innerHTML = `You picked bonus cards:<br>` +
                        selectedCards.map(card => `<strong>${card.name}</strong> - ${card.description}`).join('<br>');
                } else {
                    gameMessage.textContent = "Your team is ready! Hit Start Battle!";
                }
                battleButton.disabled = false;
                draftArea.style.display = 'none';
            });
        }
    }

    battleButton.addEventListener('click', startBattle);
    playAgainButton.addEventListener('click', () => {
        resultsModal.style.display = 'none';
        initializeGame();
    });

    // Define your stat weights (adjust as needed, further testing planned)
    const STAT_WEIGHTS = {
        offense: 1.0,
        defense: 1.2,
        playmaking: 0.8,
        athleticism: 0.7,
        clutch: 0.5,
        chemistry: 1.0
    };

    function calculateTeamRatings(team) {
        let totals = {
            offense: 0,
            defense: 0,
            playmaking: 0,
            athleticism: 0,
            clutch: 0,
            chemistry: 0
        };
        const players = Object.values(team).filter(p => p);

        players.forEach(p => {
            if (p && p.stats) {
                Object.keys(totals).forEach(attr => {
                    totals[attr] += p.stats[attr] || 0;
                });
            }
        });

        // Chemistry boost logic (unchanged)
        const teamAffiliations = {};
        players.forEach(p => {
            if (p && p.teams) {
                p.teams.forEach(teamName => {
                    if (!teamAffiliations[teamName]) teamAffiliations[teamName] = 0;
                    teamAffiliations[teamName]++;
                });
            }
        });
        let chemistryBoost = 0;
        const duoBonus = 10,
            trioBonus = 25;
        for (const teamName in teamAffiliations) {
            const playerCount = teamAffiliations[teamName];
            if (playerCount === 2) chemistryBoost += duoBonus;
            else if (playerCount >= 3) chemistryBoost += trioBonus;
        }
        totals.chemistry += chemistryBoost;

        // Calculate weighted team rating
        let weightedTotal = 0;
        Object.keys(totals).forEach(attr => {
            weightedTotal += (totals[attr] || 0) * (STAT_WEIGHTS[attr] || 1);
        });

        return {
            ...totals,
            weightedTotal
        };
    }

    function startBattle() {
        battleButton.disabled = true;
        const userRatings = calculateTeamRatings(userTeam);
        const cpuRatings = calculateTeamRatings(cpuTeam);

        // Pure stat-based scoring: sum of weighted stats, scaled to NBA range
        // You can tune the divisor (e.g., 2.5) to get typical NBA scores
        const baseScore = 80; // NBA teams rarely score less than 80
        const scalingFactor = 12; // Increase to lower scores, decrease to raise scores
        const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

        const userScoreRaw = baseScore + userRatings.weightedTotal / scalingFactor;
        const cpuScoreRaw = baseScore + cpuRatings.weightedTotal / scalingFactor;

        // Add a little randomness for realism
        const userScore = clamp(Math.round(userScoreRaw + (Math.random() * 6 - 3)), 80, 130);
        const cpuScore = clamp(Math.round(cpuScoreRaw + (Math.random() * 6 - 3)), 80, 130);

        // --- Quarter Simulation ---
        const quarters = 4;
        let userQuarterScores = [];
        let cpuQuarterScores = [];
        let eventLogs = []; // Collect event messages

        // NBA teams often have higher 2nd/3rd quarter, so use a profile
        const quarterProfile = [0.23, 0.27, 0.27, 0.23];

        for (let q = 0; q < quarters; q++) {
            // --- In-game events ---
            if (gameEvents.length > 0) {
                // User event
                const userEvent = gameEvents[Math.floor(Math.random() * gameEvents.length)];
                applyGameEvent(userTeam, userEvent, eventLogs, "Your Team: ");

                // CPU event
                const cpuEvent = gameEvents[Math.floor(Math.random() * gameEvents.length)];
                applyGameEvent(cpuTeam, cpuEvent, eventLogs, "CPU Team: ");
            }

            let userRand = 0.75 + Math.random() * 0.5;
            let cpuRand = 0.75 + Math.random() * 0.5;

            // 10% chance for a hot quarter (1.35x) or cold quarter (0.65x)
            if (Math.random() < 0.10) userRand *= (Math.random() < 0.5 ? 1.35 : 0.65);
            if (Math.random() < 0.10) cpuRand *= (Math.random() < 0.5 ? 1.35 : 0.65);

            let userQ, cpuQ;
            if (q === 3) {
                // 4th quarter: add clutch impact
                const clutchImpactUser = userRatings.clutch * (0.15 + Math.random() * 0.10); // 15-25% of clutch
                const clutchImpactCpu = cpuRatings.clutch * (0.15 + Math.random() * 0.10);
                userQ = Math.round(userScore * quarterProfile[q] * userRand + clutchImpactUser);
                cpuQ = Math.round(cpuScore * quarterProfile[q] * cpuRand + clutchImpactCpu);
            } else {
                userQ = Math.round(userScore * quarterProfile[q] * userRand);
                cpuQ = Math.round(cpuScore * quarterProfile[q] * cpuRand);
            }

            // Ensure no negative quarters
            userQ = Math.max(0, userQ);
            cpuQ = Math.max(0, cpuQ);

            userQuarterScores.push(userQ);
            cpuQuarterScores.push(cpuQ);
        }

        // Adjust last quarter so totals match exactly (including clutch)
        const userSoFar = userQuarterScores.reduce((a, b) => a + b, 0);
        const cpuSoFar = cpuQuarterScores.reduce((a, b) => a + b, 0);
        userQuarterScores[3] += userScore - userSoFar;
        cpuQuarterScores[3] += cpuScore - cpuSoFar;

        // Tiebreaker: if still tied, randomly add 1-2 points to one team
        let userTotal = userQuarterScores.reduce((a, b) => a + b, 0);
        let cpuTotal = cpuQuarterScores.reduce((a, b) => a + b, 0);
        if (userTotal === cpuTotal) {
            if (Math.random() < 0.5) {
                userQuarterScores[3] += Math.floor(Math.random() * 2) + 1;
                userTotal += 1;
            } else {
                cpuQuarterScores[3] += Math.floor(Math.random() * 2) + 1;
                cpuTotal += 1;
            }
        }

        simulationLog.innerHTML = '';
        finalScoreEl.innerHTML = '';
        resultsModal.style.display = 'flex';

        // Remove any previous chart instance
        if (window.quarterPointsChartInstance) {
            window.quarterPointsChartInstance.destroy();
        }

        // Render the quarter points chart
        const ctx = document.getElementById('quarterPointsChart').getContext('2d');
        window.quarterPointsChartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Q1', 'Q2', 'Q3', 'Q4'],
                datasets: [{
                        label: 'Your Team',
                        data: userQuarterScores,
                        backgroundColor: 'rgba(54, 162, 235, 0.7)'
                    },
                    {
                        label: 'CPU Team',
                        data: cpuQuarterScores,
                        backgroundColor: 'rgba(255, 99, 132, 0.7)'
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: 'Points by Quarter'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Points'
                        }
                    }
                }
            }
        });

        // Build log messages with event logs after each quarter
        const logMessages = [
            `End of 1st Quarter: You ${userQuarterScores[0]} - CPU ${cpuQuarterScores[0]}`,
            eventLogs[0] || "",
            eventLogs[1] || "",
            `Halftime (2nd Quarter): You ${userQuarterScores[0] + userQuarterScores[1]} - CPU ${cpuQuarterScores[0] + cpuQuarterScores[1]}`,
            eventLogs[2] || "",
            eventLogs[3] || "",
            `End of 3rd Quarter: You ${userQuarterScores.slice(0,3).reduce((a,b)=>a+b,0)} - CPU ${cpuQuarterScores.slice(0,3).reduce((a,b)=>a+b,0)}`,
            eventLogs[4] || "",
            eventLogs[5] || "",
            `Final Score: You ${userQuarterScores.reduce((a,b)=>a+b,0)} - CPU ${cpuQuarterScores.reduce((a,b)=>a+b,0)}`
        ];

        logMessages.forEach((msg, i) => {
            if (!msg) return; // Skip empty messages
            setTimeout(() => {
                const p = document.createElement('p');
                p.textContent = msg;
                simulationLog.appendChild(p);
                simulationLog.scrollTop = simulationLog.scrollHeight;
            }, i * 1200);
        });

        setTimeout(() => {
            displayFinalResults(
                userQuarterScores.reduce((a, b) => a + b, 0),
                cpuQuarterScores.reduce((a, b) => a + b, 0),
                userQuarterScores.reduce((a, b) => a + b, 0) > cpuQuarterScores.reduce((a, b) => a + b, 0) ? 'user' : 'cpu'
            );
        }, logMessages.length * 1200);
    }

    function displayTeamTotals(team, containerId) {
        const players = Object.values(team).filter(p => p);
        if (players.length === 0) return;

        // Sum up each attribute
        const totals = {
            offense: 0,
            defense: 0,
            playmaking: 0,
            athleticism: 0,
            clutch: 0,
            chemistry: 0
        };

        players.forEach(p => {
            if (p.stats) {
                Object.keys(totals).forEach(attr => {
                    totals[attr] += p.stats[attr] || 0;
                });
            }
        });

        // Create HTML output
        let html = `<div class="team-totals"><strong>Team Attribute Totals:</strong><br>`;
        Object.entries(totals).forEach(([attr, val]) => {
            html += `<span class="team-total-attr">${attr.charAt(0).toUpperCase() + attr.slice(1)}: <b>${val}</b></span><br>`;
        });
        html += `</div>`;

        // Output to the container
        const container = document.getElementById(containerId);
        if (container) {
            // Remove any previous totals
            let prev = container.querySelector('.team-totals');
            if (prev) prev.remove();
            container.insertAdjacentHTML('beforeend', html);
        }
    }

    // Call this in displayFinalResults after generating box scores:
    function displayFinalResults(userScore, cpuScore, winner) {
        const userScoreSpan = `<span class="${winner === 'user' ? 'winner' : 'loser'}">${userScore}</span>`;
        const cpuScoreSpan = `<span class="${winner === 'cpu' ? 'winner' : 'loser'}">${cpuScore}</span>`;
        finalScoreEl.innerHTML = `Your Team: ${userScoreSpan} - CPU Team: ${cpuScoreSpan}`;

        // Generate and display box scores
        generateBoxScore(userBoxScoreTable, userTeam, userScore);
        generateBoxScore(cpuBoxScoreTable, cpuTeam, cpuScore);

        // Show team attribute totals
        displayTeamTotals(userTeam, 'userBoxScore');
        displayTeamTotals(cpuTeam, 'cpuBoxScore');
    }

    function generateBoxScore(table, team, teamScore) {
        const players = Object.values(team).filter(p => p);
        if (players.length === 0) return;

        // Positional multipliers to generate more realistic stat lines
        const positionalMultipliers = {
            rebounds: {
                PG: 0.6,
                SG: 0.8,
                SF: 1.0,
                PF: 1.3,
                C: 1.5,
                '6th': 0.9
            },
            assists: {
                PG: 1.4,
                SG: 1.1,
                SF: 1.0,
                PF: 0.8,
                C: 0.7,
                '6th': 0.9
            }
        };

        let playerStats = [];
        let totalTeamPlaymaking = 0;
        let totalTeamOffense = 0;
        let totalReboundPotential = 0;

        players.forEach(p => {
            totalTeamPlaymaking += p.stats.playmaking;
            totalTeamOffense += p.stats.offense;

            // Calculate individual rebound potential to be used for distribution
            const playerPosition = p.position || '6th';
            const rebMultiplier = positionalMultipliers.rebounds[playerPosition] || 1.0;
            const reboundScore = (p.stats.defense * 0.7 + p.stats.athleticism * 0.3) * rebMultiplier;
            playerStats.push({
                player: p,
                pts: 0,
                reb: 0,
                ast: 0,
                reboundScore: reboundScore
            });
            totalReboundPotential += reboundScore;
        });

        // 1. Generate Assists and Rebounds for each player first
        let totalTeamAssists = 0;
        const targetTeamRebounds = 42 + Math.floor(Math.random() * 7); // Target ~45 rebounds

        playerStats.forEach(stat => {
            const p = stat.player;
            const playerPosition = p.position || '6th';
            const astMultiplier = positionalMultipliers.assists[playerPosition] || 1.0;

            // Distribute rebounds based on each player's share of the team's total rebound potential
            const shareOfRebounds = stat.reboundScore / totalReboundPotential;
            stat.reb = Math.round(targetTeamRebounds * shareOfRebounds);

            // Assists based on player's share of team's total playmaking, modified by position
            const ast = Math.round((((p.stats.playmaking / totalTeamPlaymaking) * (teamScore * 0.22)) + Math.random() * 2) * astMultiplier);
            stat.ast = ast;
            totalTeamAssists += ast;
        });

        // 2. Calculate points generated from assists
        let pointsFromAssists = 0;
        for (let i = 0; i < totalTeamAssists; i++) {
            pointsFromAssists += (Math.random() < 0.3) ? 3 : 2; // 30% chance of an assist being for a 3-pointer
        }

        // 3. Distribute all points (assisted and unassisted) based on offense rating
        let pointsToDistribute = teamScore;
        let distributedPoints = 0;

        playerStats.forEach((stat, index) => {
            const shareOfOffense = stat.player.stats.offense / totalTeamOffense;
            let calculatedPoints = 0;
            // Ensure the last player gets the remaining points to match the total score
            if (index === playerStats.length - 1) {
                calculatedPoints = pointsToDistribute - distributedPoints;
            } else {
                calculatedPoints = Math.round(pointsToDistribute * shareOfOffense);
            }
            stat.pts = calculatedPoints;
            distributedPoints += calculatedPoints;
        });

        // 4. Calculate totals and build the table body
        let totalPts = 0,
            totalReb = 0,
            totalAst = 0;
        let tableBodyHtml = '';
        playerStats.forEach(s => {
            tableBodyHtml += `<tr><td>${s.player.name}</td><td>${s.pts}</td><td>${s.reb}</td><td>${s.ast}</td></tr>`;
            totalPts += s.pts;
            totalReb += s.reb;
            totalAst += s.ast;
        });

        table.innerHTML = `
            <thead>
                <tr><th>Player</th><th>PTS</th><th>REB</th><th>AST</th></tr>
            </thead>
            <tbody>
                ${tableBodyHtml}
            </tbody>
            <tfoot>
                <tr>
                    <td><strong>Totals</strong></td>
                    <td><strong>${totalPts}</strong></td>
                    <td><strong>${totalReb}</strong></td>
                    <td><strong>${totalAst}</strong></td>
                </tr>
            </tfoot>
        `;
    }

    function applyModifier(team, modifier) {
        if (!modifier || !modifier.effects) return;

        // Team-wide effects
        if (modifier.effects.team) {
            Object.keys(modifier.effects.team).forEach(stat => {
                Object.values(team).forEach(player => {
                    if (player && player.stats[stat] !== undefined) {
                        player.stats[stat] += modifier.effects.team[stat];
                    }
                });
            });
        }

        // Player-specific effects
        if (modifier.effects.player) {
            Object.values(team).forEach(player => {
                if (
                    player &&
                    ((modifier.effects.player.position === "6th" && player.position === "6th") ||
                        (player.position === modifier.effects.player.position))
                ) {
                    Object.keys(modifier.effects.player).forEach(stat => {
                        if (stat !== "position" && player.stats[stat] !== undefined) {
                            player.stats[stat] += modifier.effects.player[stat];
                        }
                    });
                }
            });
        }

        // Special effects (handle in your game logic)
        if (modifier.effects.special) {
            // e.g. set a flag: ignorePositionRestrictions = true;
        }
    }

    function maybeDrawModifierCard() {
        const chance = 0.99; // 10% chance
        if (Math.random() < chance && bonusModifiers.length > 0) {
            // Draw a random card
            const card = bonusModifiers[Math.floor(Math.random() * bonusModifiers.length)];
            return card;
        }
        return null;
    }

    function showModifierCardModal(cards, onPick) {
        const modal = document.getElementById('modifierCardModal');
        const grid = document.getElementById('modifierCardGrid');
        grid.innerHTML = '';

        // Pick 3 random unique cards to show
        let cardsToShow = [];
        if (cards.length <= 3) {
            cardsToShow = [...cards];
        } else {
            const usedIndexes = new Set();
            while (cardsToShow.length < 3) {
                const idx = Math.floor(Math.random() * cards.length);
                if (!usedIndexes.has(idx)) {
                    usedIndexes.add(idx);
                    cardsToShow.push(cards[idx]);
                }
            }
        }

        let selected = [];
        cardsToShow.forEach((card, i) => {
            const div = document.createElement('div');
            div.className = 'modifier-card';
            div.innerHTML = `<h3>${card.name}</h3><p>${card.description}</p>`;
            div.onclick = () => {
                if (div.classList.contains('selected')) {
                    div.classList.remove('selected');
                    selected = selected.filter(c => c !== card);
                } else if (selected.length < 2) {
                    div.classList.add('selected');
                    selected.push(card);
                }
                // Enable confirm button if 2 are selected
                confirmBtn.disabled = selected.length !== 2;
            };
            grid.appendChild(div);
        });

        // Add a confirm button
        let confirmBtn = document.createElement('button');
        confirmBtn.textContent = "Confirm Selection";
        confirmBtn.disabled = true;
        confirmBtn.onclick = () => {
            modal.style.display = 'none';
            onPick(selected);
        };
        grid.parentElement.appendChild(confirmBtn);

        modal.style.display = 'flex';
    }

    function applyGameEvent(team, event, logArr, teamLabel = "") {
        let affectedPlayer = null;
        let message = event.message;

        // Determine target player
        if (event.target === "random") {
            const players = Object.values(team).filter(p => p);
            affectedPlayer = players[Math.floor(Math.random() * players.length)];
        } else if (event.target === "playerWithHighestClutch") {
            const players = Object.values(team).filter(p => p);
            affectedPlayer = players.reduce((max, p) => (p.stats.clutch > (max ? max.stats.clutch : -Infinity) ? p : max), null);
        } else if (["PG", "SG", "SF", "PF", "C", "6th"].includes(event.target)) {
            affectedPlayer = team[event.target];
        }

        // Apply stat change
        if (affectedPlayer && event.stat && affectedPlayer.stats[event.stat] !== undefined) {
            affectedPlayer.stats[event.stat] += event.amount;
            message = message.replace("{player}", affectedPlayer.name);
        } else if (event.type === "teamBuff" && event.stat) {
            // Team-wide stat change
            Object.values(team).forEach(p => {
                if (p && p.stats[event.stat] !== undefined) {
                    p.stats[event.stat] += event.amount;
                }
            });
        }

        // Prefix the message with the team label if provided
        if (logArr && message) logArr.push(`${teamLabel}${message}`);
    }
});