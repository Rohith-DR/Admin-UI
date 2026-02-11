import React, { useState, useEffect, useRef } from 'react';
import { MapPin, PlayCircle, Calendar, CheckCircle, Trash2, MoreVertical, Edit, Link, ChevronDown, ChevronRight, ChevronLeft, Maximize2, Loader2, RefreshCw } from 'lucide-react';
import { ref, update, onValue } from 'firebase/database';
import { useNavigate } from 'react-router-dom';

import {
  subscribeToStandaloneInfo,
  subscribeToStandaloneScheduledRecords,
  subscribeToStandaloneMode,
  subscribeToStandaloneConnectionStatus,
  subscribeToStandaloneActiveStatus,
  setStandaloneLocationCommand,
  setStandaloneConnectCommand,
  setStandaloneInstantCommand,
  setStandaloneScheduleCommand,
  setStandaloneUploadCommand,
  resetStandalone,
  database,
  subscribeToStandalonePredictions
} from '../firebase';
import {
  loadStandaloneFolderAudioWithPredictions,
  predictStandaloneSingleAudio,
  StandaloneFolderAudioEntry
} from '../services/standalonePredictions';

interface StandaloneCardProps {
  standaloneId: string;
  standaloneName: string;
  onRemove: () => void;
}

export const StandaloneCard: React.FC<StandaloneCardProps> = ({
  standaloneId,
  standaloneName,
  onRemove
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [showInstantModal, setShowInstantModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showStandaloneMenu, setShowStandaloneMenu] = useState(false);
  const [showEditLocationModal, setShowEditLocationModal] = useState(false);
  const [editLat, setEditLat] = useState('');
  const [editLong, setEditLong] = useState('');
  const [editLocationName, setEditLocationName] = useState('');
  const [instantDuration, setInstantDuration] = useState('1'); // minutes
  const [scheduleDuration, setScheduleDuration] = useState('5'); // minutes
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  
  // Collapse states
  const [isScheduledCollapsed, setIsScheduledCollapsed] = useState(true);
  const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(true);
  
  // Pagination states
  const [scheduledPage, setScheduledPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const SCHEDULED_PAGE_SIZE = 5;
  const HISTORY_PAGE_SIZE = 5;
  
  // Status card state
  const [statusCard, setStatusCard] = useState<{ show: boolean; message: string; type: 'loading' | 'success' | 'progress' }>({ 
    show: false, 
    message: '', 
    type: 'loading' 
  });

  // Firebase READ states
  const [standaloneInfo, setStandaloneInfo] = useState<any>({});
  const [scheduledRecords, setScheduledRecords] = useState<any>({});
  const [mode, setMode] = useState<any>({});
  const [connectionStatus, setConnectionStatus] = useState<boolean>(false);
  const [activeStatus, setActiveStatus] = useState<any>({ status: 'idle', progress: 0, total_files: 0, total_size_bytes: 0 });

  // Data History states
  const [batHistory, setBatHistory] = useState<any[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);
  const [folderAudioFiles, setFolderAudioFiles] = useState<{[key: string]: StandaloneFolderAudioEntry[]}>({});
  const [loadingFolderAudio, setLoadingFolderAudio] = useState<string | null>(null);

  // AbortController for cancelling ongoing predictions when component unmounts (COPIED FROM CLIENT CARD)
  const abortControllerRef = useRef<AbortController | null>(null);

  // Derived states
  const hasActiveScheduledRecording = Object.values(scheduledRecords).some(
    (record: any) => record.status === 'recording'
  );
  const isBusy = mode.type !== 'idle' || hasActiveScheduledRecording;
  const isDisabled = isBusy;

  // Subscribe to standalone info
  useEffect(() => {
    const unsubscribe = subscribeToStandaloneInfo(standaloneId, (info) => {
      setStandaloneInfo(info);
    });
    return unsubscribe;
  }, [standaloneId]);

  // Subscribe to mode
  useEffect(() => {
    const unsubscribe = subscribeToStandaloneMode(standaloneId, (modeData) => {
      setMode(modeData);
    });
    return unsubscribe;
  }, [standaloneId]);

  // Subscribe to connection status
  useEffect(() => {
    const unsubscribe = subscribeToStandaloneConnectionStatus(standaloneId, (status) => {
      setConnectionStatus(status);
    });
    return unsubscribe;
  }, [standaloneId]);

  // Subscribe to active status
  useEffect(() => {
    const unsubscribe = subscribeToStandaloneActiveStatus(standaloneId, (status) => {
      setActiveStatus(status || { status: 'idle', progress: 0, total_files: 0, total_size_bytes: 0 });
    });
    return unsubscribe;
  }, [standaloneId]);

  // Subscribe to scheduled records
  useEffect(() => {
    const unsubscribe = subscribeToStandaloneScheduledRecords(standaloneId, (records) => {
      const newRecords = records || {};
      // Remove placeholder if it exists
      if (newRecords._placeholder) {
        delete newRecords._placeholder;
      }
      setScheduledRecords(newRecords);
    });
    return unsubscribe;
  }, [standaloneId]);

  // Cancel ongoing predictions when component unmounts (COPIED FROM CLIENT CARD)
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        console.log(`🚫 [${standaloneId}] Component unmounting - cancelling all predictions`);
        abortControllerRef.current.abort();
      }
    };
  }, [standaloneId]);

  // Monitor scheduled records for "recording" status -> store in localStorage
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

    // If found a recording, store in localStorage
    if (recordingScheduleKey && recordingRecord) {
      // Prevent duplicate handling
      if (recordingHandledRef.current === recordingScheduleKey) return;
      recordingHandledRef.current = recordingScheduleKey;

      // Store in localStorage for refresh persistence
      try {
        localStorage.setItem(`recordingStandalone:${standaloneId}`, standaloneId);
        localStorage.setItem(`recordingKey:${standaloneId}`, recordingScheduleKey);
      } catch {}
    }
  }, [scheduledRecords, standaloneId]);

  // Monitor scheduled records for "ready_to_upload" status -> show success for 5s, then reset
  const uploadReadyTimerRef = useRef<number | null>(null);
  const uploadReadyHandledRef = useRef<string>('');
  useEffect(() => {
    // Check if this standalone is currently recording
    let recordingInitiator = '';
    let recordingKey = '';
    try {
      recordingInitiator = localStorage.getItem(`recordingStandalone:${standaloneId}`) || '';
      recordingKey = localStorage.getItem(`recordingKey:${standaloneId}`) || '';
    } catch {}

    if (recordingInitiator !== standaloneId || !recordingKey) return;

    // Check if the recording is now ready_to_upload
    const recordData = scheduledRecords[recordingKey];
    if (!recordData || recordData.status !== 'ready_to_upload') return;

    // Prevent duplicate handling
    if (uploadReadyHandledRef.current === recordingKey) return;
    uploadReadyHandledRef.current = recordingKey;

    setStatusCard({ show: true, message: 'Ready to Upload', type: 'success' });

    let remaining = 5000;
    try {
      const key = `uploadReadyAt:${standaloneId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    if (uploadReadyTimerRef.current) {
      window.clearTimeout(uploadReadyTimerRef.current);
      uploadReadyTimerRef.current = null;
    }

    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        const modeRef = ref(database, `standalones/${standaloneId}/mode`);
        await update(modeRef, {
          type: 'idle',
          duration_sec: 0,
          schedule_key: '',
          updated_at: now
        });
      } catch (error) {
        console.error('Failed to reset after upload ready:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        recordingHandledRef.current = '';
        uploadReadyHandledRef.current = '';
        try {
          localStorage.removeItem(`uploadReadyAt:${standaloneId}`);
          localStorage.removeItem(`recordingStandalone:${standaloneId}`);
          localStorage.removeItem(`recordingKey:${standaloneId}`);
        } catch {}
      }
    }, remaining);
    uploadReadyTimerRef.current = id;

    return () => {
      if (uploadReadyTimerRef.current) {
        window.clearTimeout(uploadReadyTimerRef.current);
        uploadReadyTimerRef.current = null;
      }
    };
  }, [scheduledRecords, standaloneId]);

  // Handle mode changes - show appropriate status cards with progress type for instant
  useEffect(() => {
    // Check if we're in upload success window - don't override the success message
    const uploadSuccessAt = localStorage.getItem(`uploadSuccessAt:${standaloneId}`);
    const uploadInitiator = localStorage.getItem(`uploadingStandalone:${standaloneId}`) || '';
    const inUploadSuccess = uploadInitiator === standaloneId && uploadSuccessAt;
    
    if (mode.type === 'connect') {
      setStatusCard({ show: true, message: 'Connecting...', type: 'loading' });
    } else if (mode.type === 'location') {
      setStatusCard({ show: true, message: 'Getting location...', type: 'loading' });
    } else if (mode.type === 'instant') {
      setStatusCard({ show: true, message: 'Recording...', type: 'progress' });
    } else if (mode.type === 'upload_scheduled') {
      // Don't override if we're showing the success message
      if (!inUploadSuccess) {
        setStatusCard({ show: true, message: 'Uploading...', type: 'progress' });
      }
    } else if (mode.type === 'idle') {
      // Check if there's an active scheduled recording
      if (hasActiveScheduledRecording) {
        const activeRecord = Object.entries(scheduledRecords).find(
          ([_, record]: [string, any]) => record.status === 'recording'
        );
        if (activeRecord) {
          const [scheduleKey, record] = activeRecord as [string, any];
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
          setStatusCard({ 
            show: true, 
            message: `Recording scheduled for ${dateStr} at ${timeStr} (${durationMin} min)`, 
            type: 'loading' 
          });
        }
      } else {
        // Check if we're in success windows or upload in progress
        const connectInitiator = localStorage.getItem(`connectingStandalone:${standaloneId}`) || '';
        const locationInitiator = localStorage.getItem(`locatingStandalone:${standaloneId}`) || '';
        const instantInitiator = localStorage.getItem(`instantStandalone:${standaloneId}`) || '';
        const scheduleInitiator = localStorage.getItem(`schedulingStandalone:${standaloneId}`) || '';
        const uploadInitiator = localStorage.getItem(`uploadingStandalone:${standaloneId}`) || '';
        
        const connectSuccessAt = localStorage.getItem(`connectSuccessAt:${standaloneId}`);
        const locationSuccessAt = localStorage.getItem(`locationSuccessAt:${standaloneId}`);
        const instantSuccessAt = localStorage.getItem(`instantSuccessAt:${standaloneId}`);
        const scheduleSuccessAt = localStorage.getItem(`scheduleSuccessAt:${standaloneId}`);
        const uploadReadyAt = localStorage.getItem(`uploadReadyAt:${standaloneId}`);
        const uploadSuccessAt = localStorage.getItem(`uploadSuccessAt:${standaloneId}`);
        
        const inConnectSuccess = connectInitiator === standaloneId && connectSuccessAt;
        const inLocationSuccess = locationInitiator === standaloneId && locationSuccessAt;
        const inInstantSuccess = instantInitiator === standaloneId && instantSuccessAt;
        const inScheduleSuccess = scheduleInitiator === standaloneId && scheduleSuccessAt;
        const inUploadReady = uploadReadyAt;
        const inUploadSuccess = uploadInitiator === standaloneId && uploadSuccessAt;
        
        if (!inConnectSuccess && !inLocationSuccess && !inInstantSuccess && !inScheduleSuccess && !inUploadReady && !inUploadSuccess) {
          setStatusCard({ show: false, message: '', type: 'loading' });
        }
      }
    }
  }, [mode.type, activeStatus.status, standaloneId, hasActiveScheduledRecording, scheduledRecords]);

  // Handle connection success -> show success for 5s, then reset
  const successTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!connectionStatus) return;

    const activeStandaloneId = localStorage.getItem(`connectingStandalone:${standaloneId}`) || '';
    if (activeStandaloneId !== standaloneId) return;

    setStatusCard({ show: true, message: 'Successfully connected', type: 'success' });

    let remaining = 5000;
    try {
      const key = `connectSuccessAt:${standaloneId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        const modeRef = ref(database, `standalones/${standaloneId}/mode`);
        await update(modeRef, { type: 'idle', duration_sec: 0, schedule_key: '', updated_at: now });
        const standaloneRef = ref(database, `standalones/${standaloneId}`);
        await update(standaloneRef, { connection_status: false });
      } catch (error) {
        console.error('Failed to reset after connect success:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        try {
          localStorage.removeItem(`connectSuccessAt:${standaloneId}`);
          localStorage.removeItem(`connectingStandalone:${standaloneId}`);
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
  }, [connectionStatus, standaloneId]);

  // Handle location success -> show success for 5s, then reset
  const locationSuccessTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const locatingInitiator = localStorage.getItem(`locatingStandalone:${standaloneId}`) || '';
    const isInitiator = locatingInitiator === standaloneId;
    if (!isInitiator) return;

    const isFlagTrue = standaloneInfo?.location_updated === true;
    if (!isFlagTrue) return;

    setStatusCard({ show: true, message: 'Location updated', type: 'success' });

    let remaining = 5000;
    try {
      const key = `locationSuccessAt:${standaloneId}`;
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
        const modeRef = ref(database, `standalones/${standaloneId}/mode`);
        await update(modeRef, { type: 'idle', duration_sec: 0, schedule_key: '', updated_at: now });
        const infoRef = ref(database, `standalones/${standaloneId}/standaloneinfo`);
        await update(infoRef, { location_updated: false });
      } catch (error) {
        console.error('Failed to reset after location success:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        try {
          localStorage.removeItem(`locationSuccessAt:${standaloneId}`);
          localStorage.removeItem(`locatingStandalone:${standaloneId}`);
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
  }, [standaloneInfo?.location_updated, standaloneId]);

  // Monitor active_status for upload completion -> show success for 5s, then reset
  const uploadSuccessTimerRef = useRef<number | null>(null);
  useEffect(() => {
    // Check if this standalone is uploading
    let uploadingInitiator = '';
    let uploadingKey = '';
    try {
      uploadingInitiator = localStorage.getItem(`uploadingStandalone:${standaloneId}`) || '';
      uploadingKey = localStorage.getItem(`uploadingKey:${standaloneId}`) || '';
    } catch {}

    if (uploadingInitiator !== standaloneId) return;
    if (!activeStatus || activeStatus.status !== 'completed') return;

    setStatusCard({ show: true, message: 'Schedule Uploading Completed', type: 'success' });

    let remaining = 5000;
    try {
      const key = `uploadSuccessAt:${standaloneId}`;
      const existing = localStorage.getItem(key);
      if (existing) {
        const elapsed = Date.now() - new Date(existing).getTime();
        remaining = Math.max(0, 5000 - elapsed);
      } else {
        localStorage.setItem(key, new Date().toISOString());
      }
    } catch {}

    if (uploadSuccessTimerRef.current) {
      window.clearTimeout(uploadSuccessTimerRef.current);
      uploadSuccessTimerRef.current = null;
    }

    const id = window.setTimeout(async () => {
      try {
        const now = new Date().toISOString();
        
        // Update scheduled record status to "completed" in Firebase
        if (uploadingKey) {
          const recordRef = ref(database, `standalones/${standaloneId}/scheduled_records/${uploadingKey}`);
          await update(recordRef, { status: 'completed' });
        }
        
        // Reset mode and active_status
        const modeRef = ref(database, `standalones/${standaloneId}/mode`);
        await update(modeRef, { type: 'idle', duration_sec: 0, schedule_key: '', updated_at: now });
        const statusRef = ref(database, `standalones/${standaloneId}/active_status`);
        await update(statusRef, { status: 'idle', progress: 0, total_files: 0, total_size_bytes: 0 });
      } catch (error) {
        console.error('Failed to reset after upload success:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        try {
          localStorage.removeItem(`uploadSuccessAt:${standaloneId}`);
          localStorage.removeItem(`uploadingStandalone:${standaloneId}`);
          localStorage.removeItem(`uploadingKey:${standaloneId}`);
        } catch {}
      }
    }, remaining);
    uploadSuccessTimerRef.current = id;

    return () => {
      if (uploadSuccessTimerRef.current) {
        window.clearTimeout(uploadSuccessTimerRef.current);
        uploadSuccessTimerRef.current = null;
      }
    };
  }, [activeStatus.status, standaloneId]);

  // Handle instant recording completion -> show success for 5s, then reset
  const instantSuccessTimerRef = useRef<number | null>(null);
  useEffect(() => {
    const instantInitiator = localStorage.getItem(`instantStandalone:${standaloneId}`) || '';
    const isInitiator = instantInitiator === standaloneId;
    if (!isInitiator) return;
    if (activeStatus.status !== 'completed') return;

    setStatusCard({ show: true, message: 'Successfully recorded and uploaded', type: 'success' });

    let remaining = 5000;
    try {
      const key = `instantSuccessAt:${standaloneId}`;
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
        const modeRef = ref(database, `standalones/${standaloneId}/mode`);
        await update(modeRef, { type: 'idle', duration_sec: 0, schedule_key: '', updated_at: now });
        const statusRef = ref(database, `standalones/${standaloneId}/active_status`);
        await update(statusRef, { status: 'idle', progress: 0, total_files: 0, total_size_bytes: 0 });
      } catch (error) {
        console.error('Failed to reset after instant success:', error);
      } finally {
        setStatusCard({ show: false, message: '', type: 'loading' });
        try {
          localStorage.removeItem(`instantSuccessAt:${standaloneId}`);
          localStorage.removeItem(`instantStandalone:${standaloneId}`);
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
  }, [activeStatus.status, standaloneId]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      if (showStandaloneMenu) {
        setShowStandaloneMenu(false);
      }
    };

    if (showStandaloneMenu) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showStandaloneMenu]);

  // Fetch standalone folders for Data History (COPIED FROM CLIENT CARD)
  useEffect(() => {
    const fetchFolders = async () => {
      const standaloneNum = standaloneId.replace(/\D/g, '');
      if (!standaloneNum) return;
      
      setFoldersLoading(true);
      try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
        console.log(`📂 [${standaloneId}] Fetching folders from: ${apiUrl}/api/standalone/folders/${standaloneNum}`);
        
        const response = await fetch(`${apiUrl}/api/standalone/folders/${standaloneNum}`);
        
        if (!response.ok) {
          console.error(`❌ [${standaloneId}] Failed to fetch folders: ${response.status}`);
          const errorText = await response.text();
          console.error(`❌ [${standaloneId}] Error response:`, errorText);
          setBatHistory([]);
          return;
        }
        
        const data = await response.json();
        console.log(`📦 [${standaloneId}] Received folders:`, data);
        
        if (data.success && data.folders) {
          // Keep full folder data for display (SAME AS CLIENT CARD)
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
          
          console.log(`✅ [${standaloneId}] Setting ${folders.length} folders`);
          setBatHistory(folders);
        } else {
          console.warn(`⚠️ [${standaloneId}] No folders in response or success=false`);
          setBatHistory([]);
        }
      } catch (error) {
        console.error(`❌ [${standaloneId}] Error fetching folders:`, error);
        setBatHistory([]);
      } finally {
        setFoldersLoading(false);
      }
    };
    
    fetchFolders();
  }, [standaloneId]);

  // Function to load audio files for a folder and process predictions (COPIED FROM CLIENT CARD)
  const loadFolderAudioFiles = async (folderId: string, folderName: string, forceRepredict = false) => {
    // Check if already loaded in state (even with partial predictions)
    if (!forceRepredict && folderAudioFiles[folderId] && folderAudioFiles[folderId].length > 0) {
      // Check if there are any files currently being processed
      const isProcessing = folderAudioFiles[folderId].some(f => f.processing);
      
      // Check if there are files that still need prediction
      const needsPrediction = folderAudioFiles[folderId].some(f => f.needs_prediction && !f.processing);
      
      if (isProcessing) {
        console.log(`⏸️ [${standaloneId}] Folder ${folderName} is being processed, skipping reload`);
        return;
      }
      
      if (!needsPrediction) {
        console.log(`✅ [${standaloneId}] All files predicted for ${folderName}, using cache`);
        return;
      }
      
      console.log(`🔄 [${standaloneId}] Found ${folderAudioFiles[folderId].filter(f => f.needs_prediction).length} files still need prediction`);
    }

    try {
      console.log(`📂 [${standaloneId}] Loading folder: ${folderName} (forceRepredict: ${forceRepredict})`);
      
      const { timestamp, entries, standaloneNum } = await loadStandaloneFolderAudioWithPredictions({
        standaloneId,
        folderName
      });

      // Update state immediately with merged cache + waiting entries
      setFolderAudioFiles(prev => ({
        ...prev,
        [folderId]: entries
      }));

      const cachedCount = entries.filter(e => e.from_cache).length;
      const waitingCount = entries.filter(e => e.needs_prediction).length;
      console.log(`✅ [${standaloneId}] Loaded ${entries.length} files: ${cachedCount} cached, ${waitingCount} need prediction`);

      // Start SEQUENTIAL predictions for any entries that still need them
      const filesToPredict = entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.needs_prediction);

      if (filesToPredict.length > 0) {
        console.log(`🔬 [${standaloneId}] Starting SEQUENTIAL predictions for ${filesToPredict.length} files`);

        // Create new AbortController for this prediction batch
        abortControllerRef.current = new AbortController();
        const signal = abortControllerRef.current.signal;

        // Process predictions ONE BY ONE (sequentially)
        (async () => {
          for (const { entry, index } of filesToPredict) {
            // Check if cancelled
            if (signal.aborted) {
              console.log(`🚫 [${standaloneId}] Predictions cancelled - stopping at ${entry.file_name}`);
              break;
            }
            
            try {
              console.log(`🔬 [${standaloneId}] Predicting ${index + 1}/${filesToPredict.length}: ${entry.file_name}`);
              
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
              const updatedEntry = await predictStandaloneSingleAudio({
                standaloneId,
                standaloneNum,
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
              
              console.log(`✅ [${standaloneId}] Completed ${index + 1}/${filesToPredict.length}: ${entry.file_name}`);
            } catch (err) {
              // Skip abort errors (expected when cancelling)
              if (err instanceof Error && err.name === 'AbortError') {
                console.log(`🚫 [${standaloneId}] Prediction cancelled for ${entry.file_name}`);
                break;
              }
              
              console.error(`❌ [${standaloneId}] Prediction error for ${entry.file_name}:`, err);
              
              // Mark as error in UI
              setFolderAudioFiles(prev => {
                const updated = [...(prev[folderId] || [])];
                if (updated[index]) {
                  updated[index] = {
                    ...updated[index],
                    processing: false,
                    predicted_species: 'Error',
                    error: err instanceof Error ? err.message : 'Unknown error'
                  } as StandaloneFolderAudioEntry;
                }
                return { ...prev, [folderId]: updated };
              });
            }
          }
          console.log(`🎉 [${standaloneId}] All predictions completed for ${folderName}`);
        })();
      }
    } catch (error) {
      console.error(`❌ [${standaloneId}] Error loading folder:`, error);
      setFolderAudioFiles(prev => ({
        ...prev,
        [folderId]: []
      }));
    }
  };

  // Toggle folder expansion (COPIED FROM CLIENT CARD)
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

  // Re-predict a single audio file
  const repredictSingleFile = async (folder: any, file: StandaloneFolderAudioEntry) => {
    if (!folder || !file) return;
    
    // Extract timestamp from folder name: "standalone1_15082026_1430" -> "15082026_1430"
    const timestamp = folder.name.toLowerCase().split('_').slice(1).join('_');
    const standaloneNum = standaloneId.replace(/\D/g, '') || '1';
    
    // Update state to show loading
    setFolderAudioFiles(prev => ({
      ...prev,
      [folder.id]: prev[folder.id]?.map(f => 
        f.file_id === file.file_id ? { ...f, processing: true } : f
      ) || []
    }));

    try {
      const result = await predictStandaloneSingleAudio({
        standaloneId,
        standaloneNum,
        timestamp,
        audio: file
      });
      
      // Update state with new prediction
      setFolderAudioFiles(prev => ({
        ...prev,
        [folder.id]: prev[folder.id]?.map(f => 
          f.file_id === file.file_id ? result : f
        ) || []
      }));
    } catch (error) {
      console.error('Error re-predicting file:', error);
      // Reset predicting state
      setFolderAudioFiles(prev => ({
        ...prev,
        [folder.id]: prev[folder.id]?.map(f => 
          f.file_id === file.file_id ? { ...f, processing: false, error: 'Prediction failed' } : f
        ) || []
      }));
    }
  };

  // Subscribe to standalone predictions updates
  useEffect(() => {
    if (!expandedFolderId || !batHistory.length) return;
    
    const folder = batHistory.find(f => f.id === expandedFolderId);
    if (!folder) return;
    
    const unsubscribe = subscribeToStandalonePredictions(
      standaloneId,
      (predictions: any) => {
        if (!predictions) return;
        
        // Extract timestamp from folder name
        const timestamp = folder.name.toLowerCase().split('_').slice(1).join('_');
        const folderPredictions = predictions[timestamp];
        if (!folderPredictions) return;
        
        setFolderAudioFiles(prev => {
          const currentFiles = prev[expandedFolderId] || [];
          return {
            ...prev,
            [expandedFolderId]: currentFiles.map(file => {
              // Extract bat number from file_name: "bat_1014.wav" -> "1014"
              const batMatch = file.file_name.match(/bat[_]?(\d+)/i);
              const batNum = batMatch ? batMatch[1] : file.file_name.replace('.wav', '');
              const filePredictions = folderPredictions[batNum];
              if (filePredictions) {
                const predsArray = Object.keys(filePredictions)
                  .filter(key => !isNaN(parseInt(key)))
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(key => ({
                    species: filePredictions[key].s,
                    confidence: filePredictions[key].c
                  }));
                return { 
                  ...file, 
                  species: predsArray,
                  predicted_species: predsArray[0]?.species || 'Unknown',
                  confidence: predsArray[0]?.confidence || 0,
                  from_cache: true,
                  needs_prediction: false 
                };
              }
              return file;
            })
          };
        });
      }
    );
    
    return unsubscribe;
  }, [expandedFolderId, batHistory, standaloneId]);

  // Handle maximize for scheduled records
  const handleMaximizeScheduled = () => {
    // Convert scheduledRecords object to array format for the maximize page
    // Match the exact format used in the small table in StandaloneCard
    const recordsArray = Object.entries(scheduledRecords || {})
      .filter(([key]) => key !== '_placeholder')
      .map(([key, record]: [string, any]) => {
        // Parse the scheduleKey (ISO date string) to extract date and time
        const scheduleDateTime = new Date(key);
        const dateStr = scheduleDateTime.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric' 
        });
        const timeStr = scheduleDateTime.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        });
        const durationMin = Math.floor((record.duration_sec || 0) / 60);
        
        return {
          scheduleKey: key,
          date: dateStr,
          time: timeStr,
          duration: durationMin,
          status: record.status || 'pending'
        };
      });

    navigate(`/standalone/${standaloneId}/scheduled-recordings`, {
      state: {
        data: recordsArray,
        standaloneName,
        standaloneId
      }
    });
  };

  // Handle maximize for data history
  const handleMaximizeHistory = () => {
    navigate(`/standalone/${standaloneId}/data-history`, {
      state: {
        standaloneId,
        standaloneName,
        folders: batHistory
      }
    });
  };

  // Button handlers
  const handleConnect = async () => {
    try {
      setStatusCard({ show: true, message: 'Connecting...', type: 'loading' });
      localStorage.setItem(`connectingStandalone:${standaloneId}`, standaloneId);
      await setStandaloneConnectCommand(standaloneId);
    } catch (error) {
      console.error('Failed to send connect command:', error);
      setStatusCard({ show: false, message: '', type: 'loading' });
    }
  };

  const handleLocation = async () => {
    try {
      setStatusCard({ show: true, message: 'Getting location...', type: 'loading' });
      localStorage.setItem(`locatingStandalone:${standaloneId}`, standaloneId);
      await setStandaloneLocationCommand(standaloneId);
    } catch (error) {
      console.error('Failed to send location command:', error);
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
      setShowInstantModal(false);
      setInstantDuration('1');
      const durationSeconds = durationMinutes * 60;
      setStatusCard({ show: true, message: 'Starting recording...', type: 'loading' });
      localStorage.setItem(`instantStandalone:${standaloneId}`, standaloneId);
      await setStandaloneInstantCommand(standaloneId, durationSeconds);
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
      const scheduleKey = `${scheduleDate}T${scheduleTime}:00`;
      const durationSeconds = durationMinutes * 60;
      
      setShowScheduleModal(false);
      setScheduleDuration('5');
      setScheduleDate('');
      setScheduleTime('');
      
      setStatusCard({ show: true, message: 'Scheduling...', type: 'loading' });
      localStorage.setItem(`schedulingStandalone:${standaloneId}`, standaloneId);
      
      await setStandaloneScheduleCommand(standaloneId, durationSeconds, scheduleKey);
      
      // Listen for status change to "scheduled"
      const scheduleRecordRef = ref(database, `standalones/${standaloneId}/scheduled_records/${scheduleKey}`);
      const unsubscribe = onValue(scheduleRecordRef, (snapshot) => {
        const record = snapshot.val();
        if (record && record.status === 'scheduled') {
          // Show success when status becomes "scheduled"
          setStatusCard({ show: true, message: 'Successfully Scheduled', type: 'success' });
          localStorage.setItem(`scheduleSuccessAt:${standaloneId}`, new Date().toISOString());
          
          // Unsubscribe after success
          unsubscribe();
          
          setTimeout(async () => {
            try {
              const now = new Date().toISOString();
              const modeRef = ref(database, `standalones/${standaloneId}/mode`);
              await update(modeRef, { type: 'idle', duration_sec: 0, schedule_key: '', updated_at: now });
            } catch (error) {
              console.error('Failed to reset after schedule:', error);
            } finally {
              setStatusCard({ show: false, message: '', type: 'loading' });
              localStorage.removeItem(`scheduleSuccessAt:${standaloneId}`);
              localStorage.removeItem(`schedulingStandalone:${standaloneId}`);
            }
          }, 5000);
        }
      });
    } catch (error) {
      console.error('Failed to process schedule:', error);
      setStatusCard({ show: false, message: '', type: 'loading' });
    }
  };

  const handleUpload = async (scheduleKey: string) => {
    try {
      const now = new Date().toISOString();
      
      // Store in localStorage first
      try {
        localStorage.setItem(`uploadingStandalone:${standaloneId}`, standaloneId);
        localStorage.setItem(`uploadingKey:${standaloneId}`, scheduleKey);
      } catch {}
      
      // Update local mode state immediately for instant UI feedback
      setMode({
        type: 'upload_scheduled',
        duration_sec: 0,
        schedule_key: scheduleKey,
        updated_at: now
      });
      
      // Show status card after mode state is set
      setStatusCard({ show: true, message: 'Uploading...', type: 'progress' });
      
      // Update mode to upload_scheduled in Firebase
      const modeRef = ref(database, `standalones/${standaloneId}/mode`);
      await update(modeRef, {
        type: 'upload_scheduled',
        duration_sec: 0,
        schedule_key: scheduleKey,
        updated_at: now
      });
      
      // Send command to Firebase
      await setStandaloneUploadCommand(standaloneId, scheduleKey);
      console.log('Upload command sent for schedule:', scheduleKey);
    } catch (error) {
      console.error('Failed to send upload command:', error);
      setStatusCard({ show: false, message: '', type: 'loading' });
    }
  };

  const handleResetStandalone = async () => {
    if (window.confirm(`Are you sure you want to reset ${standaloneName}?`)) {
      try {
        setMode({ type: 'idle', duration_sec: 0, schedule_key: '', updated_at: new Date().toISOString() });
        setShowStandaloneMenu(false);
        setStatusCard({ show: false, message: '', type: 'loading' });
        await resetStandalone(standaloneId);
        console.log('Standalone reset successfully');
      } catch (error) {
        console.error('Failed to reset standalone:', error);
      }
    }
  };

  const handleEditLocationClick = () => {
    setEditLat(standaloneInfo.lat?.toString() || '0');
    setEditLong(standaloneInfo.long?.toString() || '0');
    setEditLocationName(standaloneInfo.location_name || 'Not set');
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
      
      const standaloneInfoRef = ref(database, `standalones/${standaloneId}/standaloneinfo`);
      await update(standaloneInfoRef, {
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

  // Format location display
  const locationDisplay = standaloneInfo.location_name && standaloneInfo.location_name !== 'Not set'
    ? standaloneInfo.location_name
    : 'Location not set';
  const hasLocation = standaloneInfo.lat && standaloneInfo.long && 
    standaloneInfo.lat !== 0 && standaloneInfo.long !== 0;

  return (
    <div className={`bg-white rounded-xl border overflow-hidden shadow-sm transition-all duration-300 ${
      isBusy ? 'border-amber-500 ring-2 ring-amber-200' : 'border-slate-700'
    }`}>
      {/* Standalone Header - Dropdown like server */}
      <div
        className="bg-[#0D6979] px-4 py-4 text-white cursor-pointer hover:bg-[#0a5460] transition-all"
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
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-base">{standaloneName}</h2>
                {isBusy && (
                  <span className="px-2 py-0.5 bg-amber-400 text-amber-900 text-xs rounded-full font-medium">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-cyan-100 text-xs">
                {hasLocation ? (
                  <a
                    href={`https://www.google.com/maps?q=${standaloneInfo.lat},${standaloneInfo.long}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-white"
                    onClick={(e) => e.stopPropagation()}
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
                  className="ml-1 p-0.5 hover:bg-cyan-500/30 rounded transition-colors"
                  title="Edit location"
                >
                  <Edit className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Four Action Buttons */}
            <button
              onClick={(e) => { e.stopPropagation(); handleConnect(); }}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDisabled
                  ? 'bg-gray-400/30 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500/20 text-blue-100 hover:bg-blue-500/30 border border-blue-400/30'
              }`}
            >
              <Link className="w-4 h-4" />
              Connect
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); handleLocation(); }}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDisabled
                  ? 'bg-gray-400/30 text-gray-400 cursor-not-allowed'
                  : 'bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30 border border-cyan-400/30'
              }`}
            >
              <MapPin className="w-4 h-4" />
              Location
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); setShowInstantModal(true); }}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDisabled
                  ? 'bg-gray-400/30 text-gray-400 cursor-not-allowed'
                  : 'bg-green-500/20 text-green-100 hover:bg-green-500/30 border border-green-400/30'
              }`}
            >
              <PlayCircle className="w-4 h-4" />
              Instant
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); setShowScheduleModal(true); }}
              disabled={isDisabled}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isDisabled
                  ? 'bg-gray-400/30 text-gray-400 cursor-not-allowed'
                  : 'bg-orange-500/20 text-orange-100 hover:bg-orange-500/30 border border-orange-400/30'
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
                  setShowStandaloneMenu(!showStandaloneMenu);
                }}
                className="w-8 h-8 rounded-md border border-cyan-400/30 flex items-center justify-center transition-colors hover:bg-cyan-500/30 text-cyan-100 hover:text-white"
                title="Standalone options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {showStandaloneMenu && (
                <div 
                  className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-[150px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleResetStandalone();
                    }}
                    className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                  >
                    Reset Standalone
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
              disabled={isDisabled}
              className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                isDisabled
                  ? 'border-purple-400/30 text-purple-400 cursor-not-allowed'
                  : 'border-purple-400/30 text-purple-200 hover:bg-purple-500/30 hover:text-red-300'
              }`}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="p-4">
          {/* Status Card */}
          {statusCard.show && (
            <>
              {statusCard.type === 'progress' ? (
                <div className="mb-3 px-4 py-4 rounded-lg text-sm bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200">
                  {/* Progress Flow for instant and upload_scheduled */}
                  <div className="space-y-3">
                    {/* Connecting Stage - for both instant and upload_scheduled */}
                    {(mode.type === 'instant' || mode.type === 'upload_scheduled') && (
                      <div className="flex items-center gap-3">
                        {activeStatus.status === 'idle' || (activeStatus.status !== 'recording' && activeStatus.status !== 'uploading' && activeStatus.status !== 'completed') ? (
                          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )}
                        <span className="font-medium text-gray-700">Connecting...</span>
                        
                        {/* Schedule info badges for upload_scheduled mode - show during connecting */}
                        {mode.type === 'upload_scheduled' && mode.schedule_key && (
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
                      </div>
                    )}
                    
                    {/* Recording Stage - only for instant */}
                    {mode.type === 'instant' && (activeStatus.status === 'recording' || activeStatus.status === 'uploading' || activeStatus.status === 'completed') && (
                      <div className="flex items-center gap-3">
                        {activeStatus.status === 'recording' ? (
                          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )}
                        <span className="font-medium text-gray-700">Recording</span>
                      </div>
                    )}
                    
                    {/* Uploading Stage - for both instant and upload_scheduled */}
                    {(activeStatus.status === 'uploading' || activeStatus.status === 'completed') && (
                      <div className="flex items-center gap-3">
                        {activeStatus.status === 'uploading' ? (
                          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        )}
                        <span className="font-medium text-gray-700">Uploading to DB</span>
                        
                        {/* File/size badges - show during uploading for both instant and upload_scheduled */}
                        {activeStatus.status === 'uploading' && (
                          <div className="flex items-center gap-2 ml-auto">
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {activeStatus.total_files} files
                            </span>
                            <span className="px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium">
                              {formatBytes(activeStatus.total_size_bytes)}
                            </span>
                          </div>
                        )}
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
                  {/* Check if it's a scheduled recording status */}
                  {hasActiveScheduledRecording ? (
                    <>
                      {(() => {
                        const activeRecord = Object.entries(scheduledRecords).find(
                          ([_, record]: [string, any]) => record.status === 'recording'
                        );
                        if (activeRecord) {
                          const [scheduleKey, record] = activeRecord as [string, any];
                          const scheduleDateTime = new Date(scheduleKey);
                          const dateStr = scheduleDateTime.toLocaleDateString('en-US', { 
                            month: 'short', 
                            day: 'numeric', 
                            year: 'numeric' 
                          });
                          const timeStr = scheduleDateTime.toLocaleTimeString('en-US', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                          });
                          const durationMin = Math.floor((record.duration_sec || 0) / 60);
                          
                          return (
                            <div className="flex items-center gap-3">
                              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                              <span>Recording</span>
                              <div className="flex items-center gap-2 ml-auto">
                                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-700 rounded-md text-[10px] font-medium border border-blue-400/30">
                                  {scheduleKey}
                                </span>
                                <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-700 rounded-md text-[10px] font-medium border border-indigo-400/30">
                                  {dateStr}
                                </span>
                                <span className="px-2 py-0.5 bg-purple-500/20 text-purple-700 rounded-md text-[10px] font-medium border border-purple-400/30">
                                  {timeStr}
                                </span>
                                <span className="px-2 py-0.5 bg-pink-500/20 text-pink-700 rounded-md text-[10px] font-medium border border-pink-400/30">
                                  {durationMin}min
                                </span>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      {statusCard.type === 'loading' ? (
                        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      ) : (
                        <CheckCircle className="w-5 h-5" />
                      )}
                      <span>{statusCard.message}</span>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Scheduled Records Table */}
          {Object.keys(scheduledRecords).filter(key => key !== '_placeholder').length > 0 && (
            <div className="border-t pt-3 mb-3">
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
                          <th className="border border-slate-300 px-2 py-1.5 text-center font-semibold text-slate-700">Upload</th>
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
                                    record.status === 'ready_to_upload' ? 'bg-green-100 text-green-700' :
                                    record.status === 'uploading' ? 'bg-orange-100 text-orange-700' :
                                    record.status === 'completed' ? 'bg-purple-100 text-purple-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}>
                                    {record.status}
                                  </span>
                                </td>
                                <td className="border border-slate-300 px-2 py-1.5 text-center">
                                  <button
                                    onClick={() => handleUpload(scheduleKey)}
                                    disabled={record.status !== 'ready_to_upload' || isDisabled || record.status === 'completed'}
                                    className={`px-2 py-1 rounded text-[10px] ${
                                      record.status === 'ready_to_upload' && !isDisabled
                                        ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                    }`}
                                    title={
                                      record.status === 'completed' ? 'Completed' :
                                      record.status === 'ready_to_upload' && !isDisabled ? 'Upload to DB' : 
                                      'Upload (disabled)'
                                    }
                                  >
                                    Upload
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Pagination */}
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
                    No standalone recording folders found
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
                      {(() => {
                        const startIdx = historyPage * HISTORY_PAGE_SIZE;
                        const endIdx = startIdx + HISTORY_PAGE_SIZE;
                        const paginatedHistory = batHistory.slice(startIdx, endIdx);
                        
                        return paginatedHistory.map((folder, index) => (
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
                                    <Loader2 className="w-3 h-3 animate-spin text-gray-600" />
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
                                onClick={() => navigate(`/standalone/${standaloneId}/folder/${encodeURIComponent(folder.name)}`, {
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
                                          {folderAudioFiles[folder.id].map((audio: StandaloneFolderAudioEntry, audioIdx: number) => (
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
                                                      Processing...
                                                    </span>
                                                  ) : audio.predicted_species === 'Waiting' ? (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">
                                                      Waiting...
                                                    </span>
                                                  ) : audio.predicted_species === 'No species detected' ? (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                                      No species detected
                                                    </span>
                                                  ) : audio.species && audio.species.length > 0 ? (
                                                    <>
                                                      {audio.species.slice(0, 5).map((sp: any, spIdx: number) => (
                                                        <span 
                                                          key={spIdx}
                                                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${
                                                            spIdx === 0 ? 'bg-emerald-100 text-emerald-700' :
                                                            spIdx === 1 ? 'bg-blue-100 text-blue-700' :
                                                            spIdx === 2 ? 'bg-purple-100 text-purple-700' :
                                                            spIdx === 3 ? 'bg-orange-100 text-orange-700' :
                                                            'bg-pink-100 text-pink-700'
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
                                                  ) : audio.error ? (
                                                    <span className="text-red-500 italic text-[10px]" title={audio.error}>
                                                      Processing failed
                                                    </span>
                                                  ) : (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-yellow-100 text-yellow-700">
                                                      Waiting...
                                                    </span>
                                                  )}
                                                </div>
                                              </td>
                                              <td className="border border-emerald-200 px-1 py-1 text-center">
                                                {!audio.processing && (
                                                  <button
                                                    onClick={(e) => {
                                                      e.stopPropagation();
                                                      repredictSingleFile(folder, audio);
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
                        ));
                      })()}
                    </tbody>
                  </table>
                </div>
                
                {/* Pagination Controls */}
                {(() => {
                  const totalHistoryPages = Math.ceil(batHistory.length / HISTORY_PAGE_SIZE);
                  return totalHistoryPages > 1 ? (
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
                  ) : null;
                })()}
                </>
                )}
              </>
            )}
          </div>
        </div>
      )}

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
            <h3 className="text-lg font-bold mb-4">Edit Standalone Location</h3>
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
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700"
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
  );
};
