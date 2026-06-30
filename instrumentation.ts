export async function register() {
  // Ensure we only execute the background scheduler in the Node.js server environment (not Edge or client side)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('Registering Next.js server instrumentation startup hooks...');
    try {
      const { startBackgroundScheduler } = await import('./lib/monitor-engine');
      startBackgroundScheduler();
    } catch (err) {
      console.error('Failed to initialize background PNR monitor scheduler in instrumentation:', err);
    }
  }
}
