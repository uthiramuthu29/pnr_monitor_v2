import { connectToDatabase } from './db';
import { Monitor, NotificationLog, IMonitor } from './models';
import { getPNRProvider, PNRStatus, MockPNRProvider } from './pnr';
import { getWhatsAppProvider } from './whatsapp';

declare global {
  // eslint-disable-next-line no-var
  var isMonitorSchedulerRunning: boolean | undefined;
}

// Check status of a single monitor and send alerts if there is a change or if frequency interval has elapsed
export async function checkMonitor(monitorInput: string | IMonitor, forceNotify = false): Promise<PNRStatus> {
  await connectToDatabase();

  let monitor: IMonitor;
  if (typeof monitorInput === 'string') {
    const found = await Monitor.findById(monitorInput);
    if (!found) throw new Error('Monitor not found');
    monitor = found;
  } else {
    monitor = monitorInput;
  }

  const previousStatus: PNRStatus | undefined = monitor.lastStatus 
    ? JSON.parse(monitor.lastStatus) 
    : undefined;

  const pnrProvider = getPNRProvider();
  
  // Fetch status (passing previous status if it exists, so Mock provider can maintain continuity)
  const newStatus = await pnrProvider.fetchStatus(monitor.pnr, previousStatus);
  
  // Detect changes between old and new status
  const changes: string[] = [];
  let statusChanged = false;

  if (previousStatus) {
    // Compare chart status
    if (previousStatus.chartStatus !== newStatus.chartStatus) {
      changes.push(`Chart Status: ${previousStatus.chartStatus} ➡️ ${newStatus.chartStatus}`);
      statusChanged = true;
    }

    // Compare passengers list size and details
    newStatus.passengers.forEach((passenger) => {
      const oldPassenger = previousStatus.passengers.find(p => p.number === passenger.number);
      if (!oldPassenger) {
        changes.push(`Passenger ${passenger.number} added: ${passenger.currentStatus}`);
        statusChanged = true;
      } else if (oldPassenger.currentStatus !== passenger.currentStatus) {
        changes.push(`Pass ${passenger.number}: ${oldPassenger.currentStatus} ➡️ ${passenger.currentStatus}`);
        statusChanged = true;
      }
    });
  } else {
    // First time checking, we treat it as an update if we want to confirm subscription
    statusChanged = true;
  }

  // Determine whether to notify:
  // 1. Manual trigger (forceNotify === true)
  // 2. Status has changed (statusChanged === true)
  // 3. Frequency interval elapsed
  let shouldNotify = forceNotify || statusChanged;

  if (!shouldNotify && monitor.lastCheckedAt) {
    const elapsedMs = Date.now() - monitor.lastCheckedAt.getTime();
    const frequencyMs = monitor.frequencyHours * 60 * 60 * 1000;
    if (elapsedMs >= frequencyMs) {
      shouldNotify = true;
    }
  }

  if (shouldNotify) {
    const whatsappProvider = getWhatsAppProvider();
    const alertMessage = formatWhatsAppMessage(newStatus, previousStatus, changes, monitor.frequencyHours);

    // Send notifications to all configured numbers in parallel
    const deliveryPromises = monitor.whatsappNumbers.map(async (number) => {
      try {
        const result = await whatsappProvider.sendMessage(number, alertMessage);
        
        // Write to audit notification log
        await NotificationLog.create({
          monitorId: monitor._id,
          pnr: monitor.pnr,
          phoneNumber: number,
          message: alertMessage,
          status: result.success ? (process.env.WHATSAPP_PROVIDER === 'mock' || !process.env.WHATSAPP_PROVIDER ? 'MOCK_SENT' : 'DELIVERED') : 'FAILED',
          errorMessage: result.error
        });
      } catch (err: any) {
        console.error(`Failed to record alert log for ${number}:`, err);
        await NotificationLog.create({
          monitorId: monitor._id,
          pnr: monitor.pnr,
          phoneNumber: number,
          message: alertMessage,
          status: 'FAILED',
          errorMessage: err.message
        });
      }
    });

    await Promise.all(deliveryPromises);
  }

  // Update monitor state in the database
  monitor.lastCheckedAt = new Date();
  monitor.lastStatus = JSON.stringify(newStatus);
  await monitor.save();

  return newStatus;
}

// Evolve the simulated status of a mock PNR monitor
export async function simulateStatusChange(monitorId: string): Promise<PNRStatus> {
  await connectToDatabase();
  const monitor = await Monitor.findById(monitorId);
  if (!monitor) throw new Error('Monitor not found');

  if (process.env.PNR_PROVIDER && process.env.PNR_PROVIDER !== 'mock') {
    throw new Error('Simulation is only supported in Mock Mode');
  }

  let status: PNRStatus;
  if (monitor.lastStatus) {
    status = JSON.parse(monitor.lastStatus);
  } else {
    // Generate initial status if not checked yet
    const provider = new MockPNRProvider();
    status = await provider.fetchStatus(monitor.pnr);
  }

  // Evolve status (e.g. Waiting List decreases or Confirms)
  const provider = new MockPNRProvider();
  const evolvedStatus = provider.evolveStatus(status);

  // Force database write of evolved status
  monitor.lastStatus = JSON.stringify(evolvedStatus);
  await monitor.save();

  // Trigger check now to compare with previous DB status, run engine, and notify
  return await checkMonitor(monitor, true);
}

// Generate human-readable formatted notification message
function formatWhatsAppMessage(
  newStatus: PNRStatus,
  previousStatus: PNRStatus | undefined,
  changes: string[],
  frequencyHours: number
): string {
  const isUpdate = !!previousStatus;
  const hasChanges = changes.length > 0;
  
  let header = "";
  if (!isUpdate) {
    header = `🚂 *PNR Monitoring Activated!* 🚂\n`;
  } else if (hasChanges) {
    header = `⚡ *PNR Status Update!* ⚡\n`;
  } else {
    header = `📊 *PNR Status Report* 📊\n`;
  }

  let changesSection = "";
  if (hasChanges) {
    changesSection = `*Recent Updates:*\n` + changes.map(c => `• ${c}`).join('\n') + `\n\n`;
  }

  const passengerRows = newStatus.passengers.map(p => {
    let statusEmoji = "⚪";
    if (p.currentStatus.includes("CNF")) statusEmoji = "🟢";
    else if (p.currentStatus.includes("WL")) statusEmoji = "🟡";
    else if (p.currentStatus.includes("RAC")) statusEmoji = "🔵";
    return `${statusEmoji} Passenger ${p.number}: ${p.currentStatus} (Booking: ${p.bookingStatus})`;
  }).join('\n');

  const routeStr = `${newStatus.from} ➡️ ${newStatus.to}`;
  const chartEmoji = newStatus.chartStatus === 'CHART PREPARED' ? '🟢' : '🟡';

  return `${header}
*PNR:* ${newStatus.pnr}
*Train:* ${newStatus.trainName} (${newStatus.trainNo})
*Date:* ${newStatus.dateOfJourney}
*Class:* ${newStatus.class} | *Route:* ${routeStr}

${changesSection}📝 *Passenger Status:*
${passengerRows}

${chartEmoji} *Chart Status:* ${newStatus.chartStatus}
⏰ *Updates:* Sent every ${frequencyHours} hour(s) (or immediately on seat changes).`;
}

// Start background scheduling worker in Node.js
export function startBackgroundScheduler() {
  if (globalThis.isMonitorSchedulerRunning) {
    console.log('Background scheduler is already running.');
    return;
  }

  globalThis.isMonitorSchedulerRunning = true;
  console.log('Starting PNR Monitor Background Scheduler (Interval: 1 minute)...');

  // Check every 60 seconds
  setInterval(async () => {
    try {
      await connectToDatabase();

      // Find active monitors
      const activeMonitors = await Monitor.find({ active: true });
      const now = new Date();

      for (const monitor of activeMonitors) {
        try {
          let shouldCheck = false;

          if (!monitor.lastCheckedAt) {
            shouldCheck = true;
          } else {
            const elapsedMs = now.getTime() - monitor.lastCheckedAt.getTime();
            const frequencyMs = monitor.frequencyHours * 60 * 60 * 1000;
            
            // For testing convenience: if frequencyHours is 1, let's treat it as checking every 2 mins in mock mode to make testing background jobs fast!
            // Wait, let's keep it standard, but we could offer a developer fast-polling toggle. Let's stick to standard math.
            if (elapsedMs >= frequencyMs) {
              shouldCheck = true;
            }
          }

          if (shouldCheck) {
            console.log(`Scheduler: Checking PNR ${monitor.pnr}...`);
            await checkMonitor(monitor, false);
          }
        } catch (err) {
          console.error(`Scheduler: Error checking PNR ${monitor.pnr}:`, err);
        }
      }
    } catch (err) {
      console.error('Scheduler: Error running background check loop:', err);
    }
  }, 60000); // 1 minute
}
