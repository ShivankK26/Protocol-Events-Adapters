#!/usr/bin/env node

/**
 * Protocol Event Listener CLI Runner
 * 
 * This script provides a command-line interface for running blockchain event
 * listeners on different networks. It supports individual network listeners
 * as well as multi-chain monitoring for comprehensive event coverage.
 * 
 * Features:
 * - Ethereum listener for Uniswap V2 and V3 protocols
 * - BSC listener for PancakeSwap V2 protocol
 * - Multi-chain listener for comprehensive coverage
 * - Graceful shutdown and error handling
 * - Real-time event monitoring and logging
 * 
 * Usage:
 *   npm run listener:ethereum    # Run Ethereum listener (Uniswap V2 & V3)
 *   npm run listener:bsc         # Run BSC listener (PancakeSwap V2)
 *   npm run listener:all         # Run all listeners
 * 
 * Direct execution:
 *   npx tsx src/scripts/run-listener.ts ethereum
 *   npx tsx src/scripts/run-listener.ts bsc
 *   npx tsx src/scripts/run-listener.ts all
 */

import { createEthereumListener, createBSCListener } from '../app/protocol-listener';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

/**
 * Run Ethereum blockchain event listener
 * 
 * Initializes and starts the Ethereum listener for monitoring Uniswap V2
 * and V3 protocols. This listener captures real-time trading events,
 * liquidity changes, and new pool creation events on Ethereum mainnet.
 * 
 * @throws Error if listener initialization or startup fails
 */
async function runEthereumListener(): Promise<void> {
  console.log('🚀 Starting Ethereum Protocol Event Listener...\n');
  
  const listener = createEthereumListener();
  
  try {
    await listener.start();
    console.log('✅ Ethereum listener started successfully!');
    console.log('📡 Listening for Uniswap V2 & V3 events...\n');
    
    /**
     * Set up graceful shutdown for Ethereum listener
     * 
     * Handles SIGINT signal to ensure proper cleanup of blockchain
     * connections and event listeners when the process is terminated.
     */
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

/**
 * Run BSC blockchain event listener
 * 
 * Initializes and starts the BSC listener for monitoring PancakeSwap V2
 * protocol. This listener captures real-time trading events, liquidity
 * changes, and new pair creation events on BSC mainnet.
 * 
 * @throws Error if listener initialization or startup fails
 */
async function runBSCListener(): Promise<void> {
  console.log('🚀 Starting BSC Protocol Event Listener...\n');
  
  const listener = createBSCListener();
  
  try {
    await listener.start();
    console.log('✅ BSC listener started successfully!');
    console.log('📡 Listening for PancakeSwap V2 events...\n');
    
    /**
     * Set up graceful shutdown for BSC listener
     * 
     * Handles SIGINT signal to ensure proper cleanup of blockchain
     * connections and event listeners when the process is terminated.
     */
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

/**
 * Run all blockchain event listeners simultaneously
 * 
 * Initializes and starts both Ethereum and BSC listeners concurrently
 * for comprehensive multi-chain event monitoring. This provides complete
 * coverage of major DeFi protocols across different blockchain networks.
 * 
 * @throws Error if any listener initialization or startup fails
 */
async function runAllListeners(): Promise<void> {
  console.log('🚀 Starting All Protocol Event Listeners...\n');
  
  const ethereumListener = createEthereumListener();
  const bscListener = createBSCListener();
  
  try {
    /**
     * Start both listeners concurrently
     * 
     * Uses Promise.all to start both Ethereum and BSC listeners
     * simultaneously, ensuring optimal startup performance and
     * comprehensive event coverage.
     */
    await Promise.all([
      ethereumListener.start(),
      bscListener.start()
    ]);
    
    console.log('✅ All listeners started successfully!');
    console.log('📡 Listening for events from:');
    console.log('  - Ethereum: Uniswap V2 & V3');
    console.log('  - BSC: PancakeSwap V2\n');
    
    /**
     * Set up graceful shutdown for all listeners
     * 
     * Handles SIGINT signal to ensure proper cleanup of all blockchain
     * connections and event listeners when the process is terminated.
     * Uses Promise.all for concurrent shutdown of all listeners.
     */
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

/**
 * Main execution function with command-line argument parsing
 * 
 * Parses command-line arguments and routes to the appropriate listener
 * function based on the provided command. Supports ethereum, bsc, and all
 * commands with comprehensive usage information for invalid commands.
 * 
 * @throws Error for invalid commands or listener startup failures
 */
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
      /**
       * Display usage information for invalid commands
       * 
       * Provides comprehensive usage information including npm scripts
       * and direct execution commands for all supported operations.
       */
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

/**
 * Handle uncaught exceptions and unhandled promise rejections
 * 
 * Provides comprehensive error handling for unexpected errors that could
 * crash the process. This ensures proper error reporting and graceful
 * process termination in production environments.
 */
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/**
 * Execute the main function with comprehensive error handling
 * 
 * Runs the main function with proper error handling for unhandled
 * promise rejections and fatal errors that could crash the process.
 */
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
