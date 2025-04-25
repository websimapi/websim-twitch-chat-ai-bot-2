// Store the TMI client globally
let client = null;
let botEnabled = false;
let lastMessageTime = Date.now();
let conversationHistory = [];
let volume = 0.5;
let newMessagesReceived = false;
let isPondering = false;
let messagesQueue = []; // Queue to collect messages while the bot is pondering

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
    // Start the bot response loop when activated
    checkForBotResponse();
  }
});

// Handle connect/disconnect
connectButton.addEventListener('click', () => {
  if (client && client.readyState() === 'OPEN') {
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
  client = new window.tmi.Client({
    connection: {
      secure: true,
      reconnect: true
    },
    channels: [channel]
  });

  // Handle connection
  client.connect().catch(console.error);

  // Setup event handlers
  client.on('connected', () => {
    statusDiv.className = 'status connected';
    statusDiv.textContent = `Connected to ${channel}'s chat`;
    connectButton.textContent = 'Disconnect';
  });

  client.on('disconnected', () => {
    statusDiv.className = 'status disconnected';
    statusDiv.textContent = 'Disconnected from chat';
    connectButton.textContent = 'Connect';
  });

  client.on('message', async (channel, tags, message, self) => {
    addChatMessage(tags['display-name'], message, tags);
    
    if (botEnabled && !self) {
      // Add message to conversation history
      conversationHistory.push({
        role: "user",
        content: `${tags['display-name']}: ${message}`
      });
      
      // Keep only last 10 messages for context
      conversationHistory = conversationHistory.slice(-10);
      
      // Signal that new messages have been received
      newMessagesReceived = true;
      
      // Add to messages queue for processing
      messagesQueue.push({
        username: tags['display-name'],
        message: message
      });
    }
  });
}

// Separate function to check if the bot should respond
function checkForBotResponse() {
  if (!botEnabled) return;

  const now = Date.now();
  const timeElapsed = now - lastMessageTime;
  
  // Check if we have new messages, enough time has passed, and bot isn't already pondering
  if (newMessagesReceived && timeElapsed > 7000 && !isPondering && messagesQueue.length > 0) {
    isPondering = true;
    newMessagesReceived = false;
    
    // Visual indicator that the bot is thinking (optional)
    console.log("Bot is pondering a response...");
    
    // Generate response after a short "pondering" delay (500-1500ms)
    const ponderTime = Math.random() * 1000 + 500;
    setTimeout(async () => {
      const botResponse = await generateBotResponse();
      if (botResponse) {
        const channel = client.getChannels()[0];
        client.say(channel, botResponse);
        speak(botResponse);
        addChatMessage('AI Bot', botResponse, { 'bot': true });
        lastMessageTime = Date.now();
        messagesQueue = []; // Clear the messages queue
      }
      isPondering = false;
    }, ponderTime);
  }
  
  // Continue checking every second
  setTimeout(checkForBotResponse, 1000);
}

async function generateBotResponse() {
  try {
    const context = botContext.value || "You are a friendly and helpful Twitch chat bot.";
    
    // Combine recent chat messages for additional context
    const recentMessagesContext = messagesQueue
      .map(msg => `${msg.username}: ${msg.message}`)
      .join("\n");
      
    const completion = await websim.chat.completions.create({
      messages: [
        {
          role: "system",
          content: `${context} Keep responses concise and natural, under 200 characters. The following is recent chat context:\n\n${recentMessagesContext}\n\nPonder your response thoughtfully, but keep it conversational and engaging. Don't use emotes unless mentioned in chat.`
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
  if (client) {
    client.disconnect();
    client = null;
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