#!/usr/bin/env npx tsx

import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';

// Load environment variables
config();

async function setupClickHouseCloud(): Promise<void> {
  console.log('☁️ Setting up ClickHouse Cloud...\n');

  // Configuration from environment variables
  const clickhouseConfig = {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8443'),
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'default',
    secure: process.env.CLICKHOUSE_SECURE === 'true' || false
  };

  // Validate configuration
  if (!process.env.CLICKHOUSE_HOST || !process.env.CLICKHOUSE_PASSWORD) {
    console.error('❌ Missing required environment variables:');
    console.error('   CLICKHOUSE_HOST - Your ClickHouse Cloud host');
    console.error('   CLICKHOUSE_PASSWORD - Your ClickHouse Cloud password');
    console.error('\nPlease update your .env file with the correct values.');
    process.exit(1);
  }

  try {
    console.log('🔗 Connecting to ClickHouse Cloud...');
    console.log(`   Host: ${clickhouseConfig.host}`);
    console.log(`   Port: ${clickhouseConfig.port}`);
    console.log(`   Secure: ${clickhouseConfig.secure}`);
    
    const clickhouseService = new ClickHouseService(clickhouseConfig);
    
    // Test connection
    await clickhouseService.connect();
    console.log('✅ Connected to ClickHouse Cloud successfully!');
    
    // Initialize schema
    console.log('\n📊 Setting up database schema...');
    await clickhouseService.initializeSchema();
    console.log('✅ Database schema initialized successfully!');
    
    // Test data insertion
    console.log('\n🧪 Testing data insertion...');
    const testEvent = {
      id: `test-cloud-${Date.now()}`,
      protocol: 'uniswap-v2' as const,
      version: 'v2',
      eventType: 'swap' as const,
      timestamp: Date.now(),
      blockNumber: 12345,
      transactionHash: `0x${Math.random().toString(16).substr(2, 8)}`,
      logIndex: 1,
      poolAddress: `0x${Math.random().toString(16).substr(2, 8)}`,
      token0: {
        address: `0x${Math.random().toString(16).substr(2, 8)}`,
        symbol: 'TEST0',
        decimals: 18,
        name: 'Test Token 0'
      },
      token1: {
        address: `0x${Math.random().toString(16).substr(2, 8)}`,
        symbol: 'TEST1',
        decimals: 18,
        name: 'Test Token 1'
      },
      data: {
        type: 'swap' as const,
        sender: `0x${Math.random().toString(16).substr(2, 8)}`,
        recipient: `0x${Math.random().toString(16).substr(2, 8)}`,
        amount0In: '1000000000000000000',
        amount1In: '0',
        amount0Out: '0',
        amount1Out: '2000000000000000000'
      }
    };

    await clickhouseService.insertEvent(testEvent);
    console.log('✅ Test event inserted successfully!');
    
    // Verify data
    const eventCount = await clickhouseService.getEventCount();
    console.log(`✅ Total events in database: ${eventCount}`);
    
    // Get event stats
    const stats = await clickhouseService.getEventStats();
    console.log('\n📈 Database Statistics:');
    stats.forEach((stat: any) => {
      console.log(`   ${stat.protocol} ${stat.event_type}: ${stat.event_count} events`);
    });
    
    await clickhouseService.disconnect();
    
    console.log('\n🎉 ClickHouse Cloud setup completed successfully!');
    console.log('\n✅ Your cloud database is ready for data ingestion.');
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: yarn data:ingestion');
    console.log('   2. Or run: yarn test:integration');
    
  } catch (error) {
    console.error('❌ Failed to setup ClickHouse Cloud:', error);
    console.error('\n🔧 Troubleshooting:');
    console.error('   1. Check your .env file has correct CLICKHOUSE_HOST and CLICKHOUSE_PASSWORD');
    console.error('   2. Verify your ClickHouse Cloud service is running');
    console.error('   3. Check your network connection');
    process.exit(1);
  }
}

// Run setup
setupClickHouseCloud().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
