"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, 
  Trash2, 
  RefreshCw, 
  Play, 
  Pause, 
  Clock, 
  Smartphone, 
  CheckCircle2, 
  AlertTriangle, 
  TrendingUp, 
  Info, 
  Database,
  ExternalLink,
  ChevronRight
} from 'lucide-react';

interface Passenger {
  number: number;
  bookingStatus: string;
  currentStatus: string;
}

interface PNRStatusData {
  pnr: string;
  trainNo: string;
  trainName: string;
  dateOfJourney: string;
  from: string;
  to: string;
  class: string;
  chartStatus: 'CHART PREPARED' | 'CHART NOT PREPARED';
  passengers: Passenger[];
}

interface MonitorData {
  _id: string;
  pnr: string;
  frequencyHours: number;
  active: boolean;
  whatsappNumbers: string[];
  lastCheckedAt?: string;
  lastStatus?: string; // stringified JSON
  createdAt: string;
  updatedAt: string;
}

interface LogData {
  _id: string;
  monitorId: string;
  pnr: string;
  phoneNumber: string;
  message: string;
  status: 'MOCK_SENT' | 'DELIVERED' | 'FAILED';
  errorMessage?: string;
  sentAt: string;
}

export default function Home() {
  // Form state
  const [pnrInput, setPnrInput] = useState('');
  const [frequency, setFrequency] = useState(2);
  const [phoneInput, setPhoneInput] = useState('');
  const [whatsappList, setWhatsappList] = useState<string[]>([]);
  
  // App data state
  const [monitors, setMonitors] = useState<MonitorData[]>([]);
  const [logs, setLogs] = useState<LogData[]>([]);
  
  // Loading & UX state
  const [submitLoading, setSubmitLoading] = useState(false);
  const [checkingIds, setCheckingIds] = useState<string[]>([]);
  const [simulatingIds, setSimulatingIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'inactive'>('all');

  // Fetch PNR Monitors from API
  const fetchMonitors = useCallback(async () => {
    try {
      const res = await fetch('/api/monitors');
      const json = await res.json();
      if (json.success) {
        setMonitors(json.data);
      }
    } catch (err) {
      console.error('Failed to load monitors:', err);
    }
  }, []);

  // Fetch Notification Logs from API
  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/logs');
      const json = await res.json();
      if (json.success) {
        setLogs(json.data);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    }
  }, []);

  // Load initial data and poll logs for updates in Mock mode
  useEffect(() => {
    fetchMonitors();
    fetchLogs();

    // Poll logs every 5 seconds to show new notifications arriving in real-time
    const logsInterval = setInterval(fetchLogs, 5000);
    // Poll monitors every 15 seconds to reflect background engine checking updates
    const monitorsInterval = setInterval(fetchMonitors, 15000);

    return () => {
      clearInterval(logsInterval);
      clearInterval(monitorsInterval);
    };
  }, [fetchMonitors, fetchLogs]);

  // Handle adding WhatsApp numbers as tags
  const handleAddPhone = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    
    // Simple verification
    let cleaned = phoneInput.trim().replace(/\s+/g, '');
    if (!cleaned) return;
    
    // Add default country code if missing
    if (!cleaned.startsWith('+')) {
      if (/^\d{10}$/.test(cleaned)) {
        cleaned = '+91' + cleaned; // Default to India (+91) if it's 10 digits
      } else {
        cleaned = '+' + cleaned;
      }
    }

    if (!/^\+?[1-9]\d{1,14}$/.test(cleaned)) {
      setFormError('Invalid international phone number format (e.g. +919876543210)');
      return;
    }

    if (whatsappList.includes(cleaned)) {
      setFormError('Phone number already added.');
      return;
    }

    setWhatsappList([...whatsappList, cleaned]);
    setPhoneInput('');
  };

  // Remove phone tag
  const handleRemovePhone = (indexToRemove: number) => {
    setWhatsappList(whatsappList.filter((_, idx) => idx !== indexToRemove));
  };

  // Handle Form Submit (Register Monitor)
  const handleRegisterMonitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    // Form validations
    if (!pnrInput || !/^\d{10}$/.test(pnrInput.trim())) {
      setFormError('PNR must be exactly 10 digits.');
      return;
    }

    if (whatsappList.length === 0) {
      setFormError('Please add at least one WhatsApp number to receive updates.');
      return;
    }

    setSubmitLoading(true);

    try {
      const response = await fetch('/api/monitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pnr: pnrInput.trim(),
          frequencyHours: Number(frequency),
          whatsappNumbers: whatsappList
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Server rejected request');
      }

      setFormSuccess('PNR Monitor created! Initial status retrieved and WhatsApp message sent.');
      setPnrInput('');
      setWhatsappList([]);
      fetchMonitors();
      fetchLogs();
    } catch (err: any) {
      console.error(err);
      setFormError(err.message || 'Failed to register monitor.');
    } finally {
      setSubmitLoading(false);
    }
  };

  // Toggle monitor active/inactive state
  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const response = await fetch(`/api/monitors/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
      });
      const data = await response.json();
      if (data.success) {
        fetchMonitors();
      }
    } catch (err) {
      console.error('Failed to toggle monitor state:', err);
    }
  };

  // Trigger manual PNR evaluation check
  const handleCheckNow = async (id: string) => {
    setCheckingIds(prev => [...prev, id]);
    try {
      const response = await fetch(`/api/monitors/${id}/check`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        fetchMonitors();
        fetchLogs();
      } else {
        alert(`Failed to check PNR status: ${data.error}`);
      }
    } catch (err) {
      console.error('Check now request failed:', err);
    } finally {
      setCheckingIds(prev => prev.filter(item => item !== id));
    }
  };

  // Simulate seat allocation updates (Waiting List progresses)
  const handleSimulateUpdate = async (id: string) => {
    setSimulatingIds(prev => [...prev, id]);
    try {
      const response = await fetch(`/api/monitors/${id}/simulate`, {
        method: 'POST'
      });
      const data = await response.json();
      if (data.success) {
        fetchMonitors();
        fetchLogs();
      } else {
        alert(data.error || 'Simulation failed. Note: Simulation is only supported in PNR Mock Mode.');
      }
    } catch (err: any) {
      console.error('Simulation request failed:', err);
    } finally {
      setSimulatingIds(prev => prev.filter(item => item !== id));
    }
  };

  // Delete monitor
  const handleDeleteMonitor = async (id: string) => {
    if (!confirm('Are you sure you want to stop tracking and delete this PNR monitor?')) return;
    try {
      const response = await fetch(`/api/monitors/${id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        fetchMonitors();
        fetchLogs();
      }
    } catch (err) {
      console.error('Delete request failed:', err);
    }
  };

  // Filter monitors list based on tab
  const filteredMonitors = monitors.filter(monitor => {
    if (activeTab === 'active') return monitor.active;
    if (activeTab === 'inactive') return !monitor.active;
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col font-sans bg-zinc-950 text-zinc-100 selection:bg-indigo-500 selection:text-white pb-12">
      {/* Background radial effects */}
      <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] bg-rose-500/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row justify-between items-center border-b border-zinc-900/60 backdrop-blur-md sticky top-0 z-40 bg-zinc-950/80">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-600/30">
            <span className="text-xl font-bold text-white">🚂</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-violet-300 to-rose-400 bg-clip-text text-transparent">
              PNR Watchdog
            </h1>
            <p className="text-xs text-zinc-400 font-medium">Automatic WhatsApp Rail Status Monitor</p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="mt-4 sm:mt-0 flex items-center gap-2 bg-zinc-900/80 border border-zinc-800/80 px-4 py-2 rounded-full shadow-inner">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse pulse-indicator" />
          <span className="text-xs font-semibold text-zinc-300">Local Scheduler Hook: Active</span>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column - Setup Form (span 4) */}
        <section className="lg:col-span-4 flex flex-col gap-6">
          <div className="glass-panel glow-indigo rounded-2xl p-6 relative overflow-hidden">
            <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2 mb-4">
              <Plus className="h-5 w-5 text-indigo-400" />
              Monitor New PNR
            </h2>
            
            <form onSubmit={handleRegisterMonitor} className="flex flex-col gap-5">
              
              {/* PNR Number Field */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">
                  10-Digit PNR Number
                </label>
                <input 
                  type="text"
                  maxLength={10}
                  placeholder="e.g. 4301294875"
                  value={pnrInput}
                  onChange={(e) => setPnrInput(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  required
                />
              </div>

              {/* Alert Frequency Slider */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">
                    Check Frequency
                  </label>
                  <span className="text-xs font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">
                    Every {frequency} {frequency === 1 ? 'Hour' : 'Hours'}
                  </span>
                </div>
                <input 
                  type="range"
                  min={1}
                  max={24}
                  value={frequency}
                  onChange={(e) => setFrequency(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-zinc-500 font-semibold px-0.5">
                  <span>1 Hour</span>
                  <span>12 Hours</span>
                  <span>24 Hours</span>
                </div>
              </div>

              {/* Add Recipient Numbers */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400 tracking-wider uppercase">
                  WhatsApp Numbers
                </label>
                
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="e.g. +919876543210"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    className="flex-1 bg-zinc-900/90 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all font-mono"
                  />
                  <button 
                    onClick={handleAddPhone}
                    className="bg-zinc-850 hover:bg-zinc-800 text-indigo-400 border border-zinc-800 hover:border-indigo-500/30 px-3.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center"
                  >
                    Add
                  </button>
                </div>
                
                {/* Number Tags List */}
                {whatsappList.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 mt-2 max-h-32 overflow-y-auto p-1 bg-zinc-950/40 border border-zinc-900 rounded-xl">
                    {whatsappList.map((num, idx) => (
                      <span 
                        key={idx} 
                        className="inline-flex items-center gap-1.5 bg-zinc-900 border border-zinc-850 pl-2.5 pr-1.5 py-1 rounded-lg text-xs font-medium text-zinc-300 font-mono"
                      >
                        {num}
                        <button 
                          type="button" 
                          onClick={() => handleRemovePhone(idx)}
                          className="h-4 w-4 rounded-md hover:bg-zinc-800 text-zinc-500 hover:text-rose-400 flex items-center justify-center text-[10px]"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-500 italic mt-1 pl-1">
                    No alert recipient numbers configured.
                  </p>
                )}
              </div>

              {/* Action Notifications */}
              {formError && (
                <div className="bg-rose-950/30 border border-rose-900/60 p-3 rounded-xl flex gap-2 items-start text-xs text-rose-300">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-rose-400" />
                  <p className="leading-relaxed">{formError}</p>
                </div>
              )}
              {formSuccess && (
                <div className="bg-emerald-950/30 border border-emerald-900/60 p-3 rounded-xl flex gap-2 items-start text-xs text-emerald-300">
                  <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400" />
                  <p className="leading-relaxed">{formSuccess}</p>
                </div>
              )}

              {/* Submit Button */}
              <button 
                type="submit"
                disabled={submitLoading}
                className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl py-3 text-sm font-bold shadow-lg shadow-indigo-900/20 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none flex justify-center items-center gap-2"
              >
                {submitLoading ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Querying Railways...
                  </>
                ) : (
                  'Start Monitoring PNR'
                )}
              </button>
            </form>
          </div>

          {/* Quick System Info Box */}
          <div className="glass-panel rounded-2xl p-5 border border-zinc-900/60 text-xs text-zinc-400">
            <h3 className="font-bold text-zinc-300 mb-2 flex items-center gap-1.5">
              <Info className="h-4 w-4 text-indigo-400" /> Mode Configuration
            </h3>
            <ul className="space-y-2 leading-relaxed">
              <li className="flex justify-between items-center border-b border-zinc-900 pb-1.5">
                <span>PNR Lookup Driver:</span>
                <span className="font-mono bg-zinc-900 text-indigo-300 px-2 py-0.5 rounded text-[10px]">
                  {process.env.PNR_PROVIDER === 'live' ? 'Live RapidAPI' : 'Simulated (Mock)'}
                </span>
              </li>
              <li className="flex justify-between items-center border-b border-zinc-900 pb-1.5">
                <span>WhatsApp Driver:</span>
                <span className="font-mono bg-zinc-900 text-indigo-300 px-2 py-0.5 rounded text-[10px]">
                  {process.env.WHATSAPP_PROVIDER === 'live' ? 'Live Twilio' : 'Console / Logs Feed'}
                </span>
              </li>
              <p className="text-[10px] text-zinc-500 pt-1 leading-normal">
                {process.env.PNR_PROVIDER !== 'live' && (
                  "💡 In Mock mode, you can test alerts immediately using the 'Simulate Status Update' action on any monitor card."
                )}
              </p>
            </ul>
          </div>
        </section>

        {/* Right Column - Active Monitors List (span 8) */}
        <section className="lg:col-span-8 flex flex-col gap-5">
          {/* Header & Tabs */}
          <div className="flex justify-between items-center border-b border-zinc-900 pb-3">
            <h2 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-indigo-400" />
              Active Trackers ({monitors.length})
            </h2>

            {/* Tab Filters */}
            <div className="flex bg-zinc-900/80 p-0.5 rounded-lg border border-zinc-800/80 text-xs font-semibold">
              <button 
                onClick={() => setActiveTab('all')}
                className={`px-3 py-1.5 rounded-md transition-all ${activeTab === 'all' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                All
              </button>
              <button 
                onClick={() => setActiveTab('active')}
                className={`px-3 py-1.5 rounded-md transition-all ${activeTab === 'active' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Active
              </button>
              <button 
                onClick={() => setActiveTab('inactive')}
                className={`px-3 py-1.5 rounded-md transition-all ${activeTab === 'inactive' ? 'bg-indigo-500 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Paused
              </button>
            </div>
          </div>

          {/* Monitors Cards Display */}
          {filteredMonitors.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {filteredMonitors.map((monitor) => {
                const isChecking = checkingIds.includes(monitor._id);
                const isSimulating = simulatingIds.includes(monitor._id);
                
                // Parse PNR status if loaded
                let pnrStatus: PNRStatusData | null = null;
                try {
                  if (monitor.lastStatus) {
                    pnrStatus = JSON.parse(monitor.lastStatus);
                  }
                } catch (err) {
                  console.error('Failed to parse status JSON', err);
                }

                return (
                  <div 
                    key={monitor._id} 
                    className={`glass-card rounded-2xl p-5 border relative ${!monitor.active ? 'opacity-60 border-zinc-850' : 'border-zinc-800'}`}
                  >
                    {/* Active/Inactive gradient bar */}
                    <div className={`absolute top-0 left-0 w-1.5 h-full rounded-l-2xl ${monitor.active ? 'bg-indigo-500 shadow-lg shadow-indigo-500/50' : 'bg-zinc-700'}`} />

                    {/* Card Top Title Row */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pl-3 pb-4 border-b border-zinc-900">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-lg font-bold tracking-wider font-mono text-zinc-100 select-all">
                            {monitor.pnr}
                          </span>
                          <span className="inline-flex items-center gap-1 bg-zinc-900 border border-zinc-800 text-[10px] font-bold text-zinc-400 px-2 py-0.5 rounded-full">
                            <Clock className="h-3 w-3 text-indigo-400" />
                            {monitor.frequencyHours}h interval
                          </span>
                        </div>
                        {pnrStatus && (
                          <p className="text-xs text-zinc-400 mt-1 font-semibold">
                            {pnrStatus.trainName} ({pnrStatus.trainNo}) • Class {pnrStatus.class}
                          </p>
                        )}
                      </div>

                      {/* Top Action Pills */}
                      <div className="flex gap-2">
                        {/* Pause button */}
                        <button 
                          onClick={() => handleToggleActive(monitor._id, monitor.active)}
                          title={monitor.active ? 'Pause updates' : 'Resume updates'}
                          className={`p-2 rounded-xl border text-xs font-semibold flex items-center justify-center transition-all ${
                            monitor.active 
                              ? 'bg-zinc-900/50 hover:bg-zinc-850 text-amber-400 border-zinc-850 hover:border-amber-500/20' 
                              : 'bg-zinc-900 hover:bg-zinc-850 text-emerald-400 border-zinc-800 hover:border-emerald-500/20'
                          }`}
                        >
                          {monitor.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                        </button>

                        {/* Delete button */}
                        <button 
                          onClick={() => handleDeleteMonitor(monitor._id)}
                          title="Delete tracker"
                          className="p-2 rounded-xl bg-zinc-900/50 hover:bg-rose-950/30 text-zinc-500 hover:text-rose-400 border border-zinc-850 hover:border-rose-900/40 transition-all flex items-center justify-center"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Card Body - Passenger Status */}
                    <div className="pl-3 py-4 flex flex-col md:flex-row gap-6 justify-between">
                      {pnrStatus ? (
                        <div className="flex-1">
                          <div className="flex flex-wrap gap-x-6 gap-y-2 items-center mb-3">
                            <div className="text-[11px] font-bold text-zinc-500 tracking-wider uppercase">
                              Route:
                            </div>
                            <div className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                              {pnrStatus.from}
                              <ChevronRight className="h-3.5 w-3.5 text-zinc-600" />
                              {pnrStatus.to}
                            </div>
                            
                            <div className="text-[11px] font-bold text-zinc-500 tracking-wider uppercase ml-0 md:ml-4">
                              Journey:
                            </div>
                            <div className="text-xs font-bold text-zinc-300 font-mono">
                              {pnrStatus.dateOfJourney}
                            </div>
                          </div>

                          {/* Passenger Grid Table */}
                          <div className="bg-zinc-950/40 border border-zinc-900 rounded-xl overflow-hidden">
                            <div className="grid grid-cols-12 gap-2 px-4 py-2 border-b border-zinc-900 text-[10px] font-bold text-zinc-500 tracking-wider uppercase bg-zinc-950/70">
                              <span className="col-span-3">Pass No.</span>
                              <span className="col-span-4">Booking Status</span>
                              <span className="col-span-5">Current Status</span>
                            </div>
                            
                            <div className="divide-y divide-zinc-900">
                              {pnrStatus.passengers.map((passenger, index) => {
                                const isCnf = passenger.currentStatus.includes('CNF');
                                const isWl = passenger.currentStatus.startsWith('WL');
                                const isRac = passenger.currentStatus.startsWith('RAC');

                                return (
                                  <div key={index} className="grid grid-cols-12 gap-2 px-4 py-2 text-xs font-mono items-center">
                                    <span className="col-span-3 font-semibold text-zinc-400">#0{passenger.number}</span>
                                    <span className="col-span-4 text-zinc-500">{passenger.bookingStatus}</span>
                                    <span className={`col-span-5 font-bold flex items-center gap-1.5 ${
                                      isCnf ? 'text-emerald-400' : isWl ? 'text-amber-400' : isRac ? 'text-indigo-400' : 'text-zinc-300'
                                    }`}>
                                      <span className={`h-1.5 w-1.5 rounded-full ${
                                        isCnf ? 'bg-emerald-400' : isWl ? 'bg-amber-400 animate-pulse' : 'bg-indigo-400'
                                      }`} />
                                      {passenger.currentStatus}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col justify-center items-center py-6 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/20 text-center">
                          <AlertTriangle className="h-6 w-6 text-zinc-600 mb-1" />
                          <p className="text-xs font-semibold text-zinc-500">Status details pending verification</p>
                          <p className="text-[10px] text-zinc-600 mt-0.5">Click "Check Now" to fetch live train details</p>
                        </div>
                      )}

                      {/* Right Section in Card (Pill Badges & Actions) */}
                      <div className="w-full md:w-56 shrink-0 flex flex-col justify-between gap-4 border-t md:border-t-0 md:border-l border-zinc-900 pt-4 md:pt-0 md:pl-6">
                        {/* Chart Status */}
                        <div>
                          <div className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-1.5">Chart Status</div>
                          {pnrStatus ? (
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                              pnrStatus.chartStatus === 'CHART PREPARED' 
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                            }`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${
                                pnrStatus.chartStatus === 'CHART PREPARED' ? 'bg-emerald-400' : 'bg-amber-400'
                              }`} />
                              {pnrStatus.chartStatus}
                            </span>
                          ) : (
                            <span className="text-zinc-500 text-xs italic">Unknown</span>
                          )}
                        </div>

                        {/* WhatsApp Receivers Icons */}
                        <div>
                          <div className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase mb-1.5 flex items-center gap-1">
                            <Smartphone className="h-3 w-3 text-indigo-400" /> Recipients
                          </div>
                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
                            {monitor.whatsappNumbers.map((phone, idx) => (
                              <span 
                                key={idx} 
                                className="bg-zinc-950 border border-zinc-900 text-[10px] px-2 py-0.5 rounded text-zinc-400 font-mono"
                                title={phone}
                              >
                                {phone.length > 8 ? '...' + phone.slice(-8) : phone}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Card Bottom Panel - Checked Times & Action Buttons */}
                    <div className="pl-3 pt-4 border-t border-zinc-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="text-[10px] text-zinc-500 flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-zinc-600" />
                        <span>Last check: </span>
                        <span className="font-semibold text-zinc-400 font-mono">
                          {monitor.lastCheckedAt 
                            ? new Date(monitor.lastCheckedAt).toLocaleTimeString() 
                            : 'Never checked'}
                        </span>
                      </div>

                      {/* Interactive Buttons */}
                      <div className="flex gap-2 w-full sm:w-auto">
                        {/* Simulation trigger (Only show if provider is mock) */}
                        {(!process.env.PNR_PROVIDER || process.env.PNR_PROVIDER === 'mock') && monitor.active && (
                          <button
                            onClick={() => handleSimulateUpdate(monitor._id)}
                            disabled={isSimulating || isChecking}
                            className="flex-1 sm:flex-initial text-[11px] font-bold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/20 px-3 py-1.5 rounded-lg active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-1.5"
                          >
                            {isSimulating ? (
                              <>
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                Updating Seats...
                              </>
                            ) : (
                              <>
                                ⚡ Simulate Change
                              </>
                            )}
                          </button>
                        )}

                        {/* Check Now manual update */}
                        <button
                          onClick={() => handleCheckNow(monitor._id)}
                          disabled={isChecking || isSimulating || !monitor.active}
                          className="flex-1 sm:flex-initial text-[11px] font-bold bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 px-3 py-1.5 rounded-lg active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                        >
                          {isChecking ? (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              Polling...
                            </>
                          ) : (
                            <>
                              <RefreshCw className="h-3.5 w-3.5 text-zinc-400" />
                              Check Now
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Empty State Tracker */
            <div className="glass-panel border-zinc-900/60 rounded-2xl py-16 px-4 text-center flex flex-col items-center justify-center">
              <div className="h-12 w-12 rounded-2xl bg-zinc-900/80 border border-zinc-800 text-zinc-500 flex items-center justify-center mb-3">
                🚂
              </div>
              <h3 className="font-bold text-zinc-300 text-sm">No Active PNR Trackers</h3>
              <p className="text-zinc-500 text-xs mt-1 max-w-sm">
                Register a 10-digit Indian Railways PNR number in the form on the left to activate automated alert monitoring.
              </p>
            </div>
          )}
        </section>
      </main>

      {/* Bottom Section - Live Alert Feed & Setup Instructions */}
      <section className="w-full max-w-7xl mx-auto px-6 mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Grid: Live WhatsApp Feed Logs (span 7) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-zinc-900 pb-2">
            <h3 className="text-base font-bold text-zinc-200 flex items-center gap-2">
              <Smartphone className="h-4.5 w-4.5 text-indigo-400" />
              WhatsApp Message Logs (Mock Feed)
            </h3>
            <span className="text-[10px] text-zinc-500 bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded-full font-semibold">
              Auto-polls logs
            </span>
          </div>

          <div className="glass-panel rounded-2xl p-5 max-h-[380px] overflow-y-auto flex flex-col gap-4 shadow-inner">
            {logs.length > 0 ? (
              <div className="space-y-4">
                {logs.map((log) => (
                  <div key={log._id} className="flex flex-col border border-zinc-900 bg-zinc-950/30 rounded-xl p-3.5 text-xs">
                    {/* Log details bar */}
                    <div className="flex justify-between items-center border-b border-zinc-900 pb-2 mb-2 font-mono text-[10px] text-zinc-500">
                      <div>
                        To: <span className="text-indigo-400 font-bold">{log.phoneNumber}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span>{new Date(log.sentAt).toLocaleTimeString()}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          log.status === 'MOCK_SENT' ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' :
                          log.status === 'DELIVERED' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                          'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        }`}>
                          {log.status}
                        </span>
                      </div>
                    </div>
                    {/* Log text content */}
                    <div className="text-zinc-300 font-sans whitespace-pre-line leading-relaxed pl-1 bg-zinc-950/40 p-2.5 rounded-lg border border-zinc-900/60 font-mono text-[11px]">
                      {log.message}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 flex flex-col items-center justify-center border border-dashed border-zinc-800 rounded-xl bg-zinc-950/20 text-zinc-500 text-xs">
                <Smartphone className="h-6 w-6 text-zinc-700 mb-1" />
                <p className="font-semibold">Log is currently empty</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">Dispatched alerts and notifications will display here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Grid: Setup Guide (span 5) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          <div className="border-b border-zinc-900 pb-2">
            <h3 className="text-base font-bold text-zinc-200 flex items-center gap-2">
              <Database className="h-4.5 w-4.5 text-indigo-400" />
              Quick Hosting & Live Setup Guide
            </h3>
          </div>

          <div className="glass-panel rounded-2xl p-5 text-xs text-zinc-400 leading-relaxed flex flex-col gap-3">
            <p>
              This monitor is configured to be hosted easily on Vercel or any Node.js container service. Follow these steps to go live:
            </p>

            <div className="space-y-3 mt-1">
              <div className="flex gap-2.5 items-start">
                <span className="h-5 w-5 bg-zinc-900 border border-zinc-800 text-indigo-400 font-bold rounded-lg flex items-center justify-center text-[10px] shrink-0">1</span>
                <div>
                  <h4 className="font-bold text-zinc-300">Set Up MongoDB Atlas</h4>
                  <p className="text-[11px] text-zinc-500">Deploy a free tier MongoDB cluster on Atlas and copy the connection string as `MONGODB_URI` in `.env.local`.</p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <span className="h-5 w-5 bg-zinc-900 border border-zinc-800 text-indigo-400 font-bold rounded-lg flex items-center justify-center text-[10px] shrink-0">2</span>
                <div>
                  <h4 className="font-bold text-zinc-300">Integrate Twilio API</h4>
                  <p className="text-[11px] text-zinc-500">Provide your `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_SENDER_NUMBER`. Toggle `WHATSAPP_PROVIDER="live"`.</p>
                </div>
              </div>

              <div className="flex gap-2.5 items-start">
                <span className="h-5 w-5 bg-zinc-900 border border-zinc-800 text-indigo-400 font-bold rounded-lg flex items-center justify-center text-[10px] shrink-0">3</span>
                <div>
                  <h4 className="font-bold text-zinc-300">Configure Production Cron Jobs</h4>
                  <p className="text-[11px] text-zinc-500">On Vercel, use the `vercel.json` scheduler. Alternatively, set up a cron job pointing to `https://your-domain.com/api/cron?secret=YOUR_SECRET` calling it every hour.</p>
                </div>
              </div>
            </div>

            <div className="mt-2 pt-3 border-t border-zinc-900 flex justify-between items-center text-[11px]">
              <span className="text-zinc-500">API Documentation</span>
              <a 
                href="https://github.com/uthiramuthu29/pnr_monitor_v2" 
                target="_blank" 
                rel="noreferrer"
                className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                View Repository <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
