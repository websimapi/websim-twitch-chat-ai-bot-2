// Store the TMI client globally
let client = null;
let botEnabled = false;
let lastMessageTime = Date.now();
let conversationHistory = [];
let volume = 0.5;
let newMessagesReceived = false;
let isPondering = false;
let messagesQueue = []; // Queue to collect messages while the bot is pondering
let processedMessageIds = new Set(); // Track processed message IDs
let longTermMemory = []; // Store important interactions for long-term context
let isSpeaking = false; // Track if TTS is currently speaking
let speechQueue = []; // Queue for TTS sentences

// Initialize elements
const channelInput = document.getElementById('channel-input');
const connectButton = document.getElementById('connect-btn');
const chatBox = document.getElementById('chat-box');
const statusDiv = document.getElementById('status');
const botToggle = document.getElementById('bot-enabled');
const botContext = document.getElementById('bot-context');
const volumeControl = document.getElementById('volume-control');
const stopSpeechButton = document.getElementById('stop-speech');

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

  // Create new client using window.tmi.Client
  try {
    client = new window.tmi.Client({
      connection: {
        secure: true,
        reconnect: true
      },
      channels: [channel]
    });

    // Handle connection
    client.connect()
      .then(() => {
        console.log('Successfully connected to Twitch');
      })
      .catch(err => {
        console.error('Error connecting to Twitch:', err);
        statusDiv.className = 'status disconnected';
        statusDiv.textContent = `Connection error: ${err.message}`;
      });

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
        try {
          // Generate a unique identifier for this message
          const messageId = `${tags.id || tags['user-id']}_${Date.now()}`;
          
          // Add message to conversation history with user info
          conversationHistory.push({
            role: "user",
            content: `${tags['display-name']}: ${message}`,
            messageId: messageId,
            username: tags['display-name'],
            timestamp: Date.now()
          });
          
          // Keep only last 10 messages for recent context
          if (conversationHistory.length > 10) {
            // Before removing, check if any important messages should be saved to long-term memory
            const oldestMessage = conversationHistory.shift();
            if (oldestMessage.isImportant) {
              // If marked as important, save to long-term memory
              longTermMemory.push(oldestMessage);
              // Keep long-term memory manageable (max 20 items)
              if (longTermMemory.length > 20) {
                longTermMemory.shift();
              }
            }
          }
          
          // Signal that new messages have been received
          newMessagesReceived = true;
          
          // Add to messages queue for processing
          messagesQueue.push({
            username: tags['display-name'],
            message: message,
            messageId: messageId,
            userId: tags['user-id']
          });
        } catch (error) {
          console.error('Error processing message:', error);
        }
      }
    });
  } catch (error) {
    console.error('Error setting up Twitch client:', error);
    statusDiv.className = 'status disconnected';
    statusDiv.textContent = `Error: ${error.message}`;
  }
}

// Check if any message in the queue refers to a previously processed message
function isReferringToPreviousMessage(message) {
  // Simple check - see if any usernames from processed messages appear in this new message
  for (const msgId of processedMessageIds) {
    const msgInfo = conversationHistory.find(msg => msg.messageId === msgId);
    if (msgInfo && message.toLowerCase().includes(msgInfo.username.toLowerCase())) {
      return true;
    }
  }
  return false;
}

// Separate function to check if the bot should respond
function checkForBotResponse() {
  if (!botEnabled) return;

  const now = Date.now();
  const timeElapsed = now - lastMessageTime;
  
  // Check if we have new messages, enough time has passed, and bot isn't already pondering
  if (newMessagesReceived && timeElapsed > 7000 && !isPondering && messagesQueue.length > 0) {
    // Filter out messages the bot has already directly responded to
    // unless someone else is referring to them
    const newMessages = messagesQueue.filter(msg => {
      const alreadyProcessed = processedMessageIds.has(msg.messageId);
      const isReferenced = isReferringToPreviousMessage(msg.message);
      
      // Keep messages that are either new (not processed) or being referenced by others
      return !alreadyProcessed || isReferenced;
    });
    
    // Only proceed if there are valid messages to respond to
    if (newMessages.length > 0) {
      isPondering = true;
      newMessagesReceived = false;
      
      // Visual indicator that the bot is thinking (optional)
      console.log("Bot is pondering a response...");
      
      // Generate response after a short "pondering" delay (500-1500ms)
      const ponderTime = Math.random() * 1000 + 500;
      setTimeout(() => {
        generateBotResponse(newMessages)
          .then(botResponse => {
            if (botResponse && client) {
              try {
                const channel = client.getChannels()[0];
                client.say(channel, botResponse)
                  .catch(err => console.error('Error sending message to channel:', err));
                
                speak(botResponse);
                addChatMessage('AI Bot', botResponse, { 'bot': true });
                lastMessageTime = Date.now();
                
                // Mark all messages in this batch as processed
                newMessages.forEach(msg => {
                  processedMessageIds.add(msg.messageId);
                });
                
                // Add bot's response to conversation history
                conversationHistory.push({
                  role: "assistant",
                  content: botResponse,
                  timestamp: Date.now()
                });
                
                // Clear the messages queue of processed messages
                messagesQueue = messagesQueue.filter(msg => !processedMessageIds.has(msg.messageId));
              } catch (err) {
                console.error('Error in bot response handling:', err);
              }
            }
            isPondering = false;
          })
          .catch(err => {
            console.error('Error generating response:', err);
            isPondering = false;
          });
      }, ponderTime);
    } else {
      // No new messages to respond to
      newMessagesReceived = false;
    }
  }
  
  // Continue checking every second
  setTimeout(checkForBotResponse, 1000);
}

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  
  // Cancel any ongoing speech if requested to speak something new
  if (isSpeaking) {
    speechSynthesis.cancel();
    isSpeaking = false;
  }
  
  try {
    // Split text into sentences
    const sentences = splitIntoSentences(text);
    
    // Add sentences to speech queue
    speechQueue = [...speechQueue, ...sentences];
    
    // Start processing the speech queue if not already speaking
    if (!isSpeaking) {
      processSpeechQueue();
    }
  } catch (error) {
    console.error('Error with speech synthesis:', error);
  }
}

// Split text into natural sentences
function splitIntoSentences(text) {
  if (!text) return [];
  
  // Match sentence endings (., !, ?) followed by space or end of string
  // But be careful with common abbreviations, decimals, etc.
  const sentenceRegex = /[.!?]+(?=\s|$)/g;
  
  // First, handle cases like "Dr.", "Mr.", etc. by temporarily replacing them
  const preserveAbbreviations = text
    .replace(/Mr\./g, "Mr#DOT#")
    .replace(/Mrs\./g, "Mrs#DOT#")
    .replace(/Dr\./g, "Dr#DOT#")
    .replace(/Ph\.D\./g, "PhD#DOT#")
    .replace(/etc\./g, "etc#DOT#")
    .replace(/vs\./g, "vs#DOT#")
    .replace(/i\.e\./g, "ie#DOT#")
    .replace(/e\.g\./g, "eg#DOT#");
  
  // Split by the regex
  let sentences = [];
  let lastIndex = 0;
  let match;
  
  // Find all sentence boundaries
  while ((match = sentenceRegex.exec(preserveAbbreviations)) !== null) {
    // Extract the sentence and restore the original punctuation
    const sentence = preserveAbbreviations
      .substring(lastIndex, match.index + match[0].length)
      .replace(/#DOT#/g, ".");
    
    sentences.push(sentence.trim());
    lastIndex = match.index + match[0].length;
  }
  
  // Add the last part if it exists
  if (lastIndex < preserveAbbreviations.length) {
    const lastSentence = preserveAbbreviations
      .substring(lastIndex)
      .replace(/#DOT#/g, ".");
    
    if (lastSentence.trim()) {
      sentences.push(lastSentence.trim());
    }
  }
  
  // If no sentences were found (no punctuation), treat the whole text as one sentence
  if (sentences.length === 0 && text.trim()) {
    sentences.push(text.trim());
  }
  
  return sentences;
}

// Process the speech queue one sentence at a time
function processSpeechQueue() {
  if (speechQueue.length === 0) {
    isSpeaking = false;
    return;
  }
  
  isSpeaking = true;
  const sentence = speechQueue.shift();
  
  const utterance = new SpeechSynthesisUtterance(sentence);
  utterance.volume = volume;
  
  // When this sentence is done, proceed to the next one
  utterance.onend = () => {
    processSpeechQueue();
  };
  
  // If there's an error, continue with the next sentence
  utterance.onerror = (error) => {
    console.error('TTS error:', error);
    processSpeechQueue();
  };
  
  speechSynthesis.speak(utterance);
}

async function generateBotResponse(newMessages) {
  try {
    const botConfigContext = botContext.value || "You are a friendly and helpful Twitch chat bot.";
    
    // Get the most recent message to determine who we're responding to
    const primaryMessage = newMessages[newMessages.length - 1];
    const primaryUsername = primaryMessage.username;
    
    // Combine recent chat messages for additional context
    const recentMessagesContext = newMessages
      .map(msg => `${msg.username}: ${msg.message}`)
      .join("\n");
      
    // Format the long-term memory context
    const longTermContext = longTermMemory.length > 0 
      ? longTermMemory.map(mem => `${mem.username}: ${mem.content}`).join("\n")
      : "No long-term memory yet.";
    
    // Organize the context with clear section labels
    const structuredContext = `
=== BOT CONFIGURATION ===
${botConfigContext}

=== RECENT CHAT CONTEXT ===
${recentMessagesContext}

=== LONG-TERM MEMORY ===
${longTermContext}

You are responding to ${primaryUsername}. Keep responses conversational and engaging.
Don't use emotes unless they were used in chat. If someone refers to a past message, it's okay to address it.
`;
      
    // Add error handling for the API call
    try {
      const completion = await websim.chat.completions.create({
        messages: [
          {
            role: "system",
            content: structuredContext
          },
          ...conversationHistory.slice(-5).map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        ]
      });

      // Mark important responses for long-term memory
      if (completion.content.includes("important") || 
          recentMessagesContext.includes("remember") || 
          recentMessagesContext.includes("don't forget")) {
        const lastUserMsg = conversationHistory.find(msg => msg.messageId === primaryMessage.messageId);
        if (lastUserMsg) {
          lastUserMsg.isImportant = true;
        }
      }

      return completion.content;
    } catch (apiError) {
      console.error('API error when generating bot response:', apiError);
      // Return a fallback message when API fails
      return null;
    }
  } catch (error) {
    console.error('Error generating bot response:', error);
    return null;
  }
}

// Handle stop speech button
stopSpeechButton.addEventListener('click', () => {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel();
    isSpeaking = false;
    speechQueue = [];
    console.log('Speech stopped');
  }
});

function disconnectFromChat() {
  if (client) {
    try {
      // Cancel any ongoing speech when disconnecting
      if (isSpeaking) {
        speechSynthesis.cancel();
        isSpeaking = false;
        speechQueue = [];
      }
      
      client.disconnect()
        .then(() => {
          console.log('Successfully disconnected from Twitch');
          client = null;
        })
        .catch(err => {
          console.error('Error disconnecting from Twitch:', err);
        });
    } catch (error) {
      console.error('Error during disconnect:', error);
      client = null;
    }
  }
}

function addChatMessage(username, message, tags) {
  try {
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
  } catch (error) {
    console.error('Error adding chat message to UI:', error);
  }
}

// Handle Enter key in input
channelInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    connectButton.click();
  }
});

// Global error handler for unhandled promise rejections
window.addEventListener('unhandledrejection', function(event) {
  console.error('Unhandled promise rejection:', event.reason);
});