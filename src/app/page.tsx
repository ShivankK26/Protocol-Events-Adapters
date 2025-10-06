'use client';

import { useState, useEffect } from 'react';

export default function Home() {
  const [isListening, setIsListening] = useState(false);
  const [events, setEvents] = useState<any[]>([]);
  const [pools, setPools] = useState<any[]>([]);

  const startListener = async () => {
    try {
      setIsListening(true);
      console.log('Starting protocol event listener...');
      // In a real implementation, this would start the actual listener
      // For demo purposes, we'll simulate events
      simulateEvents();
    } catch (error) {
      console.error('Failed to start listener:', error);
      setIsListening(false);
    }
  };

  const stopListener = () => {
    setIsListening(false);
    console.log('Stopped protocol event listener');
  };

  const simulateEvents = () => {
    const eventTypes = ['swap', 'mint', 'burn', 'sync'];
    const protocols = ['uniswap-v2', 'uniswap-v3', 'pancakeswap-v2'];
    const tokens = [
      { symbol: 'WETH', name: 'Wrapped Ethereum' },
      { symbol: 'USDC', name: 'USD Coin' },
      { symbol: 'USDT', name: 'Tether USD' },
      { symbol: 'DAI', name: 'Dai Stablecoin' }
    ];

    const interval = setInterval(() => {
      if (!isListening) {
        clearInterval(interval);
        return;
      }

      const randomEvent = {
        id: Math.random().toString(36).substr(2, 9),
        protocol: protocols[Math.floor(Math.random() * protocols.length)],
        eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        timestamp: Date.now(),
        blockNumber: Math.floor(Math.random() * 1000000) + 18000000,
        transactionHash: '0x' + Math.random().toString(16).substr(2, 64),
        poolAddress: '0x' + Math.random().toString(16).substr(2, 40),
        token0: tokens[Math.floor(Math.random() * tokens.length)],
        token1: tokens[Math.floor(Math.random() * tokens.length)],
        data: {
          amount0: (Math.random() * 1000).toFixed(2),
          amount1: (Math.random() * 1000).toFixed(2)
        }
      };

      setEvents(prev => [randomEvent, ...prev.slice(0, 9)]);
    }, 2000);

    return () => clearInterval(interval);
  };

  useEffect(() => {
    if (isListening) {
      const cleanup = simulateEvents();
      return cleanup;
    }
  }, [isListening]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Protocol Event Adapters
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Real-time blockchain protocol event monitoring system
          </p>
          
          <div className="flex gap-4 justify-center">
            <button
              onClick={startListener}
              disabled={isListening}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                isListening
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isListening ? 'Listening...' : 'Start Listener'}
            </button>
            
            <button
              onClick={stopListener}
              disabled={!isListening}
              className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
                !isListening
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              Stop Listener
            </button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Real-time Events */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
              <div className={`w-3 h-3 rounded-full mr-3 ${isListening ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              Real-time Events
            </h2>
            
            <div className="space-y-4 max-h-96 overflow-y-auto">
              {events.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  {isListening ? 'Waiting for events...' : 'Start the listener to see events'}
                </p>
              ) : (
                events.map((event, index) => (
                  <div key={event.id} className="border-l-4 border-blue-500 pl-4 py-2 bg-gray-50 rounded-r-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-blue-600 uppercase">
                        {event.protocol} {event.eventType}
                      </span>
                      <span className="text-xs text-gray-500">
                        Block #{event.blockNumber}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{event.token0.symbol}</span>
                        <span>↔</span>
                        <span className="font-medium">{event.token1.symbol}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {event.data.amount0} {event.token0.symbol} / {event.data.amount1} {event.token1.symbol}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Protocol Status */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              Protocol Status
            </h2>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                  <span className="font-semibold">Uniswap V2</span>
                </div>
                <span className="text-sm text-gray-600">Ethereum</span>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                  <span className="font-semibold">Uniswap V3</span>
                </div>
                <span className="text-sm text-gray-600">Ethereum</span>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                <div className="flex items-center">
                  <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                  <span className="font-semibold">PancakeSwap V2</span>
                </div>
                <span className="text-sm text-gray-600">BSC</span>
              </div>
            </div>

            <div className="mt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Supported Events</h3>
              <div className="grid grid-cols-2 gap-2">
                {['Swap', 'Mint', 'Burn', 'Sync', 'Initialize'].map((eventType) => (
                  <div key={eventType} className="text-sm bg-blue-50 text-blue-700 px-3 py-2 rounded-lg text-center">
                    {eventType}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="mt-12 bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Getting Started</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔧</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Setup</h3>
              <p className="text-sm text-gray-600">
                Configure your RPC endpoints in the .env file
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🚀</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Run</h3>
              <p className="text-sm text-gray-600">
                Start the listener with npm run listener:ethereum
              </p>
            </div>
            
            <div className="text-center">
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">📊</span>
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">Monitor</h3>
              <p className="text-sm text-gray-600">
                Watch real-time events from all supported protocols
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}