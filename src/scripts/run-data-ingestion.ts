#!/usr/bin/env npx tsx

import { DataIngestionService } from '../core/DataIngestionService';
import { config } from 'dotenv';

// Load environment variables
config();

async function main() {
  console.log('🚀 Starting Protocol Event Data Ingestion Service...\n');

  // Configuration
  const ingestionConfig = {
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '9001'),
      username: process.env.CLICKHOUSE_USERNAME || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'default',
      secure: process.env.CLICKHOUSE_SECURE === 'true' || false
    },
    blockchain: {
      ethereum: {
        rpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
        wsUrl: process.env.ETHEREUM_WS_URL
      },
      bsc: {
        rpcUrl: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org/',
        wsUrl: process.env.BSC_WS_URL
      }
    }
  };

  const dataIngestionService = new DataIngestionService(ingestionConfig);

  // Set up event handlers
  dataIngestionService.on('started', () => {
    console.log('✅ Data ingestion service started');
  });

  dataIngestionService.on('stopped', () => {
    console.log('✅ Data ingestion service stopped');
  });

  dataIngestionService.on('event', (event) => {
    console.log(`📊 Event: ${event.protocol} ${event.eventType} - ${event.id}`);
  });

  dataIngestionService.on('factoryEvent', (event) => {
    console.log(`🏭 Factory Event: ${event.protocol} ${event.eventType} - ${event.pairAddress}`);
  });

  dataIngestionService.on('error', (error) => {
    console.error(`❌ Error from ${error.source}:`, error.error);
  });

  // Start the service
  try {
    await dataIngestionService.start();
    
    // Set up periodic status reporting
    const statusInterval = setInterval(async () => {
      try {
        const bufferStatus = dataIngestionService.getBufferStatus();
        const eventCount = await dataIngestionService.getEventCount();
        const replicationStatus = await dataIngestionService.getReplicationStatus();
        
        console.log('\n📊 Status Report:');
        console.log(`  Events in buffer: ${bufferStatus.events} (${bufferStatus.factoryEvents} factory)`);
        console.log(`  Total events in ClickHouse: ${eventCount}`);
        console.log(`  Replication status: ${replicationStatus.length} replicas`);
        
        if (replicationStatus.length > 0) {
          replicationStatus.forEach((replica: any) => {
            console.log(`    - ${replica.replica}: ${replica.is_leader ? 'Leader' : 'Follower'}`);
          });
        }
      } catch (error) {
        console.error('❌ Status check failed:', error);
      }
    }, 30000); // Every 30 seconds

    // Set up graceful shutdown
    const shutdown = async () => {
      console.log('\n🛑 Shutting down data ingestion service...');
      clearInterval(statusInterval);
      await dataIngestionService.stop();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process running
    console.log('\n✅ Data ingestion service is running. Press Ctrl+C to stop.');
    
    // Wait indefinitely
    await new Promise(() => {});

  } catch (error) {
    console.error('❌ Failed to start data ingestion service:', error);
    process.exit(1);
  }
}

// Run the service
main().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
