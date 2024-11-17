document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    // DOM Elements
    const elements = {
        welcomeSection: document.getElementById('welcome-section'),
        nameEntry: document.getElementById('name-entry'),
        mainSection: document.getElementById('container'),
        nameInput: document.getElementById('nameInput'),
        submitNameButton: document.getElementById('submitName'),
        joinCaptainButton: document.getElementById('join-captain'),
        joinSpectatorButton: document.getElementById('join-spectator'),
        chatBox: document.getElementById('chat-box'),
        startAuctionButton: document.getElementById('start-auction'),
        startVoidAuctionButton: document.getElementById('start-void-auction'),
        auctionOrderList: document.getElementById('auction-order-list'),
        voidAuctionList: document.getElementById('void-auction-list'),
        teamsSection: document.getElementById('teams-section'),
        currentAuctionPlayer: document.getElementById('current-auction-player'),
        bidButtonsContainer: document.getElementById('bid-buttons'),
        timerSection: document.getElementById('timer-section'),
        auctionTimer: document.getElementById('auction-timer'),
        addPlayerForm: document.getElementById('addPlayerForm'),
        playerNameInput: document.getElementById('playerName'),
        playerTierSelect: document.getElementById('playerTier'),
        teamsList: document.getElementById('teams'),
        randomizeOrderButton: document.getElementById('randomizeOrder'),
        bidInput: document.getElementById('manual-bid-input'),
        placeBidButton: document.getElementById('place-bid'),
        joinAdminButton: document.getElementById('join-admin'),
        bottomControls: document.getElementById('bottom-controls'),
        bidControlsSection: document.getElementById('bid-controls-section'),
        pointsSection: document.getElementById('points-section'),

    };

    const timerBar = document.querySelector('timer-bar');
    const timerText = document.querySelector('#auctionTimer');

    // Check if all required elements exist
    for (const [key, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`Element with ID '${key}' not found.`);
        }
    }

    elements.bottomControls.style.display = 'none';


    let auctionOrder = [];
    let voidAuctionList = [];
    let teams = {};
    let currentBid = null;
    let auctionInProgress = false;
    let barWidth = 100; // Full width of the bar (percentage)
    let loopAudio = null;

    function showNameEntry() {
        elements.nameEntry.style.display = 'flex';
        elements.mainSection.style.display = 'none';
        elements.welcomeSection.style.display = 'none';
    }

    function showMainSection() {
        elements.nameEntry.style.display = 'none';
        elements.mainSection.style.display = 'block';
        elements.welcomeSection.style.display = 'none';
    }

    function createBidButton(increment) {
        const button = document.createElement('button');
        button.classList.add('bid-button');
        button.setAttribute('data-increment', increment);
        button.textContent = `${increment}`;
        button.addEventListener('click', () => placeBid(increment));
        return button;
    }

    function placeBid(increment) {
        if (!auctionInProgress) {
            handleChatMessage('진행중인 경매가 없습니다. 입찰을 하려면 경매를 시작해주세요', 'warning');
            return;
        }
    
        // Get the current auction player and their tier
        const currentAuctionText = elements.currentAuctionPlayer.textContent;
        const playerMatch = currentAuctionText.match(/Currently Auctioning: (\w+): (.+)/);
        
        if (playerMatch) {
            const [_, playerTier, playerName] = playerMatch;
            const captainName = elements.nameInput.value.trim();
    
            // Check if the captain's team already has a player of this tier
            const team = teams[captainName];
            if (team && team.members.some(member => member.tier === playerTier)) {
                handleChatMessage(`You cannot bid for a player of tier ${playerTier} because you already have one.`, 'warning');
                return;
            }
        }
    
        currentBid += increment;
        socket.emit('placeBid', { increment: increment, captainName: elements.nameInput.value });
    }

    function handleChatMessage(message, type = 'info') {
        // Replace points with pink color
        message = message.replace(/(\d+) points/g, '<span style="color:red">$1 points</span>');

        const chatMessage = document.createElement('div');
        chatMessage.innerHTML = message;
        switch (type) {
            case 'info':
                chatMessage.style.color = 'white';
                break;
            case 'success':
                chatMessage.style.color = 'green';
                chatMessage.style.fontWeight = 'bold';
                break;
            case 'warning':
                chatMessage.style.color = 'orange';
                chatMessage.style.fontWeight = 'bold';
                break;
            case 'error':
                chatMessage.style.color = 'red';
                chatMessage.style.fontWeight = 'bold';
                break;
        }
        elements.chatBox.appendChild(chatMessage);
        elements.chatBox.scrollTop = elements.chatBox.scrollHeight;
    }

    function startTimerBar() {
        barWidth = 100;
        timerBar.style.width = barWidth + '%';
        const interval = setInterval(() => {
            if (barWidth <= 0 || !auctionInProgress) {
                clearInterval(interval);
                return;
            }
            barWidth -= 20;
            timerBar.style.width = barWidth + '%';
        }, 1000); // Decrease width every second
    }
    
    function updatePlayerImage(player) {
        // Assuming images are located in 'public/images' and named exactly as player names with '.png' extension
        const imagePath = `images/${player.name}.png`;
        const playerImageElement = document.getElementById('player-picture'); // Ensure you have an element with this ID in your HTML
    
        // Update the src attribute to load the correct image
        playerImageElement.src = imagePath;
    }

    function resetTimerBar() {
        barWidth = 100;
        timerBar.style.width = barWidth + '%';
    }

    function initEventListeners() {
        elements.joinCaptainButton.addEventListener('click', showNameEntry);

        elements.placeBidButton.addEventListener('click', () => {
            const bidAmount = parseInt(elements.bidInput.value.trim(), 10);
            const captainName = elements.nameInput.value.trim();

            if (!captainName) {
                handleChatMessage('Please enter your name before placing a bid.', 'warning');
                return;
            }
        
            if (isNaN(bidAmount) || bidAmount < 0) {
                alert('Please enter a valid bid amount.');
                return;
            }
        
            socket.emit('placeManualBid', { captainName, bidAmount });
        });

        elements.submitNameButton.addEventListener('click', () => {
            const name = elements.nameInput.value.trim();
            if (name) {
                showMainSection();
                socket.emit('joinAsCaptain', name);
            }
        });

        elements.joinSpectatorButton.addEventListener('click', () => {
            showMainSection();
            elements.bidControlsSection.style.display = 'none';
            elements.pointsSection.style.display = 'none';
            socket.emit('joinAsSpectator');
        });

        elements.joinAdminButton.addEventListener('click', () => {
            showMainSection();
            elements.bottomControls.style.display = 'inherit';
            socket.emit('joinAsAdmin');
        });

        elements.startAuctionButton.addEventListener('click', () => {
            auctionInProgress = true;
            socket.emit('startAuction');
        });

        elements.startVoidAuctionButton.addEventListener('click', () => {
            auctionInProgress = true;
            socket.emit('startVoidAuction');
        });

        elements.bidButtonsContainer.innerHTML = '';

        // Create bid buttons
        [5, 10, 25, 50, 100].forEach(increment => {
            const button = createBidButton(increment);
            elements.bidButtonsContainer.appendChild(button);
        });

        elements.addPlayerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const playerName = elements.playerNameInput.value.trim();
            let playerTier = elements.playerTierSelect.value.trim();
        
            if (playerTier === '') {
                playerTier = ' '; // Default to an empty space
            }
        
            if (playerName) {
                socket.emit('addPlayer', { tier: playerTier, name: playerName });
                elements.playerNameInput.value = ''; // Clear the input field
                elements.playerTierSelect.value = ''; // Reset the select box
            } else {
                alert('Player name is required.');
            }
        });

        elements.randomizeOrderButton.addEventListener('click', () => {
            socket.emit('randomizeAuctionOrder');
        });
    }

    socket.on('connect', () => {
        console.log('Connected to server.');
        socket.emit('auctionStatusUpdate', { auctionInProgress });
        // Emit other current state information if needed
    });

    socket.on('chatMessage', (message, type) => {
        handleChatMessage(message, type);
    });

    socket.on('playAudio', (fileName) => {
        const audio = new Audio(`/audio/${fileName}`);
        audio.volume = 0.2;
        audio.play();
    });

    socket.on('playAudioLoop', (fileName) => {
    if (loopAudio) {
        loopAudio.pause();
        loopAudio.currentTime = 0;
    }
    loopAudio = new Audio(`/audio/${fileName}`);
    loopAudio.loop = true;
    loopAudio.volume = 0.08;
    loopAudio.play();
    });

    socket.on('stopAudioLoop', () => {
        if (loopAudio) {
            loopAudio.pause();
            loopAudio.currentTime = 0;
            loopAudio = null;
        }
    });

    socket.on('updateTeams', (updatedTeams) => {
        teams = updatedTeams;
        renderTeams();
    });

    socket.on('updateAuctionOrder', (updatedAuctionOrder) => {
        auctionOrder = updatedAuctionOrder;
        renderAuctionOrder();
    });

    socket.on('updateVoidAuctionList', (updatedVoidAuctionList) => {
        voidAuctionList = updatedVoidAuctionList;
        renderVoidAuctionList();
    });

    socket.on('playerAuction', (player) => {
        console.log('Received player data:', player); // Debug log
    
        updatePlayerImage(player);
    
        // Create container for player info
        const playerContainer = document.createElement('div');
        playerContainer.style.display = 'flex';
        playerContainer.style.alignItems = 'center';
        playerContainer.style.justifyContent = 'center';
        playerContainer.style.padding = '10px';
        playerContainer.style.borderRadius = '8px';
        
        // Create text for "Currently Auctioning:"
        const auctioningText = document.createElement('div');
        auctioningText.textContent = '현재 경매 중:';
        auctioningText.style.fontSize = '1em';
        auctioningText.style.fontWeight = 'bold';
        auctioningText.style.marginRight = '10px';
        
        // Create tier icon
        const tierIcon = document.createElement('div');
        tierIcon.style.width = '40px';
        tierIcon.style.height = '40px';
        tierIcon.style.backgroundColor = {
            'A': 'red',
            'B': 'orange',
            'C': 'green',
            'D': 'teal',
            'E': 'purple',
        }[player.tier] || 'grey';
        tierIcon.style.color = 'white';
        tierIcon.style.display = 'flex';
        tierIcon.style.alignItems = 'center';
        tierIcon.style.justifyContent = 'center';
        tierIcon.style.fontWeight = 'bold';
        tierIcon.style.borderRadius = '50%';
        tierIcon.style.marginRight = '10px';
        tierIcon.textContent = player.tier;
        
        // Create player name
        const playerName = document.createElement('div');
        playerName.style.fontSize = '1.5em';
        playerName.style.fontWeight = 'bold';
        playerName.textContent = player.name;
        
        // Append elements to the container
        playerContainer.appendChild(auctioningText);
        playerContainer.appendChild(tierIcon);
        playerContainer.appendChild(playerName);
        elements.currentAuctionPlayer.appendChild(playerContainer);
    });
    
    

    socket.on('updateCurrentBid', (currentTotalBid) => {
        currentBid = currentTotalBid;
        elements.bidInput.value = ''; // Clear the input field after placing a bid
    });

    socket.on('timerUpdate', (formattedTime) => {
        // Update the visible timer text
        const timerDisplay = document.getElementById('auctionTimer');
        if (timerDisplay) {
            timerDisplay.textContent = formattedTime;
        } else {
            console.error('Timer display element not found');
        }
    
        // Update the timer bar
        const timerBar = document.getElementById('timer-bar');
        if (!timerBar) {
            console.error('Timer bar element not found');
            return; // Exit if the element does not exist
        }
    
        const [seconds, milliseconds] = formattedTime.split(':').map(Number);
        const totalMilliseconds = seconds * 1000 + milliseconds * 10;
    
        if (totalMilliseconds <= 5000) {
            // Start filling the timer bar 5 seconds before the end
            const fillPercentage = ((5000 - totalMilliseconds) / 5000) * 100;
            timerBar.style.width = `${fillPercentage}%`;
            timerBar.style.backgroundColor = 'red'; // Change color to red as it fills
        } else {
            timerBar.style.width = '100%'; // Full bar if more than 5 seconds
            timerBar.style.backgroundColor = ''; // Reset color
        }
    });
    

    socket.on('bidEnded', () => {
        auctionInProgress = false; // Set auctionInProgress to false
        const auctionElement = elements.currentAuctionPlayer;
        auctionElement.innerHTML = ''; // Clear existing content
    
        // Create container for the message
        const messageContainer = document.createElement('div');
        messageContainer.classList.add('message-container'); // Add CSS class for styling
    
        // Create text for "Auction has ended. Waiting to begin next auction."
        const endedMessage = document.createElement('div');
        endedMessage.textContent = '경매가 종료되었습니다. 다음 경매 대기중...';
        endedMessage.classList.add('ended-message'); // Add CSS class for styling
    
        // Append message to container
        messageContainer.appendChild(endedMessage);
        auctionElement.appendChild(messageContainer);
    });
    
    

    socket.on('auctionStatusUpdate', (status) => {
        if (status) {
            auctionInProgress = status.auctionInProgress;
    
            // Update UI based on auction status
            if (auctionInProgress) {
                // Assuming player information should be displayed here
                // You might need to fetch player info separately or update the UI accordingly
            } else {
                elements.currentAuctionPlayer.textContent = '경매가 종료되었습니다. 다음 경매 대기중...';
                // Show or hide elements as needed
            }
        } else {
            console.error('Received auctionStatusUpdate with no status data.');
        }
    });

    function renderAuctionOrder() {
        elements.auctionOrderList.innerHTML = '';
        elements.auctionOrderList.style.display = 'flex';
        elements.auctionOrderList.style.flexWrap = 'wrap';
        elements.auctionOrderList.style.alignItems = 'center';
    
        auctionOrder.forEach((player, index) => {
            if (player && player.name && player.tier) {
                const listItem = document.createElement('div');
                listItem.style.display = 'flex';
                listItem.style.flexDirection = 'column';
                listItem.style.alignItems = 'center';
                listItem.style.margin = '10px';
    
                const tierColors = {
                    'A': 'red',
                    'B': 'orange',
                    'C': 'green',
                    'D': 'teal',
                    'E': 'purple',
                };
    
                const tierIcon = document.createElement('div');
                tierIcon.style.width = '40px';
                tierIcon.style.height = '40px';
                tierIcon.style.backgroundColor = tierColors[player.tier] || 'grey';
                tierIcon.style.display = 'flex';
                tierIcon.style.alignItems = 'center';
                tierIcon.style.justifyContent = 'center';
                tierIcon.style.color = 'white';
                tierIcon.style.fontWeight = 'bold';
                tierIcon.style.borderRadius = '5px';
                tierIcon.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                tierIcon.textContent = player.tier;
    
                const playerName = document.createElement('div');
                playerName.style.textAlign = 'center';
                playerName.style.marginTop = '5px';
                playerName.style.fontSize = '1.2em';
                playerName.textContent = player.name;
    
                listItem.appendChild(tierIcon);
                listItem.appendChild(playerName);
                elements.auctionOrderList.appendChild(listItem);
    
                if (index < auctionOrder.length - 1) {
                    const arrowIcon = document.createElement('div');
                    arrowIcon.style.fontSize = '1.5em';
                    arrowIcon.style.margin = '0 10px';
                    arrowIcon.textContent = '>';
                    elements.auctionOrderList.appendChild(arrowIcon);
                }
            } else {
                console.error('Invalid player data:', player);
            }
        });
    }
    
    function renderVoidAuctionList() {
        elements.voidAuctionList.innerHTML = '';
        elements.voidAuctionList.style.display = 'flex';
        elements.voidAuctionList.style.flexWrap = 'wrap';
        elements.voidAuctionList.style.alignItems = 'center';
    
        voidAuctionList.forEach((player, index) => {
            if (player && player.name && player.tier) {
                const listItem = document.createElement('div');
                listItem.style.display = 'flex';
                listItem.style.flexDirection = 'column';
                listItem.style.alignItems = 'center';
                listItem.style.margin = '10px';
    
                const tierColors = {
                    'A': 'red',
                    'B': 'orange',
                    'C': 'green',
                    'D': 'teal',
                    'E': 'purple',
                };
    
                const tierIcon = document.createElement('div');
                tierIcon.style.width = '40px';
                tierIcon.style.height = '40px';
                tierIcon.style.backgroundColor = tierColors[player.tier] || 'grey';
                tierIcon.style.display = 'flex';
                tierIcon.style.alignItems = 'center';
                tierIcon.style.justifyContent = 'center';
                tierIcon.style.color = 'white';
                tierIcon.style.fontWeight = 'bold';
                tierIcon.style.borderRadius = '5px';
                tierIcon.style.boxShadow = '0 2px 4px rgba(0, 0, 0, 0.2)';
                tierIcon.textContent = player.tier;
    
                const playerName = document.createElement('div');
                playerName.style.textAlign = 'center';
                playerName.style.marginTop = '5px';
                playerName.style.fontSize = '1.2em';
                playerName.textContent = player.name;
    
                listItem.appendChild(tierIcon);
                listItem.appendChild(playerName);
                elements.voidAuctionList.appendChild(listItem);
    
                if (index < voidAuctionList.length - 1) {
                    const arrowIcon = document.createElement('div');
                    arrowIcon.style.fontSize = '1.5em';
                    arrowIcon.style.margin = '0 10px';
                    arrowIcon.textContent = '>';
                    elements.voidAuctionList.appendChild(arrowIcon);
                }
            } else {
                console.error('Invalid player data:', player);
            }
        });
    }

    function renderTeams() {
        elements.teamsSection.innerHTML = ''; // Clear previous content
    
        const teamColors = {
            "Team 1": "#007bff", // Blue
            "Team 2": "#28a745", // Green
            "Team 3": "#dc3545", // Red
            "Team 4": "#ffc107", // orange
            "Team 5": "#e83e8c", // Pink
            "Team 6": "#6c757d", // Gray
            "Team 7": "#17a2b8", // Teal
            "Team 8": "#f8f9fa", // Light gray
            "Team 9": "#fd7e14", // Orange
            "Team 10": "#343a40", // Dark gray
        };
    
        const tierColors = {
            'A': 'red',
            'B': 'orange',
            'C': 'green',
            'D': 'teal',
            'E': 'purple',
        };
    
        // Define tier order
        const tierOrder = ['A', 'B', 'C', 'D', 'E'];
    
        // Track the current user's team name
        let currentUserTeamName = null;
    
        // Render teams
        for (const [teamName, team] of Object.entries(teams)) {
            const textColor = teamColors[teamName] || '#000000'; // Default color for team name
    
            const teamDiv = document.createElement('div');
            teamDiv.classList.add('team');
            teamDiv.style.border = '2px solid #ccc'; // Border to distinguish teams
            teamDiv.style.borderRadius = '8px'; // Rounded corners
            teamDiv.style.padding = '15px'; // Padding for better readability
            teamDiv.style.marginBottom = '15px'; // Space between teams
            teamDiv.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)'; // Subtle shadow for depth
            teamDiv.style.display = 'flex'; // Flexbox for alignment
            teamDiv.style.flexDirection = 'row'; // Horizontal layout
            teamDiv.style.alignItems = 'flex-start'; // Align items to the top
            teamDiv.style.justifyContent = 'space-between'; // Space between content and right-aligned section
            teamDiv.style.position = 'relative';
    
            const tierSlots = {
                'A': false,
                'B': false,
                'C': false,
                'D': false,
                'E': false,
            };
    
            // Mark slots as filled based on team members
            team.members.forEach(member => {
                console.log(`Member: ${member.name}, Tier: ${member.tier}, Purchase Price: ${member.purchasePrice}`); // Debug log
                if (tierSlots[member.tier] !== undefined) {
                    tierSlots[member.tier] = true;
                }
            });
    
            teamDiv.innerHTML = `
                <div style="flex: 1;">
                    <h3 style="color:${textColor}; margin: 0;">${teamName}</h3>
                    <p style="margin: 5px 0;"><strong>팀장:</strong> ${team.captainName || 'N/A'}</p>
                </div>
                <div style="display: flex; flex-direction: column; align-items: flex-end; margin-left: 20px;">
                    <p style="margin: 5px 0; color: #ff69b4; font-weight: bold;"><strong>잔여 포인트:</strong> ${team.points}</p>
                    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
                        ${team.members.map((member, index) => `
                            <div style="display: flex; flex-direction: column; align-items: center;">
                                <div style="
                                    width: 60px; height: 60px;
                                    background-color: ${teamColors[teamName]};
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    border-radius: 5px;
                                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
                                "></div>
                                <div style="margin-top: 5px; font-size: 1.2em; text-align: center;">
                                    ${member.name}
                                </div>
                                <div style="margin-top: 3px; font-size: 0.9em; text-align: center;">
                                    ${member.purchasePrice || '0'}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
    
            elements.teamsSection.appendChild(teamDiv);
    
            // Determine the current user's team name
            if (team.captainName === elements.nameInput.value.trim()) {
                currentUserTeamName = teamName;
            }
        }
    
        // Update points remaining section
        const pointsRemainingElement = document.getElementById('points-remaining');
        if (pointsRemainingElement) {
            if (currentUserTeamName) {
                const currentUserTeam = teams[currentUserTeamName];
                pointsRemainingElement.textContent = `잔여 포인트: ${currentUserTeam.points}`;
            } else {
                pointsRemainingElement.textContent = 'Spectating - No Points';
            }
        } else {
            console.error('Points remaining element not found.');
        }
    }
      
    
    initEventListeners();
});
