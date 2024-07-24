const e = require('express');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const teamColors = {
    "Team 1": "lightblue",
    "Team 2": "lightgreen",
    "Team 3": "lightcoral",
    "Team 4": "lightgoldenrodyellow",
    "Team 5": "lightpink",
    "Team 6": "lightgray",
    "Team 7": "lightsteelblue",
    "Team 8": "lightseagreen",
    "Team 9": "lightgold",
    "Team 10": "lightpurple",
    // Add more colors if needed
};

let players = [];
let auctionOrder = [];
let voidAuctionList = [];
let teams = {};
let currentAuctionPlayer = null;
let currentBidder = null;
let currentTotalBid = null; // Track the current total bid
let auctionTimer = null; // Timer for auction countdown
let auctionInProgress = false; // Define the variable to track auction status

app.use(express.static('public'));

io.on('connection', (socket) => {
    let currentCaptainName = '';
    console.log(`New client connected: ${socket.id}`);

    socket.on('joinAsCaptain', (name) => {
        console.log(`Captain joined: ${name}`);
        currentCaptainName = name;

        let teamAssigned = false;
        for (let teamName in teams) {
            if (!teams[teamName].captainName) {
                teams[teamName].captainName = name;
                teamAssigned = true;
                break;
            }
        }

        if (!teamAssigned) {
            const newTeamNumber = Object.keys(teams).length + 1;
            const newTeamName = `Team ${newTeamNumber}`;
            let initialPoints = 1000;
    
            if (newTeamName === "Team 1") {
                initialPoints = 800;
            } else if (newTeamName === "Team 2") {
                initialPoints = 850;
            } else if (newTeamName === "Team 3") {
                initialPoints = 900;
            }
    
            teams[newTeamName] = {
                captainName: name,
                points: initialPoints,
                members: [] // Players in the team with tier info
            };
        }

        io.emit('updateTeams', teams);
        socket.emit('chatMessage', `환영합니다, <span style="color:white">${name}</span> 팀장님!`, 'success');
        socket.emit('updateAuctionOrder', auctionOrder); // Emit auction order
        socket.emit('updateVoidAuctionList', voidAuctionList); // Emit void auction list
    });

    socket.on('joinAsSpectator', () => {
        console.log(`Spectator joined: ${socket.id}`);

        // Emit the current state to the new spectator
        socket.emit('chatMessage', '환영합니다, 관전자님!');
        socket.emit('updateTeams', teams); // Send the current Teams info
        socket.emit('updateAuctionOrder', auctionOrder); // Send the current Auction Order info
        socket.emit('updateVoidAuctionList', voidAuctionList); // Send the current Void Auction List info

        if (currentAuctionPlayer) {
            // If an auction is in progress, notify the spectator
            socket.emit('playerAuction', currentAuctionPlayer);
            socket.emit('updateCurrentBid', currentTotalBid);
        }

        if (auctionTimer) {
            // If a timer is active, send the remaining time
            socket.emit('timerUpdate', auctionTimer._idleStart);
        }
    });

    socket.on('joinAsAdmin', () => {
        console.log(`Admin joined: ${socket.id}`);

        // Emit the current state to the new admin
        socket.emit('chatMessage', '환영합니다, 관리자님!');
        socket.emit('updateTeams', teams); // Send the current Teams info
        socket.emit('updateAuctionOrder', auctionOrder); // Send the current Auction Order info
        socket.emit('updateVoidAuctionList', voidAuctionList); // Send the current Void Auction List info

        if (currentAuctionPlayer) {
            // If an auction is in progress, notify the admin
            socket.emit('playerAuction', currentAuctionPlayer);
            socket.emit('updateCurrentBid', currentTotalBid);
        }

        if (auctionTimer) {
            // If a timer is active, send the remaining time
            socket.emit('timerUpdate', auctionTimer._idleStart);
        }
    });

    socket.on('addPlayer', (player) => {
        console.log('Received player:', player); // Debugging log
        if (player && player.name && player.tier) {
            auctionOrder.push(player);
            io.emit('updateAuctionOrder', auctionOrder);
        } else {
            console.error('Invalid player data:', player);
        }
    });

    socket.on('startAuction', () => {
        if (auctionOrder.length === 0) {
            io.emit('chatMessage', 'No players to auction.', 'warning');
            return;
        }
        if (currentAuctionPlayer) {
            io.emit('chatMessage', 'An auction is already in progress.', 'warning');
            return;
        }
        auctionInProgress = true;
        currentAuctionPlayer = auctionOrder[0];
        currentTotalBid = null;
        currentBidder = null;
        io.emit('playerAuction', currentAuctionPlayer);
        io.emit('chatMessage', '<div style="text-align: center;">=========================================</div>');
        io.emit('chatMessage', `<span style="color:pink">${currentAuctionPlayer.tier} 티어: ${currentAuctionPlayer.name}</span>님의 경매가 시작했습니다!`, 'success');
        io.emit('playAudio', 'start.mp3');
        io.emit('playAudioLoop', 'ticking.mp3');
        io.emit('auctionStatusUpdate', { auctionInProgress }); // Emit the auction status update
        startAuctionTimer(15);
    });

    socket.on('startVoidAuction', () => {
        if (voidAuctionList.length === 0) {
            io.emit('chatMessage', 'Starting void auction with no players in the list.', 'info');
            return;
        }
        if (currentAuctionPlayer) {
            io.emit('chatMessage', 'An auction is already in progress.', 'warning');
            return;
        }
        auctionInProgress = true;
        currentAuctionPlayer = voidAuctionList[0]; // Set the current auction player without removing them
        currentTotalBid = null;
        currentBidder = null;
        io.emit('playerAuction', currentAuctionPlayer);
        io.emit('chatMessage', '<div style="text-align: center;">=========================================</div>');
        io.emit('chatMessage', `${currentAuctionPlayer.tier}티어: ${currentAuctionPlayer.name}님의 유찰경매가 시작했습니다!`, 'success');
        io.emit('playAudio', 'start.mp3');
        io.emit('playAudioLoop', 'ticking.mp3');
        io.emit('auctionStatusUpdate', { auctionInProgress });
        startAuctionTimer(15);
    });

    socket.on('placeBid', (data) => {
        const { increment, captainName } = data;
    
        // Determine if we're in a void auction
        const isVoidAuction = voidAuctionList.length > 0 && !auctionOrder.length;
        const currentAuctionList = isVoidAuction ? voidAuctionList : auctionOrder;
        const currentAuctionPlayer = currentAuctionList.length > 0 ? currentAuctionList[0] : null;
    
        // Find the team associated with the captainName
        let teamName = Object.keys(teams).find(team => teams[team].captainName === captainName);
    
        if (!teamName) {
            console.error(`No team found for captain ${captainName}`);
            return;
        }
    
        const team = teams[teamName];
        const teamColor = teamColors[teamName] || 'black';
    
        // Check if the bid exceeds the team's remaining points (excluding 0 bids)
        if (increment > team.points && increment !== 0) {
            socket.emit('chatMessage', `Bid exceeds available points for ${teamName}.`, 'warning');
            return;
        }
    
        // Check if adding the player would exceed the 4-player cap
        if (team.members.length >= 4) {
            socket.emit('chatMessage', `Cannot add more than 4 players to ${teamName}.`, 'warning');
            return;
        }
    
        // Ensure the current auction player exists
        if (!currentAuctionPlayer || !currentAuctionPlayer.tier) {
            socket.emit('chatMessage', 'No players available for auction or missing tier information.', 'error');
            return;
        }
    
        // Check if the team already has a player of the same tier
        if (team.members.some(member => member.tier === currentAuctionPlayer.tier)) {
            socket.emit('chatMessage', `You already have a player of tier ${currentAuctionPlayer.tier} in ${teamName}.`, 'warning');
            return;
        }
    
        // Update the bid
        if (increment === 0) {
            currentTotalBid = null; // Reset total bid for 0 bids
        } else {
            currentTotalBid += increment;
        }
    
        currentBidder = captainName;
    
        io.emit('updateCurrentBid', currentTotalBid);
        io.emit('chatMessage', `<span style="color:${teamColor}">${captainName}</span> 팀장: <span style="color:red">${increment}</span> 포인트로 입찰. 현재 총 입찰가: <span style="color:red">${currentTotalBid}</span> 포인트.`, 'info');
        io.emit('playAudio', 'successfulbid.mp3');
        resetAuctionTimer();
    });
    
    socket.on('placeManualBid', ({ captainName, bidAmount }) => {
        if (!captainName) {
            console.error('No captain name provided.');
            socket.emit('chatMessage', 'No captain name provided.', 'error');
            return;
        }
    
        // Determine if we're in a void auction
        const isVoidAuction = voidAuctionList.length > 0 && !auctionOrder.length;
        const currentAuctionList = isVoidAuction ? voidAuctionList : auctionOrder;
        const currentAuctionPlayer = currentAuctionList.length > 0 ? currentAuctionList[0] : null;
    
        // Find the team associated with the captainName
        const teamName = Object.keys(teams).find(team => teams[team].captainName === captainName);
    
        if (!teamName) {
            socket.emit('chatMessage', `No team found for captain ${captainName}`, 'error');
            return;
        }
    
        const team = teams[teamName];
    
        if (!auctionInProgress) {
            socket.emit('chatMessage', '경매가 진행되지 않습니다. 입찰하기 전에 경매를 시작해주세요.', 'warning');
            return;
        }
    
        // Check if the bid amount exceeds the team's remaining points (excluding 0 bids)
        if (bidAmount > team.points && bidAmount !== 0) {
            socket.emit('chatMessage', `입찰 금액이 ${teamName}의 사용 가능한 포인트를 초과했습니다.`, 'warning');
            return;
        }
        

        if (bidAmount <= currentTotalBid) {
            if (bidAmount === 0) {
                currentTotalBid = bidAmount;
                currentTotalBid = bidAmount;
                currentBidder = captainName;
            
                io.emit('updateCurrentBid', currentTotalBid);
                io.emit('playAudio', 'successfulbid.mp3');
                const teamColor = teamColors[teamName] || 'black';
            
                resetAuctionTimer();
            }
            else {
                socket.emit('chatMessage', `입찰 금액은 현재 총 입찰 금액인 ${currentTotalBid}보다 높아야 합니다.`, 'warning');
                return;
            }
        }
    
        // Ensure currentAuctionList is not empty and the current auction player exists
        if (!currentAuctionPlayer || !currentAuctionPlayer.tier) {
            socket.emit('chatMessage', '경매에 참여할 수 있는 플레이어가 없거나 등급 정보가 누락되었습니다.', 'error');
            return;
        }
    
        // Check if the team already has a player of the same tier
        if (team.members.some(member => member.tier === currentAuctionPlayer.tier)) {
            socket.emit('chatMessage', `${teamName}에 ${currentAuctionPlayer.tier} 등급의 플레이어가 이미 있습니다.`, 'warning');
            return;
        }
    
        // Update the bid
        currentTotalBid = bidAmount;
        currentBidder = captainName;
    
        io.emit('updateCurrentBid', currentTotalBid);
        const teamColor = teamColors[teamName] || 'black';
        io.emit('chatMessage', `<span style="color:${teamColor}">${captainName}</span> 팀장: <span style="color:red">${bidAmount}</span> 포인트로 입찰. 현재 총 입찰가: <span style="color:red">${currentTotalBid}</span> 포인트.`, 'info');
        io.emit('playAudio', 'successfulbid.mp3');
        resetAuctionTimer();
    });    
    
    socket.on('randomizeAuctionOrder', () => {
        auctionOrder = auctionOrder.sort(() => Math.random() - 0.5);
        io.emit('updateAuctionOrder', auctionOrder);
        io.emit('chatMessage', '<span style="color:pink">경매 순서가 무작위로 지정되었습니다.</span> ');
    });

    socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
    });

    socket.on('bidEnded', () => {
        auctionInProgress = false; // Set auctionInProgress to false
        const auctionElement = elements.currentAuctionPlayer;
        auctionElement.innerHTML = ''; // Clear existing content
    
        // Create container for the message
        const messageContainer = document.createElement('div');
        messageContainer.style.display = 'flex';
        messageContainer.style.alignItems = 'center';
        messageContainer.style.justifyContent = 'center';
        messageContainer.style.padding = '20px';
        messageContainer.style.border = '1px solid #ccc';
        messageContainer.style.borderRadius = '8px';
        messageContainer.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.1)';
        messageContainer.style.backgroundColor = '#1e1e1e';
        messageContainer.style.color = '#e0e0e0';
        
        // Create text for "Auction has ended. Waiting to begin next auction."
        const endedMessage = document.createElement('div');
        endedMessage.textContent = '경매가 종료되었습니다. 다음 경매 대기중...';
        endedMessage.style.fontSize = '1.5em';
        endedMessage.style.fontWeight = 'bold';
        endedMessage.style.textAlign = 'center';
        
        // Append message to container
        messageContainer.appendChild(endedMessage);
        auctionElement.appendChild(messageContainer);
    });
    
});

function resetAuctionTimer() {
    if (auctionTimer) {
        clearInterval(auctionTimer);
    }
    startAuctionTimer(15); // Reset to 15 seconds
}
function startAuctionTimer(seconds) {
    if (auctionTimer) {
        clearInterval(auctionTimer);
    }

    let totalTime = seconds * 1000; // Convert seconds to milliseconds
    let startTime = Date.now();

    auctionTimer = setInterval(() => {
        let elapsedTime = Date.now() - startTime;
        let timeRemaining = totalTime - elapsedTime;

        if (timeRemaining <= 0) {
            clearInterval(auctionTimer);
            auctionTimer = null;
            timeRemaining = 0;
            endAuction();
        }

        let secondsRemaining = Math.floor(timeRemaining / 1000);
        let millisecondsRemaining = Math.floor((timeRemaining % 1000) / 10);
        let formattedTime = `${secondsRemaining}:${millisecondsRemaining.toString().padStart(2, '0')}`;

        io.emit('timerUpdate', formattedTime);

    }, 10); // Update every 10 milliseconds
}

function resetAuctionTimer() {
    if (auctionTimer) {
        clearInterval(auctionTimer);
    }
    startAuctionTimer(15); // Reset to 15 seconds
}

function endAuction() {
    if (currentAuctionPlayer) {
        if (currentTotalBid !== null && currentTotalBid >= 0) {
            const teamName = Object.keys(teams).find(team => teams[team].captainName === currentBidder);
            if (teamName) {
                teams[teamName].members.push({
                    tier: currentAuctionPlayer.tier,
                    name: currentAuctionPlayer.name,
                    purchasePrice: currentTotalBid // Add purchase price here
                });
                teams[teamName].points -= currentTotalBid;

                const teamColor = teamColors[teamName] || 'black';
                const captainName = teams[teamName].captainName;
                io.emit('chatMessage', `<span style="color:${teamColor}">${captainName} 팀장</span>님이 <span style="color: pink">${currentAuctionPlayer.tier} 티어: ${currentAuctionPlayer.name}님</span>을 <span style="color:red">${currentTotalBid}</span> 포인트로 획득했습니다.`, 'success');
                io.emit('playAudio', 'end-bought.mp3');

                voidAuctionList = voidAuctionList.filter(player => player.name !== currentAuctionPlayer.name);
                io.emit('updateVoidAuctionList', voidAuctionList);
            }
        } else {
            if (voidAuctionList.length > 0 && voidAuctionList[0].name === currentAuctionPlayer.name) {
                // Remove the player from the front and place at the end
                const removedPlayer = voidAuctionList.shift();
                voidAuctionList.push(removedPlayer);
            } else {
                voidAuctionList.push(currentAuctionPlayer);
            }
            io.emit('updateVoidAuctionList', voidAuctionList);
            io.emit('chatMessage', `<span style="color:pink">${currentAuctionPlayer.tier} 티어: ${currentAuctionPlayer.name}</span>님은 유찰경매로 이동되었습니다.`, 'warning');

            io.emit('playAudio', 'end-notbought.mp3');
        }

        auctionOrder = auctionOrder.filter(player => player.name !== currentAuctionPlayer.name);
        io.emit('updateAuctionOrder', auctionOrder);
        io.emit('updateTeams', teams);

        currentAuctionPlayer = null;
        currentBidder = null;
        currentTotalBid = null;

        auctionInProgress = false; // Set auctionInProgress to false
        io.emit('auctionStatusUpdate', { auctionInProgress }); // Emit the auction status update
        io.emit('bidEnded', teams);
        io.emit('stopAudioLoop'); // Stop the ticking sound
    } else {
        io.emit('chatMessage', 'No current auction player to end.', 'error');
    }
}

function startAuctionForPlayer(player) {
    io.emit('playerAuction', { name: player.name, tier: player.tier });
}

const port = process.env.PORT || 4000;
server.listen(port, () => console.log(`Server listening on port ${port}`));
