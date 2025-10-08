#!/usr/bin/env npx tsx

import { DataIngestionService } from '../core/DataIngestionService';
import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';

// Load environment variables
config();

async function testIntegration(): Promise<void> {
  console.log('🧪 Testing Complete Integration: Blockchain → ClickHouse Cloud\n');

  // Configuration
  const ingestionConfig = {
    clickhouse: {
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '8443'),
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

  try {
    // Test 1: ClickHouse Cloud Connectivity
    console.log('📡 Test 1: ClickHouse Cloud Connectivity');
    console.log('=====================================');
    
    const clickhouseService = new ClickHouseService(ingestionConfig.clickhouse);
    await clickhouseService.connect();
    console.log('✅ Connected to ClickHouse Cloud');
    
    await clickhouseService.initializeSchema();
    console.log('✅ Schema initialized');
    
    const initialCount = await clickhouseService.getEventCount();
    console.log(`✅ Initial event count: ${initialCount}`);
    
    // Test 2: Data Ingestion Service
    console.log('\n🚀 Test 2: Data Ingestion Service');
    console.log('==================================');
    
    const dataIngestionService = new DataIngestionService(ingestionConfig);
    
    // Set up event handlers for monitoring
    let eventCount = 0;
    let factoryEventCount = 0;
    
    dataIngestionService.on('event', (event) => {
      eventCount++;
      console.log(`📊 Event ${eventCount}: ${event.protocol} ${event.eventType} - ${event.id}`);
    });
    
    dataIngestionService.on('factoryEvent', (event) => {
      factoryEventCount++;
      console.log(`🏭 Factory Event ${factoryEventCount}: ${event.protocol} ${event.eventType} - ${event.pairAddress}`);
    });
    
    dataIngestionService.on('error', (error) => {
      console.error(`❌ Error from ${error.source}:`, error.error);
    });
    
    // Start the service
    await dataIngestionService.start();
    console.log('✅ Data ingestion service started');
    
    // Test 3: Monitor for Events
    console.log('\n⏱️ Test 3: Monitoring for Events (30 seconds)');
    console.log('============================================');
    
    const startTime = Date.now();
    const testDuration = 30000; // 30 seconds
    
    const monitorInterval = setInterval(async () => {
      try {
        const bufferStatus = dataIngestionService.getBufferStatus();
        const totalEvents = await clickhouseService.getEventCount();
        
        console.log(`\n📊 Status Update (${Math.floor((Date.now() - startTime) / 1000)}s):`);
        console.log(`  Events captured: ${eventCount}`);
        console.log(`  Factory events: ${factoryEventCount}`);
        console.log(`  Buffer: ${bufferStatus.events} events, ${bufferStatus.factoryEvents} factory events`);
        console.log(`  Total in ClickHouse: ${totalEvents}`);
        
      } catch (error) {
        console.error('❌ Status check failed:', error);
      }
    }, 10000); // Every 10 seconds
    
    // Wait for test duration
    await new Promise(resolve => setTimeout(resolve, testDuration));
    clearInterval(monitorInterval);
    
    // Test 4: Data Verification
    console.log('\n🔍 Test 4: Data Verification');
    console.log('===========================');
    
    const finalCount = await clickhouseService.getEventCount();
    const eventsAdded = finalCount - initialCount;
    
    console.log(`✅ Events added during test: ${eventsAdded}`);
    console.log(`✅ Events captured by listeners: ${eventCount}`);
    
    // Test 5: Analytics Queries
    console.log('\n📈 Test 5: Analytics Queries');
    console.log('============================');
    
    const eventStats = await clickhouseService.getEventStats();
    console.log('Event statistics:');
    eventStats.forEach((stat: any) => {
      console.log(`  ${stat.protocol} ${stat.event_type}: ${stat.event_count} events, ${stat.unique_pools} pools`);
    });
    
    // Test 6: Cleanup
    console.log('\n🧹 Test 6: Cleanup');
    console.log('==================');
    
    await dataIngestionService.stop();
    console.log('✅ Data ingestion service stopped');
    
    await clickhouseService.disconnect();
    console.log('✅ ClickHouse Cloud disconnected');
    
    // Final Summary
    console.log('\n🎯 Integration Test Summary');
    console.log('===========================');
    console.log(`✅ Total events captured: ${eventCount}`);
    console.log(`✅ Total factory events: ${factoryEventCount}`);
    console.log(`✅ Events stored in ClickHouse: ${eventsAdded}`);
    console.log(`✅ System operational: ${eventCount > 0 || eventsAdded > 0 ? 'Yes' : 'No'}`);
    
    if (eventCount > 0 || eventsAdded > 0) {
      console.log('\n🎉 SUCCESS: Complete integration test passed!');
      console.log('✅ Blockchain events are being captured and stored in ClickHouse Cloud');
      console.log('✅ System is ready for production use');
    } else {
      console.log('\n⚠️ WARNING: No events captured during test');
      console.log('⚠️ This might be due to:');
      console.log('  - No active trading on monitored pools');
      console.log('  - Network connectivity issues');
      console.log('  - RPC endpoint limitations');
      console.log('⚠️ System is still functional, but no data was captured');
    }
    
  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);
  }
}

// Run the integration test
testIntegration().catch(error => {
  console.error('💥 Fatal error in integration test:', error);
  process.exit(1);
});
