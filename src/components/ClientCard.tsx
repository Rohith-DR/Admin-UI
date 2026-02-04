import React, { useState, useEffect, useRef } from 'react';
import { MapPin, PlayCircle, Calendar, CheckCircle, Trash2, MoreVertical, Edit, Link, ChevronLeft, ChevronRight, Maximize2, Loader2, ChevronDown, RefreshCw } from 'lucide-react';
import { ref, update } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

import {
  subscribeToClientInfo,
  subscribeToScheduledRecords,
  subscribeToMode,
  subscribeToConnectionStatus,
  subscribeToActiveStatus,
  setClientLocationCommand,
  setConnectCommand,
  setInstantCommand,
  setScheduleCommand,
  setTransmitScheduledCommand,
  resetClient,
  database,
  subscribeToPredictions,
  migratePredictionsStructure
} from '../firebase';
import {
  loadFolderAudioWithPredictions,
  predictSingleAudio,
  FolderAudioEntry
} from '../services/folderPredictions';

interface ClientCardProps {
  serverId: string;
  serverName: string;
  clientId: string;
  clientName: string;
  isServerBusy: boolean;
  currentTargetClient: string;
  onRemove: () => void;
  onOptimisticModeChange?: (mode: { type: string; target_client_id: string; duration_sec?: number; schedule_key?: string; updated_at: string }) => void;
}

export const ClientCard: React.FC<ClientCardProps> = ({
  serverId,
  serverName,
  clientId,
  clientName,
  isServerBusy,
  currentTargetClient,
  onRemove,
  onOptimisticModeChange
}) => {
  const navigate = useNavigate();

  // Helper function to format bytes to KB or MB
  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const mb = bytes / 1024 / 1024;
    if (mb >= 1) {
      return `${mb.toFixed(1)} MB`;
    }
    const kb = bytes / 1024;
    return `${kb.toFixed(1)} KB`;
  };

  // UI State
  const [showInstantModal, setShowInstantModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showClientMenu, setShowClientMenu] = useState(false);
  const [showEditLocationModal, setShowEditLocationModal] = useState(false);
  const [editLat, setEditLat] = useState('');
  const [editLong, setEditLong] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [instantDuration, setInstantDuration] = useState('1'); // minutes
  const [scheduleDuration, setScheduleDuration] = useState('5'); // minutes
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  
  // Status card state
  const [statusCard, setStatusCard] = useState<{ show: boolean; message: string; type: 'loading' | 'success' | 'progress' }>({ 
    show: false, 
    message: '', 
    type: 'loading' 
  });

  // Firebase READ states
  const [clientInfo, setClientInfo] = useState<any>({});
  const [scheduledRecords, setScheduledRecords] = useState<any>({});
  const [mode, setMode] = useState<any>({});
  const [connectionStatus, setConnectionStatus] = useState<boolean>(false);
  const [activeStatus, setActiveStatus] = useState<any>({ status: 'idle', progress: 0, total_files: 0, received_files: 0, total_size_bytes: 0, transferred_bytes: 0 });

  // Data History states
  const [batHistory, setBatHistory] = useState<any[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [folderAudioFiles, setFolderAudioFiles] = useState<{[key: string]: FolderAudioEntry[]}>({});
  const [loadingFolderAudio, setLoadingFolderAudio] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [speciesPredictions, setSpeciesPredictions] = useState<{[key: string]: {species: string, confidence: number, date?: string, frequency?: string}}>({});
  const HISTORY_PAGE_SIZE = 5;
  
  // AbortController for cancelling ongoing predictions when component unmounts
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Scheduled Recordings pagination states
  const [scheduledPage, setScheduledPage] = useState(0);
  const SCHEDULED_PAGE_SIZE = 5;
  
  // Collapse states
  const [isScheduledCollapsed, setIsScheduledCollapsed] = useState(true);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);

  // Check if this client is currently recording (schedule_recording status)
  const isRecording = (() => {
    try {
      const recordingClient = localStorage.getItem(`recordingClient:${serverId}`) || '';
      return recordingClient === clientId;
    } catch {
      return false;
    }
  })();

  // Check if this client is the currently active one
  const isThisClientActive = currentTargetClient === clientId;
  // For recording status: disable ONLY the recording client, not all clients
  // For all other modes: disable ALL clients when server is busy
  const isDisabled = isRecording ? true : isServerBusy;

  // Subscribe to client info (display + used for location success)
  useEffect(() => {
    const unsubscribe = subscribeToClientInfo(serverId, clientId, (info) => {
      setClientInfo(info);
    });
    return () => {
      unsubscribe();
    };
  }, [serverId, clientId]);

  // Subscribe to mode
  useEffect(() => {
    const unsubscribe = subscribeToMode(serverId, setMode);
    return unsubscribe;
  }, [serverId]);

  // Subscribe to connection status
  useEffect(() => {
    const unsubscribe = subscribeToConnectionStatus(serverId, (status) => {
      setConnectionStatus(status);
    });
    return unsubscribe;
  }, [serverId]);

  // Subscribe to active status (for instant flow progress)
  useEffect(() => {
    const unsubscribe = subscribeToActiveStatus(serverId, (status) => {
      setActiveStatus(status || { status: 'idle', progress: 0, total_files: 0, received_files: 0, total_size_bytes: 0, transferred_bytes: 0 });
    });
    return unsubscribe;
  }, [serverId]);

  // Fetch BAT folders from Google Drive API
  useEffect(() => {
    if (!serverId || !clientId) return;
    
    const fetchFoldersFromDrive = async () => {
      try {
        setFoldersLoading(true);
        const serverNum = serverName.replace('Server ', '');
        const clientNum = clientName.replace('Client ', '');
        
        const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/folders/${serverNum}/${clientNum}`;
        console.log(`📂 [${clientId}] Fetching folders from: ${apiUrl}`);
        
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          console.error(`❌ [${clientId}] Failed to fetch folders: ${response.status}`);
          const errorText = await response.text();
          console.error(`❌ [${clientId}] Error response:`, errorText);
          setBatHistory([]);
          return;
        }
        
        const data = await response.json();
        console.log(`📦 [${clientId}] Received folders:`, data);
        
        if (data.success && data.folders) {
          // Keep full folder data for display
          const folders = data.folders.map((folder: any) => ({
            id: folder.id,
            name: folder.name,
            folderId: folder.folder_id,
            timestamp: folder.timestamp,
            date: folder.date,
            time: folder.time,
            fileCount: folder.file_count || 0,
            totalSize: folder.total_size_formatted || '0 B',
            modifiedDate: folder.modified_date
          }));
          
          console.log(`✅ [${clientId}] Setting ${folders.length} folders`);
          setBatHistory(folders);
        } else {
          console.warn(`⚠️ [${clientId}] No folders in response or success=false`);
          setBatHistory([]);
        }
      } catch (error) {
        console.error(`❌ [${clientId}] Error fetching folders:`, error);
      } finally {
        setFoldersLoading(false);
      }
    };
    
    fetchFoldersFromDrive();
  }, [serverId, clientId, serverName, clientName]);

  // Cancel ongoing predictions when component unmounts
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log(`🚫 [${clientId}] Component unmounting - cancelling all predictions`);
        abortControllerRef.current.abort();
      }
    };
  }, [clientId]);

  // Function to re-predict a single audio file (shared service)
  const repredictSingleFile = async (folderId: string, folderName: string, fileIndex: number, audioFile: FolderAudioEntry) => {
    try {
      const parts = folderName.toLowerCase().split('_');
      const timestamp = parts.slice(2).join('_');

      console.log(`🔄 [${clientId}] Re-predicting: ${audioFile.file_name}`);

      // Update UI to show processing
      setFolderAudioFiles(prev => {
        const updated = [...(prev[folderId] || [])];
        if (updated[fileIndex]) {
          updated[fileIndex] = {
            ...updated[fileIndex],
            predicted_species: 'Re-predicting...',
            processing: true
          };
        }
        return { ...prev, [folderId]: updated };
      });

      const serverNum = serverName.replace('Server ', '');
      const clientNum = clientName.replace('Client ', '');

      const updatedEntry = await predictSingleAudio({
        serverId,
        clientId,
        serverNum,
        clientNum,
        timestamp,
        audio: audioFile
      });

      // Update UI
      setFolderAudioFiles(prev => {
        const updated = [...(prev[folderId] || [])];
        updated[fileIndex] = updatedEntry;
        return { ...prev, [folderId]: updated };
      });
    } catch (error: any) {
      console.error(`❌ Error re-predicting:`, error);
      setFolderAudioFiles(prev => {
        const updated = [...(prev[folderId] || [])];
        if (updated[fileIndex]) {
          updated[fileIndex] = {
            ...updated[fileIndex],
            predicted_species: 'Error',
            processing: false,
            error: error.message
          } as FolderAudioEntry;
        }
        return { ...prev, [folderId]: updated };
      });
    }
  };

  // Function to load audio files for a folder and process predictions (shared service)
  const loadFolderAudioFiles = async (folderId: string, folderName: string, forceRepredict = false) => {
    // Check if already loaded in state (even with partial predictions)
    if (!forceRepredict && folderAudioFiles[folderId] && folderAudioFiles[folderId].length > 0) {
      // Check if there are any files currently being processed
      const isProcessing = folderAudioFiles[folderId].some(f => f.processing);
      
      // Check if there are files that still need prediction
      const needsPrediction = folderAudioFiles[folderId].some(f => f.needs_prediction && !f.processing);
      
      if (isProcessing) {
        console.log(`⏸️ [${clientId}] Folder ${folderName} is being processed, skipping reload`);
        return;
      }
      
      if (!needsPrediction) {
        console.log(`✅ [${clientId}] All files predicted for ${folderName}, using cache`);
        return;
      }
      
      console.log(`🔄 [${clientId}] Found ${folderAudioFiles[folderId].filter(f => f.needs_prediction).length} files still need prediction`);
    }

    try {
      console.log(`📂 [${clientId}] Loading folder: ${folderName} (forceRepredict: ${forceRepredict})`);
      
      const { timestamp, entries, serverNum, clientNum } = await loadFolderAudioWithPredictions({
        serverId,
        clientId,
        folderName
      });

      // Update state immediately with merged cache + waiting entries
      setFolderAudioFiles(prev => ({
        ...prev,
        [folderId]: entries
      }));

      const cachedCount = entries.filter(e => e.from_cache).length;
      const waitingCount = entries.filter(e => e.needs_prediction).length;
      console.log(`✅ [${clientId}] Loaded ${entries.length} files: ${cachedCount} cached, ${waitingCount} need prediction`);

      // Start SEQUENTIAL predictions for any entries that still need them
      const filesToPredict = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.needs_prediction);

      if (filesToPredict.length > 0) {
        console.log(`🔬 [${clientId}] Starting SEQUENTIAL predictions for ${filesToPredict.length} files`);

        // Create new AbortController for this prediction batch
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Process predictions ONE BY ONE (sequentially)
        (async () => {
          for (const { entry, index } of filesToPredict) {
            // Check if cancelled
            if (signal.aborted) {
              console.log(`🚫 [${clientId}] Predictions cancelled - stopping at ${entry.file_name}`);
              break;
            }
            
            try {
              console.log(`🔬 [${clientId}] Predicting ${index + 1}/${filesToPredict.length}: ${entry.file_name}`);
              
              // Mark as processing
              setFolderAudioFiles(prev => {
                const updated = [...(prev[folderId] || [])];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    processing: true,
                    predicted_species: 'Processing...'
                  };
                }
                return { ...prev, [folderId]: updated };
              });

              // Predict and save to Firebase (with abort signal)
              const updatedEntry = await predictSingleAudio({
                serverId,
                clientId,
                serverNum,
                clientNum,
                timestamp,
                audio: entry,
                signal // Pass signal for cancellation
              });

              // Update UI immediately after each prediction
              setFolderAudioFiles(prev => {
                const updated = [...(prev[folderId] || [])];
                if (updated[index]) {
                  updated[index] = updatedEntry;
                }
                return { ...prev, [folderId]: updated };
              });
              
              console.log(`✅ [${clientId}] Completed ${index + 1}/${filesToPredict.length}: ${entry.file_name}`);
            } catch (err) {
              // Skip abort errors (expected when cancelling)
              if (err instanceof Error && err.name === 'AbortError') {
                console.log(`🚫 [${clientId}] Prediction cancelled for ${entry.file_name}`);
                break;
              }
              
              console.error(`❌ [${clientId}] Prediction error for ${entry.file_name}:`, err);
              
              // Mark as error in UI
              setFolderAudioFiles(prev => {
                const updated = [...(prev[folderId] || [])];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    processing: false,
                    predicted_species: 'Error',
                    error: err instanceof Error ? err.message : 'Unknown error'
                  } as FolderAudioEntry;
                }
                return { ...prev, [folderId]: updated };
              });
            }
          }
          console.log(`🎉 [${clientId}] All predictions completed for ${folderName}`);
        })();
      }
    } catch (error) {
      console.error(`❌ [${clientId}] Error loading folder:`, error);
      setFolderAudioFiles(prev => ({
        ...prev,
        [folderId]: []
      }));
    }
  };

  // Toggle folder expansion
  const toggleFolderExpansion = async (folder: any) => {
    if (expandedFolderId === folder.id) {
      setExpandedFolderId(null);
    } else {
      setExpandedFolderId(folder.id);
      
      // Only load if not already loaded
      if (!folderAudioFiles[folder.id] || folderAudioFiles[folder.id].length === 0) {
        setLoadingFolderAudio(folder.id); // Show loading state
        try {
          await loadFolderAudioFiles(folder.id, folder.name);
        } finally {
          setLoadingFolderAudio(null); // Clear loading state
        }
      }
    }
  };

  // Subscribe to Firebase predictions and migrate structure
  useEffect(() => {
    const initPredictions = async () => {
      // Clear ALL localStorage caches
      const cacheKey = `species_predictions_${serverId}_${clientId}`;
      localStorage.removeItem(cacheKey);
    };

    // Subscribe to Firebase predictions
    const unsubscribe = subscribeToPredictions(serverId, clientId, (predictions) => {
      const speciesMap: {[key: string]: {species: string, confidence: number, date?: string, frequency?: string}} = {};
      Object.entries(predictions).forEach(([batId, pred]: [string, any]) => {
        speciesMap[batId] = { 
          species: pred.species, 
          confidence: pred.confidence || 0,
          date: pred.date,
          frequency: pred.frequency
        };
      });
      setSpeciesPredictions(speciesMap);
    });

    initPredictions();
    return unsubscribe;
  }, [serverId, clientId]);

  // Subscribe to active status (for instant flow progress)
  useEffect(() => {
    const unsubscribe = subscribeToActiveStatus(serverId, (status) => {
      setActiveStatus(status || { status: 'idle', progress: 0, total_files: 0, received_files: 0, total_size_bytes: 0, transferred_bytes: 0 });
    });
    return unsubscribe;
  }, [serverId]);

  // Monitor mode changes and sync status card state  
  useEffect(() => {
    console.log(`[${clientId}] Mode changed:`, mode.type, 'isActive:', isThisClientActive);
    
    if (mode.type === 'client_location' && mode.target_client_id === clientId) {
      console.log(`[${clientId}] Showing location status card`);
      setStatusCard({ show: true, message: 'Getting location...', type: 'loading' });
      try { localStorage.setItem(`locatingClient:${serverId}`, clientId); } catch {}
    } else if (mode.type === 'connect' && mode.target_client_id === clientId) {
      console.log(`[${clientId}] Showing connect status card`);
      setStatusCard({ show: true, message: 'Connecting...', type: 'loading' });
      try {
        localStorage.setItem(`connectingClient:${serverId}`, clientId);
      } catch {}
    } else if (mode.type === 'instant' && mode.target_client_id === clientId) {
      console.log(`[${clientId}] Showing instant progress status card`);
      setStatusCard({ show: true, message: 'Connecting...', type: 'progress' });
      try { localStorage.setItem(`instantClient:${serverId}`, clientId); } catch {}
    } else if (mode.type === 'schedule' && mode.target_client_id === clientId) {
      console.log(`[${clientId}] Showing schedule status card`);
      setStatusCard({ show: true, message: 'Scheduling', type: 'loading' });
      try { 
        localStorage.setItem(`schedulingClient:${serverId}`, clientId);
        localStorage.setItem(`schedulingKey:${serverId}:${clientId}`, mode.schedule_key || '');
        localStorage.setItem(`schedulingDuration:${serverId}:${clientId}`, String(mode.duration_sec || 0));
      } catch {}
    } else if (mode.type === 'transmit_scheduled' && mode.target_client_id === clientId) {
      console.log(`[${clientId}] Showing transmit scheduled progress status card`);
      setStatusCard({ show: true, message: 'Transmitting...', type: 'progress' });
      try {
        localStorage.setItem(`transmittingClient:${serverId}`, clientId);
        localStorage.setItem(`transmittingKey:${serverId}:${clientId}`, mode.schedule_key || '');
      } catch {}
    } else if (mode.type === 'idle') {
      console.log(`[${clientId}] Mode idle, closing status card`);
      // Check if we're in active success windows
      const instantInitiator = localStorage.getItem(`instantClient:${serverId}`) || '';
      const scheduleInitiator = localStorage.getItem(`schedulingClient:${serverId}`) || '';
      const connectInitiator = localStorage.getItem(`connectingClient:${serverId}`) || '';
      const locationInitiator = localStorage.getItem(`locatingClient:${serverId}`) || '';
      const recordingInitiator = localStorage.getItem(`recordingClient:${serverId}`) || '';
      const transmittingInitiator = localStorage.getItem(`transmittingClient:${serverId}`) || '';
      
      // Check if actually in success window (has successAt timestamp)
      const instantSuccessAt = localStorage.getItem(`instantSuccessAt:${serverId}:${clientId}`);
      const scheduleSuccessAt = localStorage.getItem(`scheduleSuccessAt:${serverId}:${clientId}`);
      const connectSuccessAt = localStorage.getItem(`connectSuccessAt:${serverId}:${clientId}`);
      const locationSuccessAt = localStorage.getItem(`locationSuccessAt:${serverId}:${clientId}`);
      const transmitReadyAt = localStorage.getItem(`transmitReadyAt:${serverId}:${clientId}`);
      const transmitSuccessAt = localStorage.getItem(`transmitSuccessAt:${serverId}:${clientId}`);
      
      const inInstantSuccess = instantInitiator === clientId && instantSuccessAt;
      const inScheduleSuccess = scheduleInitiator === clientId && scheduleSuccessAt;
      const inConnectSuccess = connectInitiator === clientId && connectSuccessAt;
      const inLocationSuccess = locationInitiator === clientId && locationSuccessAt;
      const inTransmitReadySuccess = recordingInitiator === clientId && transmitReadyAt;
      const inTransmitSuccess = transmittingInitiator === clientId && transmitSuccessAt;
      
      // Only keep status card open if we're in an active success window
      if (!inInstantSuccess && !inScheduleSuccess && !inConnectSuccess && !inLocationSuccess && !inTransmitReadySuccess && !inTransmitSuccess) {
        setStatusCard({ show: false, message: '', type: 'loading' });
        // Clean up any stale localStorage entries
        try {
          if (instantInitiator === clientId && !instantSuccessAt) localStorage.removeItem(`instantClient:${serverId}`);
          if (scheduleInitiator === clientId && !scheduleSuccessAt) localStorage.removeItem(`schedulingClient:${serverId}`);
          if (connectInitiator === clientId && !connectSuccessAt) localStorage.removeItem(`connectingClient:${serverId}`);
          if (locationInitiator === clientId && !locationSuccessAt) localStorage.removeItem(`locatingClient:${serverId}`);
          if (recordingInitiator === clientId && !transmitReadyAt) localStorage.removeItem(`recordingClient:${serverId}`);
          if (transmittingInitiator === clientId && !transmitSuccessAt) localStorage.removeItem(`transmittingClient:${serverId}`);
        } catch {}
      }
    }
  }, [mode.type, mode.target_client_id, mode.schedule_key, mode.duration_sec, clientId, serverId]);

  // Handle location success -> show success for 5s (persist across refresh), then reset
  const locationSuccessTimerRef = useRef<number | null>(null);
  useEffect(() => {
    // Only proceed if we're in a location flow for this client OR this client initiated the flow
    let locatingInitiator = '';
    try { locatingInitiator = localStorage.getItem(`locatingClient:${serverId}`) || ''; } catch {}
    const isInitiator = locatingInitiator === clientId;
    if (!((mode.type === 'client_location' && mode.target_client_id === clientId) || isInitiator)) return;

    const isFlagTrue = clientInfo?.location_updated === true;
    if (!isFlagTrue) return;

    // Scope to the initiating client
    let activeClientId = locatingInitiator || '';
    if (!activeClientId) activeClientId = mode.target_client_id || '';
    if (activeClientId !== clientId) return;

    // Show success card
    setStatusCard({ show: true, message: 'Location updated', type: 'success' });

    // Optional: record timestamp for refresh continuity
    try {
      localStorage.setItem(`locationPrevUpdatedAt:${serverId}:${clientId}`, clientInfo?.location_updated_at || new Date().toISOString());
    } catch {}

    // Compute remaining window for refresh persistence
    let remaining = 5000;
    try {
      const key = `locationSuccessAt:${serverId}:${clientId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    if (locationSuccessTimerRef.current) {
      window.clearTimeout(locationSuccessTimerRef.current);
      locationSuccessTimerRef.current = null;
    }
    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        // Reset mode to idle; do NOT touch client_info
        const modeRef = ref(database, `servers/${serverId}/mode`);
        await update(modeRef, { type: 'idle', target_client_id: '', updated_at: now });
        // Flip the location_updated flag back to false if present
        try {
          const infoRef = ref(database, `servers/${serverId}/clients/${clientId}/client_info`);
          await update(infoRef, { location_updated: false });
        } catch {}
        // Optimistic release disables
        if (typeof onOptimisticModeChange === 'function') {
          onOptimisticModeChange({ type: 'idle', target_client_id: '', updated_at: now });
        }
      } catch (error) {
        console.error('Failed to reset after location success:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        try {
          localStorage.removeItem(`locationSuccessAt:${serverId}:${clientId}`);
          localStorage.removeItem(`locatingClient:${serverId}`);
          localStorage.removeItem(`locationPrevUpdatedAt:${serverId}:${clientId}`);
          localStorage.removeItem(`locationBaseline:${serverId}:${clientId}`);
        } catch {}
      }
    }, remaining);
    locationSuccessTimerRef.current = id;

    return () => {
      if (locationSuccessTimerRef.current) {
        window.clearTimeout(locationSuccessTimerRef.current);
        locationSuccessTimerRef.current = null;
      }
    };
  }, [clientInfo?.lat, clientInfo?.long, clientInfo?.location_name, clientInfo?.location_updated_at, clientInfo?.location_updated, mode?.type, mode?.target_client_id, mode?.updated_at, clientId, serverId]);

  // Handle connection success -> show success for 5s (persist across refresh), then reset
  const successTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!connectionStatus) return;

    // Only show success for the initiating client
    let activeClientId = '';
    try {
      activeClientId = localStorage.getItem(`connectingClient:${serverId}`) || '';
    } catch {}
    if (!activeClientId && mode?.type === 'connect') {
      activeClientId = mode.target_client_id || '';
    }
    if (activeClientId !== clientId) return;

    setStatusCard({ show: true, message: 'Successfully connected', type: 'success' });

    let remaining = 5000;
    try {
      const key = `connectSuccessAt:${serverId}:${clientId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    // schedule reset (do not cancel on mode change)
    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        // Reset mode to idle and clear connection_status
        const modeRef = ref(database, `servers/${serverId}/mode`);
        await update(modeRef, {
          type: "idle",
          target_client_id: "",
          updated_at: now
        });
        const serverRef = ref(database, `servers/${serverId}`);
        await update(serverRef, { connection_status: false });
        // Optimistic notify parent to immediately release UI
        if (typeof onOptimisticModeChange === 'function') {
          onOptimisticModeChange({ type: 'idle', target_client_id: '', updated_at: now });
        }
      } catch (error) {
        console.error('Failed to reset after connect success:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        try {
          const key = `connectSuccessAt:${serverId}:${clientId}`;
          localStorage.removeItem(key);
          localStorage.removeItem(`connectingClient:${serverId}`);
        } catch {}
      }
    }, remaining);
    successTimerRef.current = id;

    return () => {
      if (successTimerRef.current) {
        window.clearTimeout(successTimerRef.current);
        successTimerRef.current = null;
      }
    };
  }, [connectionStatus, serverId, clientId]);

  // Handle instant recording completion -> show success for 5s, then reset
  const instantSuccessTimerRef = useRef<number | null>(null);
  useEffect(() => {
    // Only proceed if this client initiated the instant flow and status is completed
    let instantInitiator = '';
    try { instantInitiator = localStorage.getItem(`instantClient:${serverId}`) || ''; } catch {}
    const isInitiator = instantInitiator === clientId;
    if (!isInitiator) return;
    if (activeStatus.status !== 'completed') return;

    // Show success message
    setStatusCard({ show: true, message: 'Successfully recorded and uploaded to DB', type: 'success' });

    // Compute remaining window for refresh persistence
    let remaining = 5000;
    try {
      const key = `instantSuccessAt:${serverId}:${clientId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    if (instantSuccessTimerRef.current) {
      window.clearTimeout(instantSuccessTimerRef.current);
      instantSuccessTimerRef.current = null;
    }

    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        // Reset mode and active_status
        const modeRef = ref(database, `servers/${serverId}/mode`);
        await update(modeRef, { type: 'idle', target_client_id: '', duration_sec: 0, updated_at: now });
        const statusRef = ref(database, `servers/${serverId}/active_status`);
        await update(statusRef, { status: 'idle', progress: 0, total_files: 0, received_files: 0, total_size_bytes: 0, transferred_bytes: 0 });
        // Optimistic release disables
        if (typeof onOptimisticModeChange === 'function') {
          onOptimisticModeChange({ type: 'idle', target_client_id: '', updated_at: now });
        }
      } catch (error) {
        console.error('Failed to reset after instant success:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        try {
          localStorage.removeItem(`instantSuccessAt:${serverId}:${clientId}`);
          localStorage.removeItem(`instantClient:${serverId}`);
        } catch {}
      }
    }, remaining);
    instantSuccessTimerRef.current = id;

    return () => {
      if (instantSuccessTimerRef.current) {
        window.clearTimeout(instantSuccessTimerRef.current);
        instantSuccessTimerRef.current = null;
      }
    };
  }, [activeStatus.status, serverId, clientId]);

  // Handle schedule success -> show success for 5s (persist across refresh), then reset
  const scheduleSuccessTimerRef = useRef<number | null>(null);
  const scheduleSuccessHandledRef = useRef<string>('');
  useEffect(() => {
    // Check if this client initiated the schedule
    let scheduleInitiator = '';
    let scheduleKey = '';
    try {
      scheduleInitiator = localStorage.getItem(`schedulingClient:${serverId}`) || '';
      scheduleKey = localStorage.getItem(`schedulingKey:${serverId}:${clientId}`) || '';
    } catch {}
    
    if (scheduleInitiator !== clientId || !scheduleKey) return;

    // Watch the specific scheduled record's status
    const recordData = scheduledRecords[scheduleKey];
    if (!recordData || recordData.status !== 'scheduled') return;

    // Prevent duplicate timer creation for same schedule
    if (scheduleSuccessHandledRef.current === scheduleKey) return;
    scheduleSuccessHandledRef.current = scheduleKey;

    setStatusCard({ show: true, message: 'Successfully Scheduled', type: 'success' });

    let remaining = 5000;
    try {
      const key = `scheduleSuccessAt:${serverId}:${clientId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    // schedule reset (do not cancel on mode change)
    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        // Reset mode to idle (keep scheduled records intact)
        const modeRef = ref(database, `servers/${serverId}/mode`);
        await update(modeRef, { 
          type: 'idle', 
          target_client_id: '', 
          duration_sec: 0,
          schedule_key: '',
          updated_at: now 
        });
        // Optimistic release disables
        if (typeof onOptimisticModeChange === 'function') {
          onOptimisticModeChange({ type: 'idle', target_client_id: '', updated_at: now });
        }
      } catch (err) {
        console.error('Failed to reset after schedule success:', err);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        scheduleSuccessHandledRef.current = '';
        try {
          localStorage.removeItem(`scheduleSuccessAt:${serverId}:${clientId}`);
          localStorage.removeItem(`schedulingClient:${serverId}`);
          localStorage.removeItem(`schedulingKey:${serverId}:${clientId}`);
          localStorage.removeItem(`schedulingDuration:${serverId}:${clientId}`);
        } catch {}
      }
    }, remaining);
    scheduleSuccessTimerRef.current = id;
  }, [scheduledRecords, serverId, clientId]);

  // Monitor scheduled records for "recording" status -> activate client, show status card
  const recordingHandledRef = useRef<string>('');
  useEffect(() => {
    // Find any scheduled record with status="recording"
    let recordingScheduleKey = '';
    let recordingRecord: any = null;
    
    Object.entries(scheduledRecords).forEach(([key, record]: [string, any]) => {
      if (record && record.status === 'recording') {
        recordingScheduleKey = key;
        recordingRecord = record;
      }
    });

    // If found a recording, activate this client
    if (recordingScheduleKey && recordingRecord) {
      // Prevent duplicate handling
      if (recordingHandledRef.current === recordingScheduleKey) return;
      recordingHandledRef.current = recordingScheduleKey;

      // DO NOT write mode to Firebase and DO NOT call onOptimisticModeChange
      // This keeps the server in 'idle' mode so other clients remain enabled
      // Only this specific client will show the recording status card

      // Show status card with recording info
      setStatusCard({ show: true, message: 'Recording', type: 'loading' });

      // Store in localStorage for refresh persistence
      try {
        localStorage.setItem(`recordingClient:${serverId}`, clientId);
        localStorage.setItem(`recordingKey:${serverId}:${clientId}`, recordingScheduleKey);
      } catch {}
    }
  }, [scheduledRecords, clientId, serverId, onOptimisticModeChange]);

  // Monitor scheduled records for "ready_to_transmit" status -> show success for 5s, then reset
  const transmitReadyTimerRef = useRef<number | null>(null);
  const transmitReadyHandledRef = useRef<string>('');
  useEffect(() => {
    // Check if this client is currently recording
    let recordingInitiator = '';
    let recordingKey = '';
    try {
      recordingInitiator = localStorage.getItem(`recordingClient:${serverId}`) || '';
      recordingKey = localStorage.getItem(`recordingKey:${serverId}:${clientId}`) || '';
    } catch {}

    if (recordingInitiator !== clientId || !recordingKey) return;

    // Check if the recording is now ready_to_transmit
    const recordData = scheduledRecords[recordingKey];
    if (!recordData || recordData.status !== 'ready_to_transmit') return;

    // Prevent duplicate handling
    if (transmitReadyHandledRef.current === recordingKey) return;
    transmitReadyHandledRef.current = recordingKey;

    setStatusCard({ show: true, message: 'Ready to transmit', type: 'success' });

    let remaining = 5000;
    try {
      const key = `transmitReadyAt:${serverId}:${clientId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    // Reset after 5s
    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        // Reset mode to idle
        const modeRef = ref(database, `servers/${serverId}/mode`);
        await update(modeRef, {
          type: 'idle',
          target_client_id: '',
          duration_sec: 0,
          schedule_key: '',
          updated_at: now
        });
        // Optimistic release disables
        if (typeof onOptimisticModeChange === 'function') {
          onOptimisticModeChange({ type: 'idle', target_client_id: '', updated_at: now });
        }
      } catch (err) {
        console.error('Failed to reset after transmit ready:', err);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        recordingHandledRef.current = '';
        transmitReadyHandledRef.current = '';
        try {
          localStorage.removeItem(`transmitReadyAt:${serverId}:${clientId}`);
          localStorage.removeItem(`recordingClient:${serverId}`);
          localStorage.removeItem(`recordingKey:${serverId}:${clientId}`);
        } catch {}
      }
    }, remaining);
    transmitReadyTimerRef.current = id;
  }, [scheduledRecords, serverId, clientId, onOptimisticModeChange]);

  // Monitor active_status for transmit completion -> show success for 5s, update table, then reset
  const transmitSuccessTimerRef = useRef<number | null>(null);
  useEffect(() => {
    // Check if this client is transmitting
    let transmittingInitiator = '';
    let transmittingKey = '';
    try {
      transmittingInitiator = localStorage.getItem(`transmittingClient:${serverId}`) || '';
      transmittingKey = localStorage.getItem(`transmittingKey:${serverId}:${clientId}`) || '';
    } catch {}

    if (transmittingInitiator !== clientId) return;
    if (!activeStatus || activeStatus.status !== 'completed') return;

    setStatusCard({ show: true, message: 'Schedule transmission completed', type: 'success' });

    let remaining = 5000;
    try {
      const key = `transmitSuccessAt:${serverId}:${clientId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    if (transmitSuccessTimerRef.current) {
      window.clearTimeout(transmitSuccessTimerRef.current);
      transmitSuccessTimerRef.current = null;
    }

    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        
        // Update scheduled record status to "completed" in Firebase
        if (transmittingKey) {
          const recordRef = ref(database, `servers/${serverId}/clients/${clientId}/scheduled_records/${transmittingKey}`);
          await update(recordRef, { status: 'completed' });
        }
        
        // Reset mode and active_status
        const modeRef = ref(database, `servers/${serverId}/mode`);
        await update(modeRef, { type: 'idle', target_client_id: '', schedule_key: '', duration_sec: 0, updated_at: now });
        const statusRef = ref(database, `servers/${serverId}/active_status`);
        await update(statusRef, { status: 'idle', progress: 0, total_files: 0, received_files: 0, total_size_bytes: 0, transferred_bytes: 0 });
        
        // Optimistic release disables
        if (typeof onOptimisticModeChange === 'function') {
          onOptimisticModeChange({ type: 'idle', target_client_id: '', updated_at: now });
        }
      } catch (error) {
        console.error('Failed to reset after transmit success:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        try {
          localStorage.removeItem(`transmitSuccessAt:${serverId}:${clientId}`);
          localStorage.removeItem(`transmittingClient:${serverId}`);
          localStorage.removeItem(`transmittingKey:${serverId}:${clientId}`);
        } catch {}
      }
    }, remaining);
    transmitSuccessTimerRef.current = id;

    return () => {
      if (transmitSuccessTimerRef.current) {
        window.clearTimeout(transmitSuccessTimerRef.current);
        transmitSuccessTimerRef.current = null;
      }
    };
  }, [activeStatus.status, serverId, clientId, onOptimisticModeChange]);

  // Subscribe to scheduled records
  useEffect(() => {
    const unsubscribe = subscribeToScheduledRecords(serverId, clientId, (records) => {
      const newRecords = records || {};
      // Remove placeholder if it exists
      if (newRecords._placeholder) {
        delete newRecords._placeholder;
      }
      setScheduledRecords(newRecords);
    });
    return unsubscribe;
  }, [serverId, clientId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showClientMenu) {
        setShowClientMenu(false);
      }
    };

    if (showClientMenu) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showClientMenu]);

  // Location update feedback is now only shown when explicitly set by button handler

  // Button handlers - UI WRITES to Firebase
  const handleConnect = async () => {
    try {
      // Optimistic UI: mark this client active & disable others via mode
      const now = new Date().toISOString();
      setStatusCard({ show: true, message: 'Connecting...', type: 'loading' });
      try {
        localStorage.setItem(`connectingClient:${serverId}`, clientId);
      } catch {}
      if (typeof onOptimisticModeChange === 'function') {
        onOptimisticModeChange({ type: 'connect', target_client_id: clientId, updated_at: now });
      }
      await setConnectCommand(serverId, clientId);
    } catch (error) {
      console.error('Failed to send connect command:', error);
      setStatusCard({ show: false, message: '', type: 'loading' });
    }
  };

  // Client Location button: behaves like Connect but for location
  const handleClientLocation = async () => {
    try {
      const now = new Date().toISOString();
      setStatusCard({ show: true, message: 'Getting location...', type: 'loading' });
      try {
        localStorage.setItem(`locatingClient:${serverId}`, clientId);
        const baseline = {
          lat: clientInfo?.lat ?? null,
          long: clientInfo?.long ?? null,
          location_name: clientInfo?.location_name ?? null
        };
        localStorage.setItem(`locationBaseline:${serverId}:${clientId}`, JSON.stringify(baseline));
      } catch {}
      if (typeof onOptimisticModeChange === 'function') {
        onOptimisticModeChange({ type: 'client_location', target_client_id: clientId, updated_at: now });
      }
      await setClientLocationCommand(serverId, clientId);
    } catch (error) {
      console.error('Failed to send client location command:', error);
      setStatusCard({ show: false, message: '', type: 'loading' });
    }
  };

  const handleInstant = async () => {
    const durationMinutes = parseInt(instantDuration);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      alert('Please enter a valid duration in minutes');
      return;
    }
    try {
      // Close modal and reset duration first
      setShowInstantModal(false);
      setInstantDuration('1');
      const now = new Date().toISOString();
      // Convert minutes to seconds for backend
      const durationSeconds = durationMinutes * 60;
      // Optimistic UI: mark this client active & disable others via mode
      setStatusCard({ show: true, message: 'Connecting...', type: 'progress' });
      try {
        localStorage.setItem(`instantClient:${serverId}`, clientId);
      } catch {}
      if (typeof onOptimisticModeChange === 'function') {
        onOptimisticModeChange({ type: 'instant', target_client_id: clientId, duration_sec: durationSeconds, updated_at: now });
      }
      await setInstantCommand(serverId, clientId, durationSeconds);
    } catch (error) {
      console.error('Failed to send instant command:', error);
      setStatusCard({ show: false, message: '', type: 'loading' });
    }
  };

  const handleSchedule = async () => {
    const durationMinutes = parseInt(scheduleDuration);
    if (isNaN(durationMinutes) || durationMinutes <= 0) {
      alert('Please enter a valid duration in minutes');
      return;
    }
    if (!scheduleDate || !scheduleTime) {
      alert('Please select both date and time');
      return;
    }

    try {
      // Combine date and time, keep as local time without timezone conversion: "2026-01-06T15:30:00"
      const scheduleKey = `${scheduleDate}T${scheduleTime}:00`;
      
      // Convert minutes to seconds for backend
      const durationSeconds = durationMinutes * 60;

      // Optimistic UI update before Firebase call
      if (onOptimisticModeChange) {
        onOptimisticModeChange({
          type: 'schedule',
          target_client_id: clientId,
          duration_sec: durationSeconds,
          schedule_key: scheduleKey,
          updated_at: new Date().toISOString()
        });
      }
      
      // Close modal immediately
      setShowScheduleModal(false);
      setScheduleDuration('5');
      setScheduleDate('');
      setScheduleTime('');
      
      // Send command to Firebase (non-blocking)
      setScheduleCommand(serverId, clientId, durationSeconds, scheduleKey).catch(error => {
        console.error('Failed to send schedule command:', error);
      });
    } catch (error) {
      console.error('Failed to process schedule:', error);
    }
  };

  const handleStartTransmit = async (scheduleKey: string) => {
    try {
      const now = new Date().toISOString();
      
      // Optimistic UI update before Firebase call
      if (onOptimisticModeChange) {
        onOptimisticModeChange({
          type: 'transmit_scheduled',
          target_client_id: clientId,
          schedule_key: scheduleKey,
          updated_at: now
        });
      }
      
      // Store in localStorage
      try {
        localStorage.setItem(`transmittingClient:${serverId}`, clientId);
        localStorage.setItem(`transmittingKey:${serverId}:${clientId}`, scheduleKey);
      } catch {}
      
      // Send command to Firebase (non-blocking)
      setTransmitScheduledCommand(serverId, clientId, scheduleKey).catch(error => {
        console.error('Failed to send transmit command:', error);
      });
    } catch (error) {
      console.error('Failed to start transmit:', error);
    }
  };

  const handleResetClient = async () => {
    if (window.confirm(`Are you sure you want to reset ${clientName}? This will reset all keys under this client.`)) {
      try {
        // IMMEDIATELY update UI state for instant response
        const now = new Date().toISOString();
        setMode({ type: 'idle', target_client_id: '', duration_sec: 0, schedule_key: '', updated_at: now });
        if (typeof onOptimisticModeChange === 'function') {
          onOptimisticModeChange({ type: 'idle', target_client_id: '', updated_at: now });
        }
        setShowClientMenu(false);
        setStatusCard({ show: false, message: '', type: 'loading' });
        
        // Then update Firebase (listener will sync state if needed)
        await resetClient(serverId, clientId);
        console.log('Client reset successfully');
      } catch (error) {
        console.error('Failed to reset client:', error);
      }
    }
  };

  const handleEditLocationClick = () => {
    setEditLat(clientInfo.lat?.toString() || '0');
    setEditLong(clientInfo.long?.toString() || '0');
    setEditLocationName(clientInfo.location_name || 'Not set');
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
      
      const clientInfoRef = ref(database, `servers/${serverId}/clients/${clientId}/client_info`);
      
      await update(clientInfoRef, {
        lat: lat,
        long: long,
        location_name: editLocationName || 'Not set'
      });
      
      setShowEditLocationModal(false);
      console.log('Location updated successfully');
    } catch (error) {
      console.error('Failed to update location:', error);
      alert('Failed to update location');
    }
  };

  // Data History handlers
  const handleBatRowClick = (batId: string) => {
    const serverNum = serverId.replace('server', '');
    const clientNum = clientId.replace('client', '');
    
    console.log('Navigating to BAT details:', {
      batId,
      serverNum,
      clientNum,
      path: `/bat/${serverNum}/${clientNum}/${batId}`
    });
    
    navigate(`/bat/${serverNum}/${clientNum}/${batId}`, {
      state: {
        serverName: serverName,
        clientName: clientName,
        serverNum: serverNum,
        clientNum: clientNum,
        batId: batId
      }
    });
  };

  const handleMaximizeHistory = () => {
    // Convert bat history folders to the format expected by DataHistoryMaximizePage
    const foldersData = batHistory.map(folder => ({
      folder_id: folder.id,
      name: folder.name,
      timestamp: folder.timestamp,
      date: folder.date || '-',
      time: folder.time || '-',
      fileCount: folder.fileCount || 0,
      totalSize: folder.totalSize || '-'
    }));
    
    navigate('/data-history-maximize', {
      state: {
        folders: foldersData,
        clientName: clientName,
        serverName: serverName,
        serverId: serverId,
        clientId: clientId
      }
    });
  };

  const handleMaximizeScheduled = () => {
    // Convert scheduled records to array format for the full page
    const scheduledData = Object.entries(scheduledRecords)
      .filter(([key]) => key !== '_placeholder')
      .map(([scheduleKey, record]: [string, any]) => {
        const scheduleDateTime = new Date(scheduleKey);
        return {
          scheduleKey: scheduleKey,
          date: scheduleDateTime.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric' 
          }),
          time: scheduleDateTime.toLocaleTimeString('en-US', { 
            hour: '2-digit', 
            minute: '2-digit' 
          }),
          duration: Math.floor((record.duration_sec || 0) / 60),
          status: record.status || 'unknown'
        };
      });
    
    navigate('/scheduled-recordings-full', {
      state: {
        data: scheduledData,
        clientName: clientName,
        serverName: serverName,
        serverId: serverId,
        clientId: clientId
      }
    });
  };

  const paginatedHistory = batHistory.slice(
    historyPage * HISTORY_PAGE_SIZE,
    (historyPage + 1) * HISTORY_PAGE_SIZE
  );

  const totalHistoryPages = Math.ceil(batHistory.length / HISTORY_PAGE_SIZE);

  // OLD PREDICTION CODE DISABLED - Now using folder-based batch processing
  // Predictions are handled in loadFolderAudioFiles() when user expands a folder

  // Format location display
  const locationDisplay = clientInfo.location_name && clientInfo.location_name !== 'Not set'
    ? clientInfo.location_name
    : 'Location not set';
  const hasLocation = clientInfo.lat && clientInfo.long && 
    clientInfo.lat !== 0 && clientInfo.long !== 0;

  return (
    <div className="bg-white rounded-lg border border-slate-700 shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      {/* Client Header */}
      <div className="bg-gradient-to-r from-gray-50 via-gray-100 to-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
            <div>
              <h3 className="font-bold text-base text-gray-900">{clientName}</h3>
              <div className="text-gray-600 text-xs flex items-center gap-1">
                {hasLocation ? (
                  <a
                    href={`https://www.google.com/maps?q=${clientInfo.lat},${clientInfo.long}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-blue-600"
                  >
                    {locationDisplay}
                  </a>
                ) : (
                  <span>{locationDisplay}</span>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditLocationClick();
                  }}
                  className="ml-1 p-0.5 hover:bg-gray-200 rounded transition-colors"
                  title="Edit location"
                >
                  <Edit className="w-3 h-3" />
                </button>
              </div>
            </div>
            {(isThisClientActive || isRecording) && (
              <span className="px-2 py-1 bg-amber-400 text-amber-900 text-xs rounded-full font-medium ml-2">
                Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Four Action Buttons - Same style as Server Location button */}
            <button
              onClick={(e) => { e.preventDefault(); handleConnect(); }}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDisabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
              }`}
            >
              <Link className="w-4 h-4" />
              Connect
            </button>
            {/* Connect button removed */}

            <button
              onClick={handleClientLocation}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDisabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
              }`}
            >
              <MapPin className="w-4 h-4" />
              Location
            </button>

            <button
              onClick={() => setShowInstantModal(true)}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDisabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-green-50 text-green-700 hover:bg-green-100 border border-green-200'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              Instant
            </button>

            <button
              onClick={() => setShowScheduleModal(true)}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDisabled
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200'
              }`}
            >
              <Calendar className="w-4 h-4" />
              Schedule
            </button>

            {/* Three-dot Menu Button */}
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowClientMenu(!showClientMenu);
                }}
                className="w-8 h-8 rounded-md border border-gray-300 flex items-center justify-center transition-colors hover:bg-gray-200 text-gray-700 hover:text-gray-900"
                title="Client options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {/* Dropdown Menu */}
              {showClientMenu && (
                <div 
                  className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[150px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetClient();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Reset Client
                  </button>
                </div>
              )}
            </div>

            {/* Delete Button */}
            <button
              onClick={onRemove}
              disabled={isDisabled}
              className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                isDisabled
                  ? 'border-gray-300 text-gray-400 cursor-not-allowed'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-200 hover:text-red-600'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4">
        {/* Status Card */}
        {statusCard.show && (
          <>
            {statusCard.type === 'progress' ? (
              <div className="mb-3 px-4 py-4 rounded-lg text-sm bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                {/* Progress Flow - starts from Connecting for instant, from Transmitting for transmit_scheduled */}
                <div className="space-y-3">
                  {/* Connecting Stage - only show for instant mode */}
                  {mode.type === 'instant' && (
                    <div className="flex items-center gap-3">
                      {activeStatus.status === 'idle' || (activeStatus.status !== 'recording' && activeStatus.status !== 'transmitting' && activeStatus.status !== 'uploading' && activeStatus.status !== 'completed') ? (
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      <span className="font-medium text-gray-700">Connecting...</span>
                    </div>
                  )}
                  
                  {/* Recording Stage - only show for instant mode */}
                  {mode.type === 'instant' && (activeStatus.status === 'recording' || activeStatus.status === 'transmitting' || activeStatus.status === 'uploading' || activeStatus.status === 'completed') && (
                    <div className="flex items-center gap-3">
                      {activeStatus.status === 'recording' ? (
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      <span className="font-medium text-gray-700">Recording</span>
                    </div>
                  )}
                  
                  {/* Transmitting Stage - show for both instant and transmit_scheduled */}
                  {(activeStatus.status === 'transmitting' || activeStatus.status === 'uploading' || activeStatus.status === 'completed' || (mode.type === 'transmit_scheduled' && activeStatus.status === 'idle')) && (
                    <div className="flex items-center gap-3">
                      {activeStatus.status === 'transmitting' || (mode.type === 'transmit_scheduled' && activeStatus.status === 'idle') ? (
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      <span className="font-medium text-gray-700">Transmitting</span>
                      
                      {/* Schedule info badges for transmit_scheduled mode - always visible */}
                      {mode.type === 'transmit_scheduled' && mode.schedule_key && (
                        <div className="flex items-center gap-2 ml-auto flex-wrap">
                          <span className="px-2 py-0.5 bg-blue-500/20 text-blue-700 rounded-md text-[10px] font-medium border border-blue-400/30">
                            {mode.schedule_key}
                          </span>
                          <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-700 rounded-md text-[10px] font-medium border border-indigo-400/30">
                            {new Date(mode.schedule_key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                          </span>
                          <span className="px-2 py-0.5 bg-purple-500/20 text-purple-700 rounded-md text-[10px] font-medium border border-purple-400/30">
                            {new Date(mode.schedule_key).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="px-2 py-0.5 bg-pink-500/20 text-pink-700 rounded-md text-[10px] font-medium border border-pink-400/30">
                            {(() => {
                              const record = scheduledRecords[mode.schedule_key];
                              return Math.floor(((record && record.duration_sec) || 0) / 60);
                            })()}min
                          </span>
                        </div>
                      )}
                      
                      {/* File/size badges - show during transmitting for both instant and transmit_scheduled */}
                      {activeStatus.status === 'transmitting' && (
                        <div className={`flex items-center gap-2 ${mode.type === 'transmit_scheduled' ? '' : 'ml-auto'}`}>
                          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                            {activeStatus.received_files}/{activeStatus.total_files} files
                          </span>
                          <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                            {formatBytes(activeStatus.transferred_bytes)}/{formatBytes(activeStatus.total_size_bytes)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Uploading Stage */}
                  {(activeStatus.status === 'uploading' || activeStatus.status === 'completed') && (
                    <div className="flex items-center gap-3">
                      {activeStatus.status === 'uploading' ? (
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      )}
                      <span className="font-medium text-gray-700">Uploading to DB</span>
                    </div>
                  )}
                  
                  {/* Completed Stage */}
                  {activeStatus.status === 'completed' && (
                    <div className="flex items-center gap-3">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <span className="font-medium text-green-700">Completed</span>
                    </div>
                  )}
                  
                  {/* Progress Bar */}
                  {activeStatus.status !== 'idle' && (
                    <div className="mt-3 pt-3 border-t border-blue-200">
                      <div className="flex justify-between text-xs text-gray-600 mb-1">
                        <span>Progress: {activeStatus.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-indigo-600 h-2 rounded-full transition-all duration-300"
                          style={{ width: `${activeStatus.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className={`mb-3 px-4 py-3 rounded-lg text-sm font-medium ${
                statusCard.type === 'loading' 
                  ? 'bg-blue-50 text-blue-700 border border-blue-200' 
                  : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                <div className="flex items-center gap-3">
                  {statusCard.type === 'loading' ? (
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <CheckCircle className="w-5 h-5" />
                  )}
                  <span>{statusCard.message}</span>
                  
                  {/* Schedule badges - show date, time, duration for schedule mode */}
                  {mode.type === 'schedule' && mode.target_client_id === clientId && mode.schedule_key && (
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="px-2 py-0.5 bg-blue-500/20 text-blue-700 rounded-md text-[10px] font-medium border border-blue-400/30">
                        {new Date(mode.schedule_key).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                      <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-700 rounded-md text-[10px] font-medium border border-indigo-400/30">
                        {new Date(mode.schedule_key).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <span className="px-2 py-0.5 bg-purple-500/20 text-purple-700 rounded-md text-[10px] font-medium border border-purple-400/30">
                        {Math.floor((mode.duration_sec || 0) / 60)}min
                      </span>
                    </div>
                  )}
                  
                  {/* Recording badges - show schedule_id, date, time, duration when this client is recording */}
                  {isRecording && (() => {
                    // Get recording key from localStorage
                    let recordingKey = '';
                    try {
                      recordingKey = localStorage.getItem(`recordingKey:${serverId}:${clientId}`) || '';
                    } catch {}
                    
                    // Get record data from scheduledRecords
                    const recordData = recordingKey ? scheduledRecords[recordingKey] : null;
                    
                    if (!recordingKey || !recordData) return null;
                    
                    return (
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="px-2 py-0.5 bg-blue-500/20 text-blue-700 rounded-md text-[10px] font-medium border border-blue-400/30">
                          {recordingKey}
                        </span>
                        <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-700 rounded-md text-[10px] font-medium border border-indigo-400/30">
                          {new Date(recordingKey).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="px-2 py-0.5 bg-purple-500/20 text-purple-700 rounded-md text-[10px] font-medium border border-purple-400/30">
                          {new Date(recordingKey).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="px-2 py-0.5 bg-pink-500/20 text-pink-700 rounded-md text-[10px] font-medium border border-pink-400/30">
                          {Math.floor((recordData.duration_sec || 0) / 60)}min
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </>
        )}

        {/* Scheduled Records Table */}
      {Object.keys(scheduledRecords).filter(key => key !== '_placeholder').length > 0 && (
        <div className="border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setIsScheduledCollapsed(!isScheduledCollapsed)}
              className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors"
            >
              {isScheduledCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Scheduled Recordings
            </button>
            {!isScheduledCollapsed && (
              <button
                onClick={handleMaximizeScheduled}
                className="flex items-center gap-1 px-2 py-1 text-[10px] bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 border border-emerald-200 transition-colors"
                title="View all scheduled recordings"
              >
                <Maximize2 className="w-3 h-3" />
                Maximize
              </button>
            )}
          </div>
          {!isScheduledCollapsed && (
            <>
              <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Schedule ID</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Date</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Time</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Duration</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Status</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(scheduledRecords)
                    .filter(([key]) => key !== '_placeholder')
                    .slice(scheduledPage * SCHEDULED_PAGE_SIZE, (scheduledPage + 1) * SCHEDULED_PAGE_SIZE)
                    .map(([scheduleKey, record]: [string, any]) => {
                      const scheduleDateTime = new Date(scheduleKey);
                      const dateStr = scheduleDateTime.toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric' 
                      });
                      const timeStr = scheduleDateTime.toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      });
                      const durationMin = Math.floor((record.duration_sec || 0) / 60);
                      
                      return (
                        <tr key={scheduleKey} className="hover:bg-slate-50">
                          <td className="border border-slate-300 px-2 py-1.5 text-blue-600 font-bold">
                            {scheduleKey}
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-slate-700">{dateStr}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-slate-700">{timeStr}</td>
                          <td className="border border-slate-300 px-2 py-1.5 text-slate-700">{durationMin}min</td>
                          <td className="border border-slate-300 px-2 py-1.5">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                              record.status === 'scheduled' ? 'bg-yellow-100 text-yellow-700' :
                              record.status === 'recording' ? 'bg-blue-100 text-blue-700' :
                              record.status === 'ready_to_transmit' ? 'bg-green-100 text-green-700' :
                              record.status === 'transmitting' ? 'bg-orange-100 text-orange-700' :
                              record.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                              'bg-gray-100 text-gray-700'
                            }`}>
                              {record.status}
                            </span>
                          </td>
                          <td className="border border-slate-300 px-2 py-1.5 text-center">
                            <button
                              onClick={() => handleStartTransmit(scheduleKey)}
                              disabled={record.status !== 'ready_to_transmit' || isDisabled || record.status === 'completed'}
                              className={`px-2 py-1 rounded text-[10px] ${
                                record.status === 'ready_to_transmit' && !isDisabled
                                  ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                              }`}
                              title={
                                record.status === 'completed' ? 'Completed' :
                                record.status === 'ready_to_transmit' && !isDisabled ? 'Start Transmit' : 
                                'Transmit (disabled)'
                              }
                            >
                              Transmit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {(() => {
              const scheduledEntries = Object.entries(scheduledRecords).filter(([key]) => key !== '_placeholder');
              const totalScheduledPages = Math.ceil(scheduledEntries.length / SCHEDULED_PAGE_SIZE);
              return totalScheduledPages > 1 ? (
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[10px] text-gray-600">
                    Showing {scheduledPage * SCHEDULED_PAGE_SIZE + 1}-{Math.min((scheduledPage + 1) * SCHEDULED_PAGE_SIZE, scheduledEntries.length)} of {scheduledEntries.length}
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setScheduledPage(Math.max(0, scheduledPage - 1))}
                      disabled={scheduledPage === 0}
                      className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Previous page"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] text-gray-600 px-2">
                      {scheduledPage + 1} / {totalScheduledPages}
                    </span>
                    <button
                      onClick={() => setScheduledPage(Math.min(totalScheduledPages - 1, scheduledPage + 1))}
                      disabled={scheduledPage >= totalScheduledPages - 1}
                      className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Next page"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ) : null;
            })()}
            </>
          )}
        </div>
      )}

      {/* Data History Section */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors"
          >
            {isHistoryCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            Data History
          </button>
          {!isHistoryCollapsed && (
            <button
              onClick={handleMaximizeHistory}
              disabled={batHistory.length === 0}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-emerald-50 text-emerald-700 rounded hover:bg-emerald-100 border border-emerald-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="View all history"
            >
              <Maximize2 className="w-3 h-3" />
              Maximize
            </button>
          )}
        </div>
        
        {!isHistoryCollapsed && (
          <>
            {foldersLoading ? (
              <div className="text-center py-4 text-xs text-gray-500">
                <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                Loading folders from Drive...
              </div>
            ) : batHistory.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-500">
                No BAT recording folders found
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700 w-8"></th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Folder Name</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Date</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Time</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Files</th>
                    <th className="border border-slate-300 px-2 py-1.5 text-left font-semibold text-slate-700">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedHistory.map((folder, index) => (
                    <React.Fragment key={`${folder.id}-${index}`}>
                      {/* Folder Row */}
                      <tr className="hover:bg-emerald-50 transition-colors">
                        {/* Expand/Collapse Button */}
                        <td className="border border-slate-300 px-1 py-1.5 text-center">
                          <button
                            onClick={() => toggleFolderExpansion(folder)}
                            className="p-0.5 hover:bg-slate-200 rounded transition-colors"
                          >
                            {loadingFolderAudio === folder.id ? (
                              <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                            ) : expandedFolderId === folder.id ? (
                              <ChevronDown className="w-3 h-3 text-slate-600" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-slate-600" />
                            )}
                          </button>
                        </td>
                        {/* Folder Name - Clickable to navigate */}
                        <td 
                          className="border border-slate-300 px-2 py-1.5 text-blue-600 font-semibold hover:underline cursor-pointer"
                          onClick={() => navigate(`/folder/${serverName.replace('Server ', '')}/${clientName.replace('Client ', '')}/${folder.timestamp}`, {
                            state: { folderName: folder.name, folderId: folder.id }
                          })}
                        >
                          {folder.name}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-slate-700">
                          {folder.date || '-'}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-slate-700">
                          {folder.time || '-'}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-slate-700 text-center">
                          {folder.fileCount || 0}
                        </td>
                        <td className="border border-slate-300 px-2 py-1.5 text-slate-700">
                          {folder.totalSize || '0 B'}
                        </td>
                      </tr>
                      
                      {/* Expanded Audio Files */}
                      {expandedFolderId === folder.id && (
                        <tr>
                          <td colSpan={6} className="border border-slate-300 p-0 bg-slate-50">
                            {loadingFolderAudio === folder.id ? (
                              <div className="text-center py-4 text-xs text-gray-500">
                                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                                Loading bat calls...
                              </div>
                            ) : folderAudioFiles[folder.id]?.length > 0 ? (
                              <div className="p-2">
                                <table className="w-full text-xs border-collapse">
                                  <thead>
                                    <tr className="bg-emerald-100">
                                      <th className="border border-emerald-200 px-2 py-1 text-left font-semibold text-emerald-800">Audio File</th>
                                      <th className="border border-emerald-200 px-2 py-1 text-left font-semibold text-emerald-800">Top 5 Species</th>
                                      <th className="border border-emerald-200 px-2 py-1 text-center font-semibold text-emerald-800 w-16">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {folderAudioFiles[folder.id].map((audio: any, audioIdx: number) => (
                                      <tr key={audioIdx} className="hover:bg-emerald-50">
                                        <td className="border border-emerald-200 px-2 py-1 text-slate-700">
                                          {audio.file_name}
                                          {audio.from_cache && (
                                            <span className="ml-1 text-[9px] text-gray-500">(cached)</span>
                                          )}
                                        </td>
                                        <td className="border border-emerald-200 px-2 py-1">
                                          <div className="flex flex-wrap gap-1">
                                            {audio.processing ? (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-800">
                                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                {audio.predicted_species || 'Processing...'}
                                              </span>
                                            ) : audio.species && audio.species.length > 0 ? (
                                              <>
                                                {audio.species.slice(0, 5).map((sp: any, spIdx: number) => (
                                                  <span 
                                                    key={spIdx}
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                      spIdx === 0 ? 'bg-emerald-100 text-emerald-800' :
                                                      spIdx === 1 ? 'bg-blue-100 text-blue-800' :
                                                      spIdx === 2 ? 'bg-purple-100 text-purple-800' :
                                                      spIdx === 3 ? 'bg-orange-100 text-orange-800' :
                                                      'bg-pink-100 text-pink-800'
                                                    }`}
                                                  >
                                                    {sp.species} ({sp.confidence}%)
                                                  </span>
                                                ))}
                                                {audio.species.length > 5 && (
                                                  <span className="inline-flex items-center justify-center w-5 h-5 bg-gray-200 text-gray-700 rounded-full text-[10px] font-bold">
                                                    +{audio.species.length - 5}
                                                  </span>
                                                )}
                                              </>
                                            ) : audio.predicted_species === 'Error' ? (
                                              <span className="text-red-500 italic text-[10px]" title={audio.error}>
                                                Processing failed {audio.error && '(hover for error)'}
                                              </span>
                                            ) : audio.predicted_species === 'Processing' ? (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800">
                                                <Loader2 className="w-3 h-3 animate-spin mr-1" />
                                                Processing...
                                              </span>
                                            ) : audio.predicted_species === 'Waiting' ? (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">
                                                Waiting...
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                                Waiting..
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                        <td className="border border-emerald-200 px-1 py-1 text-center">
                                          {!audio.processing && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                repredictSingleFile(folder.id, folder.name, audioIdx, audio);
                                              }}
                                              className="p-1 text-blue-600 hover:text-blue-800 rounded-full hover:bg-blue-50 transition-colors"
                                              title="Re-predict species"
                                            >
                                              <RefreshCw className="w-3 h-3" />
                                            </button>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="text-center py-3 text-xs text-gray-500">
                                No audio files found in this folder
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination Controls */}
            {totalHistoryPages > 1 && (
              <div className="flex items-center justify-between mt-2">
                <div className="text-[10px] text-gray-600">
                  Showing {historyPage * HISTORY_PAGE_SIZE + 1}-{Math.min((historyPage + 1) * HISTORY_PAGE_SIZE, batHistory.length)} of {batHistory.length}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setHistoryPage(Math.max(0, historyPage - 1))}
                    disabled={historyPage === 0}
                    className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-3 h-3" />
                  </button>
                  <span className="text-[10px] text-gray-600 px-2">
                    {historyPage + 1} / {totalHistoryPages}
                  </span>
                  <button
                    onClick={() => setHistoryPage(Math.min(totalHistoryPages - 1, historyPage + 1))}
                    disabled={historyPage >= totalHistoryPages - 1}
                    className="p-1 rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Next page"
                  >
                    <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            )}
            </>
            )}
          </>
        )}
      </div>

      {/* Instant Modal */}
      {showInstantModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Instant Recording</h3>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Duration (minutes)</span>
              <input
                type="number"
                value={instantDuration}
                onChange={(e) => setInstantDuration(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                min="1"
              />
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleInstant}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Start Recording
              </button>
              <button
                onClick={() => setShowInstantModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Schedule Recording</h3>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Date</span>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </label>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Time</span>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
              />
            </label>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Duration (minutes)</span>
              <input
                type="number"
                value={scheduleDuration}
                onChange={(e) => setScheduleDuration(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                min="1"
              />
            </label>
            <div className="flex gap-3">
              <button
                onClick={handleSchedule}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
              >
                Schedule
              </button>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Location Modal */}
      {showEditLocationModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold mb-4">Edit Client Location</h3>
            <label className="block mb-4">
              <span className="text-sm font-medium text-gray-700">Location Name</span>
              <input
                type="text"
                value={editLocationName}
                onChange={(e) => setEditLocationName(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="e.g., Branch Office"
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
      </div>
    </div>
  );
};
