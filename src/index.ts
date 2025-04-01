/**
 * Distributed Chat System
 * 
 * Main application that integrates all modules:
 * 1. Group Communication with Multicast
 * 2. Data Replication and Eventual Consistency
 * 3. Concurrency Control with Distributed Mutual Exclusion
 * 4. Fault Tolerance with Checkpoints and Rollback
 */
import path from 'path';
import readline from 'readline-sync';
import { v4 as uuidv4 } from 'uuid';
import * as dotenv from 'dotenv';
import { Message, ControlMessage, ControlMessageType, NodeConfiguration } from './types/types';
import { MulticastCommunicator } from './modules/1multicast/multicast';
import { Replicator } from './modules/2replication/replication';
import { Reconciler } from './modules/2replication/reconciler';
import { MutualExclusion } from './modules/3mutualExclusion/mutualExclusion';
import { CheckpointManager, simulateFailure } from './modules/4 faultTolerance/checkpoint';
import { logInfo, logError, logWarning, logDebug, setLogLevel, LogLevel } from './utils/logger';

// Load environment configurations
dotenv.config();

// Set of received messages
const receivedMessages: Message[] = [];

// Node configuration
const config: NodeConfiguration = {
  id: process.env.NODE_ID || `node-${Math.floor(Math.random() * 1000)}`,
  multicastAddress: process.env.MULTICAST_ADDRESS || '224.1.1.1',
  multicastPort: parseInt(process.env.MULTICAST_PORT || '5007'),
  replicasPath: process.env.REPLICAS_PATH || path.join(__dirname, '..', 'data', 'replicas'),
  checkpointInterval: parseInt(process.env.CHECKPOINT_INTERVAL || '30000'),
};

// Enable debug logs if needed
if (process.env.DEBUG === 'true') {
  setLogLevel(LogLevel.DEBUG);
} else {
  setLogLevel(LogLevel.INFO);
}

// Function to process received messages
function processMessage(data: Message | ControlMessage) {
  // Check if it's a control message
  if ('type' in data) {
    mutualExclusion.processMessage(data);
    return;
  }
  
  // Check if we've already received this message
  const messageExists = receivedMessages.some(m => m.id === data.id);
  if (messageExists) {
    return;
  }
  
  // Add to message list
  receivedMessages.push(data);
  
  // Display the message
  console.log(`\n${data.origin}: ${data.content}`);
  
  // Replicate the message
  replicator.saveMessage(data);
  
  // Simulate random failure
  if (simulateFailure()) {
    simulateCrash();
  }
}

// Function to send chat message
function sendChatMessage(content: string) {
  // Check if has permission from mutual exclusion algorithm
  const status = mutualExclusion.getStatus();
  
  if (!status.isExisting) {
    console.log('Requesting permission to send message...');
    mutualExclusion.requestResource();
    return; // Message will be sent when resource is acquired
  }
  
  // Create message
  const message: Message = {
    id: uuidv4(),
    origin: config.id,
    content,
    timestamp: Date.now()
  };
  
  // Send via multicast
  multicast.sendMessage(message);
  
  // Add to message list
  receivedMessages.push(message);
  
  // Replicate the message
  replicator.saveMessage(message);
  
  // Release the resource
  mutualExclusion.releaseResource();
}

// Callback when resource is acquired
function resourceAcquired() {
  console.log('Permission granted. Type your message:');
  const content = readline.question('> ');
  
  if (content.trim()) {
    sendChatMessage(content);
    console.log('Message sent.');
  } else {
    console.log('Empty message, not sent.');
    mutualExclusion.releaseResource();
  }
}

// Simulate crash and recovery
function simulateCrash() {
  logWarning('SIMULATION: Failure detected. Node will restart...');
  
  // Create checkpoint before "failing"
  const checkpointId = checkpointManager.createCheckpoint();
  
  // Stop all services
  multicast.stop();
  reconciler.stop();
  checkpointManager.stop();
  
  // Clear state
  receivedMessages.length = 0;
  
  // Wait some time before "restarting"
  setTimeout(() => {
    logWarning('SIMULATION: Restarting after failure...');
    
    // Recover messages from last checkpoint
    const recoveredMessages = checkpointManager.recoverState();
    
    // Restore state
    receivedMessages.push(...recoveredMessages);
    
    // Restart services
    multicast.start();
    reconciler.start();
    checkpointManager.init();
    
    logInfo(`Recovery completed. ${recoveredMessages.length} messages restored from checkpoint.`);
  }, 2000);
}

// Function to display command menu
function displayMenu() {
  console.log('\n--- DISTRIBUTED CHAT SYSTEM ---');
  console.log(`Node ID: ${config.id}`);
  console.log('Available commands:');
  console.log('/send - Request permission to send message');
  console.log('/status - Display node status');
  console.log('/messages - Display stored messages');
  console.log('/checkpoint - Create a manual checkpoint');
  console.log('/recover - Simulate failure and recovery');
  console.log('/reconcile - Execute manual reconciliation');
  console.log('/exit - Close application');
  console.log('-----------------------------------\n');
}

// Command line interface
function startCLI() {
  displayMenu();
  
  while (true) {
    const command = readline.question('> ');
    
    switch (command.trim().toLowerCase()) {
      case '/send':
        mutualExclusion.requestResource();
        break;
      
      case '/status':
        const status = mutualExclusion.getStatus();
        console.log(`Status of node ${config.id}:`);
        console.log(`- Waiting for resource: ${status.isWaiting}`);
        console.log(`- Has resource: ${status.isExisting}`);
        console.log(`- Stored messages: ${receivedMessages.length}`);
        console.log(`- Last message: ${receivedMessages.length > 0 ? 
          new Date(receivedMessages[receivedMessages.length-1].timestamp).toLocaleString() : 'None'}`);
        break;
      
      case '/messages':
        console.log(`Stored messages (${receivedMessages.length}):`);
        receivedMessages.forEach((msg, i) => {
          console.log(`${i+1}. [${new Date(msg.timestamp).toLocaleString()}] ${msg.origin}: ${msg.content}`);
        });
        break;
      
      case '/checkpoint':
        const id = checkpointManager.createCheckpoint();
        console.log(`Checkpoint created: ${id}`);
        break;
      
      case '/recover':
        simulateCrash();
        break;
      
      case '/reconcile':
        reconciler.reconcile();
        break;
      
      case '/exit':
        console.log('Shutting down application...');
        multicast.stop();
        reconciler.stop();
        checkpointManager.close();
        process.exit(0);
        break;
      
      case '/help':
        displayMenu();
        break;
      
      default:
        if (command.startsWith('/')) {
          console.log('Unknown command. Type /help to see available commands.');
        } else {
          mutualExclusion.requestResource();
        }
        break;
    }
  }
}

// Initialize components
logInfo('Initializing distributed chat system...');

// 1. Group Communication with Multicast
const multicast = new MulticastCommunicator(
  config.id,
  config.multicastAddress,
  config.multicastPort,
  processMessage
);

// 2. Data Replication
const replicator = new Replicator(config.replicasPath, 3, 1000); // Assuming 3 replicas with max delay of 1000ms
const reconciler = new Reconciler(replicator, 10000); // Reconciliation every 10 seconds

// 3. Distributed Mutual Exclusion
const mutualExclusion = new MutualExclusion(
  config.id,
  (msg: ControlMessage) => multicast.sendMessage(msg),
  resourceAcquired
);

// 4. Fault Tolerance with Checkpoints
const checkpointManager = new CheckpointManager(
  config.id,
  path.join(config.replicasPath, config.id),
  config.checkpointInterval,
  () => [...receivedMessages] // Clone array for checkpoint
);

// Start services
multicast.start();
reconciler.start();
checkpointManager.init();

// Check for checkpoints to recover
const recoveredMessages = checkpointManager.recoverState();
if (recoveredMessages.length > 0) {
  receivedMessages.push(...recoveredMessages);
  logInfo(`State recovered with ${recoveredMessages.length} messages from last checkpoint.`);
}

// Start command interface
startCLI();