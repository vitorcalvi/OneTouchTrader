/**
 * Graceful Shutdown Handler
 * FIX: HIGH #6 - Graceful shutdown
 */

const cleanupHandlers = [];

export function registerCleanup(handler) {
  cleanupHandlers.push(handler);
}

export async function setupGracefulShutdown() {
  const shutdown = async (signal) => {
    console.log(`\n[Shutdown] Received ${signal}, starting graceful shutdown...`);
    
    for (const handler of cleanupHandlers) {
      try {
        await handler();
      } catch (error) {
        console.error('[Shutdown] Cleanup error:', error);
      }
    }
    
    console.log('[Shutdown] Cleanup complete, exiting');
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
