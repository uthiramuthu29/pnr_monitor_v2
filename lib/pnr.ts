export interface PNRPassenger {
  number: number;
  bookingStatus: string; // e.g. "WL 12", "S1, 24", "RAC 2"
  currentStatus: string; // e.g. "WL 8", "CNF", "RAC 2"
}

export interface PNRStatus {
  pnr: string;
  trainNo: string;
  trainName: string;
  dateOfJourney: string; // YYYY-MM-DD
  from: string;
  to: string;
  class: string; // e.g. "3A", "SL", "2A"
  chartStatus: 'CHART PREPARED' | 'CHART NOT PREPARED';
  passengers: PNRPassenger[];
}

export interface PNRProvider {
  fetchStatus(pnr: string, previousStatus?: PNRStatus): Promise<PNRStatus>;
}

// Generates consistent mock details for a given PNR number to simulate Indian Railways responses
export class MockPNRProvider implements PNRProvider {
  async fetchStatus(pnr: string, previousStatus?: PNRStatus): Promise<PNRStatus> {
    // If we have previous status, we mostly return it as-is, simulating no change 
    // unless a slight natural progression is simulated (e.g. 10% chance)
    if (previousStatus) {
      const chance = Math.random();
      if (chance < 0.15) {
        return this.evolveStatus(previousStatus);
      }
      return previousStatus;
    }

    // Seed data deterministically based on PNR number so same PNR initially returns same details
    const pnrHash = this.simpleHash(pnr);
    const trains = [
      { name: "Rajdhani Express", no: "12301", from: "NDLS", to: "HWH", class: "3A" },
      { name: "Shatabdi Express", no: "12002", from: "NDLS", to: "BPL", class: "CC" },
      { name: "Duronto Express", no: "12260", from: "HWH", to: "NDLS", class: "2A" },
      { name: "Garib Rath Express", no: "12909", from: "BDTS", to: "NZM", class: "3A" },
      { name: "Kalka Mail", no: "12311", from: "HWH", to: "KLK", class: "SL" }
    ];

    const train = trains[pnrHash % trains.length];
    
    // Set journey date to hash-based days in the future (2 to 15 days)
    const journeyDaysAhead = (pnrHash % 14) + 2;
    const date = new Date();
    date.setDate(date.getDate() + journeyDaysAhead);
    const dateString = date.toISOString().split('T')[0];

    // Determine number of passengers (1 or 2)
    const numPassengers = (pnrHash % 2) + 1;
    const passengers: PNRPassenger[] = [];
    
    // Initial status is usually WL (Waiting List) or RAC to showcase monitor progression
    const initialWl = (pnrHash % 15) + 5; // e.g. WL 5 to WL 19

    for (let i = 1; i <= numPassengers; i++) {
      const wlDiff = i - 1;
      passengers.push({
        number: i,
        bookingStatus: `WL ${initialWl + wlDiff}`,
        currentStatus: `WL ${initialWl + wlDiff - 3}` // Current waiting list is slightly advanced
      });
    }

    return {
      pnr,
      trainNo: train.no,
      trainName: train.name,
      dateOfJourney: dateString,
      from: train.from,
      to: train.to,
      class: train.class,
      chartStatus: 'CHART NOT PREPARED',
      passengers
    };
  }

  // Advance the state of a PNR (WL -> RAC -> CNF)
  public evolveStatus(status: PNRStatus): PNRStatus {
    const updatedPassengers = status.passengers.map(passenger => {
      const current = passenger.currentStatus;
      
      // If already CNF, keep it confirmed
      if (current.includes('CNF') || current.includes(',') || current.startsWith('S') || current.startsWith('B') || current.startsWith('A')) {
        return { ...passenger };
      }

      if (current.startsWith('WL ')) {
        const wlNum = parseInt(current.replace('WL ', ''), 10);
        if (wlNum <= 2) {
          // If Waiting List is very low, confirm it or move to RAC
          const coachPrefix = status.class === 'SL' ? 'S1' : status.class === '3A' ? 'B1' : 'A1';
          const seatNum = Math.floor(Math.random() * 72) + 1;
          return {
            ...passenger,
            currentStatus: `CNF (${coachPrefix}, ${seatNum})`
          };
        } else {
          // Progress waiting list position down
          const newWl = Math.max(1, wlNum - Math.floor(Math.random() * 2) - 1);
          return {
            ...passenger,
            currentStatus: `WL ${newWl}`
          };
        }
      }

      if (current.startsWith('RAC ')) {
        // RAC advances directly to CNF
        const coachPrefix = status.class === 'SL' ? 'S2' : status.class === '3A' ? 'B2' : 'A2';
        const seatNum = Math.floor(Math.random() * 72) + 1;
        return {
          ...passenger,
          currentStatus: `CNF (${coachPrefix}, ${seatNum})`
        };
      }

      return { ...passenger };
    });

    // Check if all passengers are CNF, if so prepare chart
    const allCnf = updatedPassengers.every(p => p.currentStatus.includes('CNF'));
    const chartStatus = (allCnf && Math.random() < 0.5) ? 'CHART PREPARED' : status.chartStatus;

    return {
      ...status,
      chartStatus: chartStatus as any,
      passengers: updatedPassengers
    };
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
  }
}

// Integration adapter for live checking via RapidAPI
export class RapidApiPNRProvider implements PNRProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async fetchStatus(pnr: string): Promise<PNRStatus> {
    if (!this.apiKey) {
      throw new Error('RapidAPI Key is not configured.');
    }

    try {
      // Calling a popular RapidAPI Indian Railways PNR Status endpoint
      const response = await fetch(`https://irctc-indian-railway-pnr-status.p.rapidapi.com/pnr/${pnr}`, {
        method: 'GET',
        headers: {
          'x-rapidapi-key': this.apiKey,
          'x-rapidapi-host': 'irctc-indian-railway-pnr-status.p.rapidapi.com'
        }
      });

      if (!response.ok) {
        throw new Error(`API call failed with status: ${response.status}`);
      }

      const rawData = await response.json();
      
      if (!rawData.success || !rawData.data) {
        throw new Error(rawData.message || 'Failed to fetch valid PNR details from API');
      }

      const pnrData = rawData.data;

      // Map RapidAPI structure to standard application PNRStatus structure
      const passengers: PNRPassenger[] = (pnrData.passengers || []).map((p: any, idx: number) => ({
        number: idx + 1,
        bookingStatus: p.bookingStatus || 'Unknown',
        currentStatus: p.currentStatus || 'Unknown'
      }));

      return {
        pnr: pnrData.pnr || pnr,
        trainNo: pnrData.trainNo || 'Unknown',
        trainName: pnrData.trainName || 'Unknown',
        dateOfJourney: pnrData.dateOfJourney || 'Unknown',
        from: pnrData.fromStation || 'Unknown',
        to: pnrData.toStation || 'Unknown',
        class: pnrData.class || 'Unknown',
        chartStatus: pnrData.chartPrepared ? 'CHART PREPARED' : 'CHART NOT PREPARED',
        passengers
      };
    } catch (e: any) {
      console.error(`Error calling RapidAPI for PNR ${pnr}:`, e);
      throw new Error(`Failed to query Live PNR database: ${e.message}`);
    }
  }
}

// Factory to resolve the active PNR provider
export function getPNRProvider(): PNRProvider {
  const providerType = process.env.PNR_PROVIDER || 'mock';
  if (providerType === 'live' || providerType === 'rapidapi') {
    return new RapidApiPNRProvider(process.env.RAPIDAPI_KEY || '');
  }
  return new MockPNRProvider();
}
