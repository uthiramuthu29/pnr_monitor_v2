export interface WhatsAppResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface WhatsAppProvider {
  sendMessage(to: string, message: string): Promise<WhatsAppResult>;
}

// Mock WhatsApp Provider prints alerts to the terminal console log
export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendMessage(to: string, message: string): Promise<WhatsAppResult> {
    const divider = "=".repeat(50);
    console.log(`
${divider}
📱 [MOCK WHATSAPP MESSAGE SENT]
To: ${to}
Message:
${message}
${divider}
`);
    return {
      success: true,
      messageId: `mock_msg_${Math.random().toString(36).substring(2, 10)}`
    };
  }
}

// Twilio WhatsApp Provider implements real SMS/WhatsApp integrations using native fetch API
export class TwilioWhatsAppProvider implements WhatsAppProvider {
  private accountSid: string;
  private authToken: string;
  private sender: string;

  constructor(accountSid: string, authToken: string, sender: string) {
    this.accountSid = accountSid;
    this.authToken = authToken;
    // Ensure sender has the whatsapp: prefix
    this.sender = sender.startsWith('whatsapp:') ? sender : `whatsapp:${sender}`;
  }

  async sendMessage(to: string, message: string): Promise<WhatsAppResult> {
    if (!this.accountSid || !this.authToken || !this.sender) {
      return {
        success: false,
        error: "Twilio credentials or sender number are missing."
      };
    }

    // Ensure recipient has the whatsapp: prefix and starts with +
    const formattedTo = to.startsWith('whatsapp:') 
      ? to 
      : `whatsapp:${to.startsWith('+') ? to : '+' + to}`;

    try {
      const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
      const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
      
      const params = new URLSearchParams();
      params.append('From', this.sender);
      params.append('To', formattedTo);
      params.append('Body', message);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || `Twilio HTTP error ${response.status}`);
      }

      return {
        success: true,
        messageId: data.sid
      };
    } catch (e: any) {
      console.error(`Twilio WhatsApp dispatch failed to ${to}:`, e);
      return {
        success: false,
        error: e.message || 'Unknown Twilio API dispatch error'
      };
    }
  }
}

// Factory to resolve the active WhatsApp provider
export function getWhatsAppProvider(): WhatsAppProvider {
  const providerType = process.env.WHATSAPP_PROVIDER || 'mock';
  if (providerType === 'live' || providerType === 'twilio') {
    return new TwilioWhatsAppProvider(
      process.env.TWILIO_ACCOUNT_SID || '',
      process.env.TWILIO_AUTH_TOKEN || '',
      process.env.TWILIO_SENDER_NUMBER || ''
    );
  }
  return new MockWhatsAppProvider();
}
