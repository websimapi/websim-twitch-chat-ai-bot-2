// Import from local tmi.js file 
import { Client } from 'tmi.js';

// Store the client object and states
let tmiClient = null;
let botEnabled = false;
let lastMessageTime = Date.now();
let conversationHistory = [];
let volume = 0.5;

// Initialize elements
const channelInput = document.getElementById('channel-input');
const connectButton = document.getElementById('connect-btn'); 
const chatBox = document.getElementById('chat-box');
const statusDiv = document.getElementById('status');
const botToggle = document.getElementById('bot-enabled');
const botContext = document.getElementById('bot-context');
const volumeControl = document.getElementById('volume-control');

// Setup volume control
volumeControl.addEventListener('input', (e) => {
  volume = parseFloat(e.target.value);
});

// Handle bot toggle
botToggle.addEventListener('change', (e) => {
  botEnabled = e.target.checked;
  if (botEnabled) {
    speak("AI bot activated. I'll be monitoring the chat.");
  }
});

// Handle connect/disconnect
connectButton.addEventListener('click', () => {
  if (tmiClient && tmiClient.readyState === 'OPEN') {
    disconnectFromChat();
  } else {
    connectToChat();
  }
});

function connectToChat() {
  const channel = channelInput.value.toLowerCase().trim();
  
  if (!channel) {
    alert('Please enter a channel name');
    return;
  }

  // Create new client
  tmiClient = new Client({
    connection: {
      secure: true,
      reconnect: true
    },
    channels: [channel]
  });

  // Handle connection
  tmiClient.connect()
    .then(() => {
      statusDiv.className = 'status connected';
      statusDiv.textContent = `Connected to ${channel}'s chat`;
      connectButton.textContent = 'Disconnect';
    })
    .catch(error => {
      console.error('Connection error:', error);
      statusDiv.className = 'status disconnected';
      statusDiv.textContent = 'Failed to connect: ' + error.message;
    });

  // Setup event handlers
  tmiClient.on('connected', () => {
    statusDiv.className = 'status connected';
    statusDiv.textContent = `Connected to ${channel}'s chat`;
    connectButton.textContent = 'Disconnect';
  });

  tmiClient.on('disconnected', () => {
    statusDiv.className = 'status disconnected';
    statusDiv.textContent = 'Disconnected from chat';
    connectButton.textContent = 'Connect';
  });

  tmiClient.on('message', async (channel, tags, message, self) => {
    addChatMessage(tags['display-name'], message, tags);
    
    if (botEnabled && !self) {
      // Add message to conversation history
      conversationHistory.push({
        role: "user", 
        content: `${tags['display-name']}: ${message}`
      });
      
      // Keep only last 10 messages for context
      conversationHistory = conversationHistory.slice(-10);
      
      // Check if enough time has passed since last bot message (at least 10 seconds)
      if (Date.now() - lastMessageTime > 10000) {
        // Random chance to respond (20%)
        if (Math.random() < 0.2) {
          try {
            const botResponse = await generateBotResponse();
            if (botResponse) {
              tmiClient.say(channel, botResponse);
              speak(botResponse);
              addChatMessage('AI Bot', botResponse, { 'bot': true });
              lastMessageTime = Date.now();
            }
          } catch (error) {
            console.error('Error generating bot response:', error);
          }
        }
      }
    }
  });
}

async function generateBotResponse() {
  try {
    const context = botContext.value || "You are a friendly and helpful Twitch chat bot.";
    
    const completion = await websim.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `${context} Keep responses concise and natural, under 200 characters. Don't use emotes unless mentioned in chat.`
        },
        ...conversationHistory
      ]
    });

    return completion.content;
  } catch (error) {
    console.error('Error generating bot response:', error);
    return null;
  }
}

function speak(text) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = volume;
    speechSynthesis.speak(utterance);
  }
}

function disconnectFromChat() {
  if (tmiClient) {
    tmiClient.disconnect();
    tmiClient = null;
    statusDiv.className = 'status disconnected';
    statusDiv.textContent = 'Disconnected from chat';
    connectButton.textContent = 'Connect';
  }
}

function addChatMessage(username, message, tags) {
  const messageDiv = document.createElement('div');
  messageDiv.className = 'chat-message';
  if (tags.bot) {
    messageDiv.className += ' bot-message';
  }

  // Add timestamp
  const timestamp = new Date().toLocaleTimeString();
  const timestampSpan = document.createElement('span');
  timestampSpan.className = 'timestamp';
  timestampSpan.textContent = timestamp;
  messageDiv.appendChild(timestampSpan);

  // Add username
  const usernameSpan = document.createElement('span');
  usernameSpan.className = 'username';
  usernameSpan.textContent = username;
  messageDiv.appendChild(usernameSpan);

  // Add message
  const messageText = document.createElement('span');
  messageText.textContent = `: ${message}`;
  messageDiv.appendChild(messageText);

  // Add to chat box and scroll to bottom
  chatBox.appendChild(messageDiv);
  chatBox.scrollTop = chatBox.scrollHeight;

  // Limit messages to prevent memory issues
  while (chatBox.children.length > 500) {
    chatBox.removeChild(chatBox.firstChild);
  }
}

// Handle Enter key in input
channelInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    connectButton.click();
  }
});