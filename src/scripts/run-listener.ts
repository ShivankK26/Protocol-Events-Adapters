#!/usr/bin/env node

/**
 * CLI script to run the Protocol Event Listener System
 * 
 * Usage:
 *   npm run listener:ethereum    # Run Ethereum listener (Uniswap V2 & V3)
 *   npm run listener:bsc         # Run BSC listener (PancakeSwap V2)
 *   npm run listener:all         # Run all listeners
 */

import { createEthereumListener, createBSCListener } from '../app/protocol-listener';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function runEthereumListener(): Promise<void> {
  console.log('🚀 Starting Ethereum Protocol Event Listener...\n');
  
  const listener = createEthereumListener();
  
  try {
    await listener.start();
    console.log('✅ Ethereum listener started successfully!');
    console.log('📡 Listening for Uniswap V2 & V3 events...\n');
    
    // Keep running until interrupted
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down Ethereum listener...');
      await listener.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start Ethereum listener:', error);
    process.exit(1);
  }
}

async function runBSCListener(): Promise<void> {
  console.log('🚀 Starting BSC Protocol Event Listener...\n');
  
  const listener = createBSCListener();
  
  try {
    await listener.start();
    console.log('✅ BSC listener started successfully!');
    console.log('📡 Listening for PancakeSwap V2 events...\n');
    
    // Keep running until interrupted
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down BSC listener...');
      await listener.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start BSC listener:', error);
    process.exit(1);
  }
}

async function runAllListeners(): Promise<void> {
  console.log('🚀 Starting All Protocol Event Listeners...\n');
  
  const ethereumListener = createEthereumListener();
  const bscListener = createBSCListener();
  
  try {
    // Start both listeners
    await Promise.all([
      ethereumListener.start(),
      bscListener.start()
    ]);
    
    console.log('✅ All listeners started successfully!');
    console.log('📡 Listening for events from:');
    console.log('  - Ethereum: Uniswap V2 & V3');
    console.log('  - BSC: PancakeSwap V2\n');
    
    // Keep running until interrupted
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down all listeners...');
      await Promise.all([
        ethereumListener.stop(),
        bscListener.stop()
      ]);
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Failed to start listeners:', error);
    process.exit(1);
  }
}

// Main execution
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'ethereum':
      await runEthereumListener();
      break;
    case 'bsc':
      await runBSCListener();
      break;
    case 'all':
      await runAllListeners();
      break;
    default:
      console.log('Usage:');
      console.log('  npm run listener:ethereum    # Run Ethereum listener (Uniswap V2 & V3)');
      console.log('  npm run listener:bsc         # Run BSC listener (PancakeSwap V2)');
      console.log('  npm run listener:all         # Run all listeners');
      console.log('');
      console.log('Or run directly:');
      console.log('  npx tsx src/scripts/run-listener.ts ethereum');
      console.log('  npx tsx src/scripts/run-listener.ts bsc');
      console.log('  npx tsx src/scripts/run-listener.ts all');
      process.exit(1);
  }
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the main function
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
