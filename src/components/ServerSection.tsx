import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Server, ChevronDown, ChevronRight, MapPin, MoreVertical, Edit } from 'lucide-react';
import { ClientCard } from './ClientCard';
import { AddClientModal } from './AddClientModal';
import { ConfirmationModal } from './ConfirmationModal';
import {
  createClient,
  deleteClient,
  subscribeToClients,
  subscribeToServerInfo,
  subscribeToMode,
  subscribeToActiveStatus,
  setServerLocationCommand,
  resetServer
} from '../firebase';

interface ServerSectionProps {
  serverId: string;
  serverName: string;
  onRemove: () => void;
}

export const ServerSection: React.FC<ServerSectionProps> = ({
  serverId,
  serverName,
  onRemove
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddClientModalOpen, setIsAddClientModalOpen] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showEditLocationModal, setShowEditLocationModal] = useState(false);
  const [editLat, setEditLat] = useState('');
  const [editLong, setEditLong] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    clientName: string;
    clientId: string;
  }>({
    isOpen: false,
    clientName: '',
    clientId: ''
  });

  // Firebase READ states
  const [serverInfo, setServerInfo] = useState<any>({});
  const [mode, setMode] = useState<any>({});
  const [activeStatus, setActiveStatus] = useState<any>({});
  const [clients, setClients] = useState<string[]>([]);
  const [serverLocationFeedback, setServerLocationFeedback] = useState<string>('');

  // UI derived states
  const isServerBusy = mode.type !== 'idle';
  const serverLocation = serverInfo.server_location_name && serverInfo.server_location_name !== 'Not set' 
    ? serverInfo.server_location_name 
    : 'Location not set';
  const hasLocation = serverInfo.server_lat && serverInfo.server_long && 
    serverInfo.server_lat !== 0 && serverInfo.server_long !== 0;

  // Subscribe to server info
  useEffect(() => {
    const unsubscribe = subscribeToServerInfo(serverId, (info) => {
      setServerInfo(info);
    });
    return unsubscribe;
  }, [serverId]);

  // Show feedback and reset disables when server location is updated by backend
  useEffect(() => {
    if (serverInfo.location_updated === true) {
      setServerLocationFeedback(`Server location updated: ${serverInfo.server_location_name}`);
      const timer = setTimeout(async () => {
        setServerLocationFeedback('');
        // Reset disables and all relevant Firebase keys except server_info lat/long/name
        try {
          const { getDatabase, ref, update } = await import('firebase/database');
          const db = getDatabase();
          // Reset mode
          const modeRef = ref(db, `servers/${serverId}/mode`);
          await update(modeRef, { type: 'idle', target_client_id: '', duration_sec: 0, schedule_key: '', updated_at: new Date().toISOString() });
          // Optimistically update local mode state for instant UI
          setMode({ type: 'idle', target_client_id: '', duration_sec: 0, schedule_key: '', updated_at: new Date().toISOString() });
          // Reset active_status
          const statusRef = ref(db, `servers/${serverId}/active_status`);
          await update(statusRef, { status: 'idle', progress: 0, total_files: 0, received_files: 0, total_size_bytes: 0, transferred_bytes: 0 });
          // Reset location_updated to false
          const serverInfoRef = ref(db, `servers/${serverId}/server_info`);
          await update(serverInfoRef, { location_updated: false });
        } catch (error) {
          console.error('Failed to reset after server location update:', error);
        }
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [serverInfo.location_updated, serverId, serverInfo.server_location_name]);

  // Subscribe to mode
  useEffect(() => {
    const unsubscribe = subscribeToMode(serverId, (modeData) => {
      setMode(modeData);
    });
    return unsubscribe;
  }, [serverId]);

  // Subscribe to active status
  useEffect(() => {
    const unsubscribe = subscribeToActiveStatus(serverId, (status) => {
      setActiveStatus(status);
    });
    return unsubscribe;
  }, [serverId]);

  // Subscribe to clients
  useEffect(() => {
    const unsubscribe = subscribeToClients(serverId, (clientsData) => {
      const clientIds = Object.keys(clientsData || {});
      setClients(clientIds);
    });
    return unsubscribe;
  }, [serverId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showServerMenu) {
        setShowServerMenu(false);
      }
    };

    if (showServerMenu) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showServerMenu]);

  // Button handlers
  const handleServerLocation = async () => {
    try {
      // Optimistic UI update - immediately update mode state
      const now = new Date().toISOString();
      setMode({ type: 'server_location', target_client_id: '', duration_sec: 0, schedule_key: '', updated_at: now });
      
      await setServerLocationCommand(serverId);
    } catch (error) {
      console.error('Failed to send server location command:', error);
      // Revert to idle on error
      setMode({ type: 'idle', target_client_id: '', duration_sec: 0, schedule_key: '', updated_at: new Date().toISOString() });
    }
  };

  const handleResetServer = async () => {
    if (window.confirm(`Are you sure you want to reset ${serverName}? This will reset all keys under this server.`)) {
      try {
        // IMMEDIATELY update UI state for instant response
        setMode({ type: 'idle', target_client_id: '', duration_sec: 0, schedule_key: '', updated_at: new Date().toISOString() });
        setShowServerMenu(false);
        
        // Then update Firebase (listener will sync state if needed)
        await resetServer(serverId);
        console.log('Server reset successfully');
      } catch (error) {
        console.error('Failed to reset server:', error);
      }
    }
  };

  const handleEditLocationClick = () => {
    setEditLat(serverInfo.server_lat?.toString() || '0');
    setEditLong(serverInfo.server_long?.toString() || '0');
    setEditLocationName(serverInfo.server_location_name || 'Not set');
    setShowEditLocationModal(true);
  };

  const handleSaveLocation = async () => {
    try {
      const lat = parseFloat(editLat);
      const long = parseFloat(editLong);
      
      if (isNaN(lat) || isNaN(long)) {
        alert('Please enter valid latitude and longitude');
        return;
      }
      
      const { getDatabase, ref, update } = await import('firebase/database');
      const db = getDatabase();
      const serverInfoRef = ref(db, `servers/${serverId}/server_info`);
      
      await update(serverInfoRef, {
        server_lat: lat,
        server_long: long,
        server_location_name: editLocationName || 'Not set',
        location_updated: true
      });
      
      setShowEditLocationModal(false);
      console.log('Location updated successfully');
    } catch (error) {
      console.error('Failed to update location:', error);
      alert('Failed to update location');
    }
  };

  const handleAddClient = async (clientNumber: number, location?: { lat: number; long: number; name: string }) => {
    const clientId = `client${clientNumber}`;
    const clientName = `Client ${clientNumber}`;
    
    try {
      await createClient(serverId, clientId);
      
      // If location is provided, set it
      if (location) {
        const { getDatabase, ref, update } = await import('firebase/database');
        const db = getDatabase();
        const clientInfoRef = ref(db, `servers/${serverId}/clients/${clientId}/client_info`);
        
        await update(clientInfoRef, {
          lat: location.lat,
          long: location.long,
          location_name: location.name
        });
      }
      
      console.log('Client added successfully');
    } catch (error) {
      console.error('Error adding client:', error);
    }
    
    setIsAddClientModalOpen(false);
  };

  const handleRemoveClient = (clientId: string) => {
    const clientName = clientId.replace(/^\w/, c => c.toUpperCase()).replace(/(\d+)/, ' $1');
    
    setConfirmationModal({
      isOpen: true,
      clientName: clientName,
      clientId: clientId
    });
  };

  const confirmRemoveClient = () => {
    deleteClient(serverId, confirmationModal.clientId)
      .then(() => {
        console.log('Client removed successfully');
      })
      .catch(error => console.error('Error removing client:', error));
    
    setConfirmationModal({ isOpen: false, clientName: '', clientId: '' });
  };

  // Don't show progress bar for instant flow (shown in client card instead)
  const showProgress = false;

  return (
    <>
      <div className={`bg-white rounded-xl border overflow-hidden shadow-sm transition-all duration-300 ${
        isServerBusy ? 'border-amber-500 ring-2 ring-amber-200' : 'border-gray-200'
      }`}>
        {/* Server Header */}
        <div
          className="bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 px-4 py-4 text-white cursor-pointer hover:from-slate-800 hover:via-slate-700 hover:to-slate-800 transition-all"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
                <div className="p-1.5 bg-slate-500/30 rounded-lg">
                  <Server className="w-5 h-5" />
                </div>
              </div>
              <div>
                <h2 className="font-bold text-base">{serverName}</h2>
                <div className="flex items-center gap-2 text-slate-200 text-xs">
                  {hasLocation ? (
                    <a
                      href={`https://www.google.com/maps?q=${serverInfo.server_lat},${serverInfo.server_long}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-white"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {serverLocation}
                    </a>
                  ) : (
                    <span>{serverLocation}</span>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditLocationClick();
                    }}
                    className="ml-1 p-0.5 hover:bg-slate-500/30 rounded transition-colors"
                    title="Edit location"
                  >
                    <Edit className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Server Location Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleServerLocation();
                }}
                disabled={isServerBusy}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  isServerBusy
                    ? 'bg-slate-500/30 text-slate-300 cursor-not-allowed'
                    : 'bg-teal-500/20 text-teal-100 hover:bg-teal-500/30 border border-teal-400/30'
                }`}
              >
                <MapPin className="w-4 h-4" />
                Server Location
              </button>

              {(isServerBusy || serverLocationFeedback || clients.some(cid => {
                try {
                  return localStorage.getItem(`recordingClient:${serverId}`) === cid;
                } catch { return false; }
              })) && (
                <span className="px-3 py-1.5 bg-amber-500/30 text-amber-100 rounded-lg text-xs font-medium border border-amber-400/30">
                  {serverLocationFeedback
                    ? 'Location updated'
                    : mode.type === 'server_location' && 'Getting Location...'}
                  {mode.type === 'client_location' && `Location: ${mode.target_client_id || ''}`}
                  {mode.type === 'connect' && `Connecting: ${mode.target_client_id || ''}`}
                  {mode.type === 'instant' && `Instant: ${mode.target_client_id || ''}`}
                  {mode.type === 'schedule' && `Schedule: ${mode.target_client_id || ''}`}
                  {(() => {
                    // Show Schedule_Rec: clientid if any client is recording
                    for (const cid of clients) {
                      try {
                        if (localStorage.getItem(`recordingClient:${serverId}`) === cid) {
                          return `Schedule_Rec: ${cid}`;
                        }
                      } catch {}
                    }
                    return '';
                  })()}
                  {mode.type === 'transmit_scheduled' && `Schedule_TX: ${mode.target_client_id || ''}`}
                </span>
              )}

              {/* Three-dot Menu Button */}
              <div className="relative">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowServerMenu(!showServerMenu);
                  }}
                  className="w-8 h-8 rounded-md border border-slate-400/30 flex items-center justify-center transition-colors hover:bg-slate-500/30 text-slate-200 hover:text-white"
                  title="Server options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>

                {/* Dropdown Menu */}
                {showServerMenu && (
                  <div 
                    className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[150px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetServer();
                      }}
                      className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Reset Server
                    </button>
                  </div>
                )}
              </div>

              {/* Delete Button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                disabled={isServerBusy}
                className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                  isServerBusy
                    ? 'border-slate-400/30 text-slate-400 cursor-not-allowed'
                    : 'border-slate-400/30 text-slate-200 hover:bg-slate-500/30 hover:text-red-300'
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        {showProgress && (
          <div className="px-4 py-2 bg-slate-50 border-b border-gray-200">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">
                {activeStatus.status === 'recording' && 'Recording...'}
                {activeStatus.status === 'transmitting' && 'Transmitting...'}
                {activeStatus.status === 'uploading' && 'Uploading to Cloud...'}
                {activeStatus.status === 'completed' && 'Completed!'}
              </span>
              <span className="text-gray-600">
                {activeStatus.progress}% | {activeStatus.received_files}/{activeStatus.total_files} files
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${activeStatus.progress}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Clients Section */}
        {isExpanded && (
          <div className="p-5 bg-slate-50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-800 text-sm">
                Connected Clients ({clients.length})
              </h3>
              <button
                onClick={() => setIsAddClientModalOpen(true)}
                disabled={isServerBusy}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isServerBusy
                    ? 'bg-gray-300 cursor-not-allowed'
                    : 'bg-emerald-600 text-white hover:bg-emerald-700'
                }`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="grid gap-3">
              {clients.map((clientId) => {
                const clientName = clientId.replace(/^\w/, c => c.toUpperCase()).replace(/(\d+)/, ' $1');
                return (
                  <ClientCard
                    key={clientId}
                    serverId={serverId}
                    serverName={serverName}
                    clientId={clientId}
                    clientName={clientName}
                    isServerBusy={isServerBusy}
                    currentTargetClient={mode.target_client_id || ''}
                    onOptimisticModeChange={(nextMode) => {
                      // Optimistically reflect mode change so UI disables immediately
                      setMode({
                        type: nextMode.type,
                        target_client_id: nextMode.target_client_id,
                        duration_sec: nextMode.duration_sec ?? 0,
                        schedule_key: nextMode.schedule_key ?? '',
                        updated_at: nextMode.updated_at
                      });
                    }}
                    onRemove={() => handleRemoveClient(clientId)}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>

      <AddClientModal
        isOpen={isAddClientModalOpen}
        onClose={() => setIsAddClientModalOpen(false)}
        onAdd={handleAddClient}
        existingClients={clients.map(id => id.replace(/^\w/, c => c.toUpperCase()).replace(/(\d+)/, ' $1'))}
        serverName={serverName}
      />

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal({ isOpen: false, clientName: '', clientId: '' })}
        onConfirm={confirmRemoveClient}
        title="Delete Client?"
        message="Are you sure you want to delete this client?"
        itemName={confirmationModal.clientName}
        type="client"
      />

      {/* Edit Location Modal */}
      {showEditLocationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Edit Server Location</h3>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Location Name</span>
              <input
                type="text"
                value={editLocationName}
                onChange={(e) => setEditLocationName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., Main Office"
              />
            </label>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Latitude</span>
              <input
                type="number"
                step="any"
                value={editLat}
                onChange={(e) => setEditLat(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., 49.2827"
              />
            </label>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Longitude</span>
              <input
                type="number"
                step="any"
                value={editLong}
                onChange={(e) => setEditLong(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., -123.1207"
              />
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleSaveLocation}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Save
              </button>
              <button
                onClick={() => setShowEditLocationModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
