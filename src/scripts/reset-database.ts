#!/usr/bin/env npx tsx

import { ClickHouseService } from '../core/ClickHouseService';
import { config } from 'dotenv';

// Load environment variables
config();

async function resetDatabase(): Promise<void> {
  console.log('🗑️ Resetting ClickHouse Cloud Database...\n');

  // Configuration
  const clickhouseConfig = {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8443'),
    username: process.env.CLICKHOUSE_USERNAME || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'default',
    secure: process.env.CLICKHOUSE_SECURE === 'true' || false
  };

  try {
    const clickhouseService = new ClickHouseService(clickhouseConfig);
    await clickhouseService.connect();
    console.log('✅ Connected to ClickHouse Cloud');

    // Drop existing tables
    console.log('\n🗑️ Dropping existing tables...');
    try {
      await clickhouseService.client.command({ query: 'DROP TABLE IF EXISTS protocol_events' });
      console.log('✅ Dropped protocol_events table');
    } catch (error) {
      console.log('⚠️ protocol_events table might not exist');
    }

    try {
      await clickhouseService.client.command({ query: 'DROP TABLE IF EXISTS protocol_events_mv' });
      console.log('✅ Dropped protocol_events_mv table');
    } catch (error) {
      console.log('⚠️ protocol_events_mv table might not exist');
    }

    // Recreate schema
    console.log('\n📊 Recreating database schema...');
    await clickhouseService.initializeSchema();
    console.log('✅ Database schema recreated');

    await clickhouseService.disconnect();
    console.log('\n🎉 Database reset completed successfully!');
    console.log('\n✅ Your database is now clean and ready for real blockchain events');
    console.log('\n🚀 Next steps:');
    console.log('   1. Run: yarn data:ingestion');
    console.log('   2. Or run: yarn test:integration');

  } catch (error) {
    console.error('❌ Failed to reset database:', error);
    process.exit(1);
  }
}

// Run reset
resetDatabase().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});
