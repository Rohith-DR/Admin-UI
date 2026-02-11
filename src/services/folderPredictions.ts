/**
 * UNIFIED FOLDER PREDICTIONS SERVICE
 * 
 * This is the SINGLE source of truth for:
 * 1. Loading folder audio files with cached predictions from Firebase
 * 2. Running predictions on audio files and saving to Firebase
 * 3. Ensuring all three views (ClientCard, DataHistoryMaximizePage, BatFolderDetailPage)
 *    use the exact same logic and Firebase paths
 * 
 * Firebase Structure:
 *   servers/{serverId}/clients/{clientId}/predictions/{timestamp}/{batNumber}/0,1,2...
 *   Example: servers/server1/clients/client1/predictions/23122025_1656/1014/0/{s,c}
 */

import { getFolderPredictions, savePrediction } from '../firebase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://bcitbackend1-drcveyacfxadeffs.koreacentral-01.azurewebsites.net';

// ============================================================================
// TYPES
// ============================================================================

export interface FolderAudioEntry {
  file_id: string;
  file_name: string;
  size: number;
  species: Array<{ species: string; confidence: number }>;
  predicted_species: string;
  confidence: number;
  processing: boolean;
  from_cache: boolean;
  needs_prediction: boolean;
  error?: string;
}

export interface LoadFolderArgs {
  serverId: string;   // Format: "server1" or "Server 1" or "1" - will be normalized
  clientId: string;   // Format: "client1" or "Client 1" or "1" - will be normalized
  folderName: string; // Full folder name: "server1_client1_23122025_1656"
}

export interface LoadedFolderData {
  timestamp: string;      // Just the timestamp part: "23122025_1656"
  entries: FolderAudioEntry[];
  serverNum: string;      // Just the number: "1"
  clientNum: string;      // Just the number: "1"
}

export interface PredictFileArgs {
  serverId: string;   // Format: "server1" or any - will be normalized
  clientId: string;   // Format: "client1" or any - will be normalized
  serverNum: string;  // Just the number: "1"
  clientNum: string;  // Just the number: "1"
  timestamp: string;  // Folder timestamp: "23122025_1656"
  audio: FolderAudioEntry;
  signal?: AbortSignal; // For cancelling requests when navigating away
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract server number from various formats
 * "server1" -> "1"
 * "Server 1" -> "1"
 * "1" -> "1"
 */
export const extractServerNum = (input: string): string => {
  if (!input) return '1';
  const match = input.match(/(\d+)/);
  return match ? match[1] : '1';
};

/**
 * Extract client number from various formats
 * "client1" -> "1"
 * "Client 1" -> "1"
 * "1" -> "1"
 */
export const extractClientNum = (input: string): string => {
  if (!input) return '1';
  const match = input.match(/(\d+)/);
  return match ? match[1] : '1';
};

/**
 * Normalize serverId to consistent format: "server1"
 */
export const normalizeServerId = (input: string): string => {
  const num = extractServerNum(input);
  return `server${num}`;
};

/**
 * Normalize clientId to consistent format: "client1"
 */
export const normalizeClientId = (input: string): string => {
  const num = extractClientNum(input);
  return `client${num}`;
};

/**
 * Extract timestamp from folder name
 * "server1_client1_23122025_1656" -> "23122025_1656"
 */
export const extractTimestamp = (folderName: string): string => {
  const parts = folderName.toLowerCase().split('_');
  // Skip "serverX" and "clientX" parts
  return parts.slice(2).join('_');
};

// ============================================================================
// MAIN API FUNCTIONS
// ============================================================================

/**
 * Load folder audio files with cached predictions from Firebase.
 * 
 * This function:
 * 1. Loads existing predictions from Firebase
 * 2. Lists audio files from Google Drive
 * 3. Merges them: cached files show species immediately, new files are marked "Waiting"
 * 
 * @param args - serverId, clientId, folderName
 * @returns LoadedFolderData with entries array
 */
export const loadFolderAudioWithPredictions = async (
  args: LoadFolderArgs
): Promise<LoadedFolderData> => {
  const { serverId, clientId, folderName } = args;

  // Normalize IDs to consistent format
  const normalizedServerId = normalizeServerId(serverId);
  const normalizedClientId = normalizeClientId(clientId);
  const serverNum = extractServerNum(serverId);
  const clientNum = extractClientNum(clientId);
  const timestamp = extractTimestamp(folderName);

  console.log(`📂 [folderPredictions] Loading folder: ${folderName}`);
  console.log(`   serverId: ${normalizedServerId}, clientId: ${normalizedClientId}, timestamp: ${timestamp}`);

  // Step 1: Load existing predictions from Firebase
  let existingPredictions: any = {};
  try {
    console.log(`🔍 [folderPredictions] Step 1: Checking Firebase for cached predictions...`);
    existingPredictions = await getFolderPredictions(normalizedServerId, normalizedClientId, timestamp);
    const cacheCount = Object.keys(existingPredictions).length;
    console.log(`🔍 [folderPredictions] Found ${cacheCount} cached predictions for ${timestamp}`);
    if (cacheCount > 0) {
      console.log(`🔍 [folderPredictions] Cached files:`, Object.keys(existingPredictions));
    }
  } catch (err) {
    console.warn('[folderPredictions] Could not load existing predictions:', err);
  }

  // Step 2: List audio files from Google Drive
  const apiUrl = `${API_BASE_URL}/api/folder/files`;
  
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      server_num: serverNum,
      client_num: clientNum,
      folder_timestamp: timestamp
    })
  });

  if (!response.ok) {
    throw new Error(`Failed to list files: ${response.status}`);
  }

  const data = await response.json();
  console.log(`📋 [folderPredictions] Found ${data.total_files || 0} audio files in Drive`);

  // Step 3: Merge predictions with file list
  const entries: FolderAudioEntry[] = (data.files || []).map((file: any) => {
    const existing = existingPredictions[file.file_name];
    if (existing && existing.allSpecies && existing.allSpecies.length > 0) {
      // File has cached prediction
      return {
        file_id: file.file_id,
        file_name: file.file_name,
        size: file.size || 0,
        species: existing.allSpecies,
        predicted_species: existing.species || existing.allSpecies[0]?.species || 'Unknown',
        confidence: existing.confidence || existing.allSpecies[0]?.confidence || 0,
        processing: false,
        from_cache: true,
        needs_prediction: false
      };
    }
    // File needs prediction
    return {
      file_id: file.file_id,
      file_name: file.file_name,
      size: file.size || 0,
      species: [],
      predicted_species: 'Waiting',
      confidence: 0,
      processing: false,
      from_cache: false,
      needs_prediction: true
    };
  });

  const cachedCount = entries.filter(e => e.from_cache).length;
  const waitingCount = entries.filter(e => e.needs_prediction).length;
  console.log(`✅ [folderPredictions] Loaded ${entries.length} files (${cachedCount} cached, ${waitingCount} waiting)`);

  return {
    timestamp,
    entries,
    serverNum,
    clientNum
  };
};

/**
 * Predict species for a single audio file and save to Firebase.
 * 
 * This function:
 * 1. Calls the backend /api/audio/predict endpoint
 * 2. On success, saves the prediction to Firebase
 * 3. Returns the updated FolderAudioEntry
 * 
 * @param args - serverId, clientId, serverNum, clientNum, timestamp, audio
 * @returns Updated FolderAudioEntry with prediction results
 */
export const predictSingleAudio = async (
  args: PredictFileArgs
): Promise<FolderAudioEntry> => {
  const { serverId, clientId, serverNum, clientNum, timestamp, audio, signal } = args;

  // Normalize IDs
  const normalizedServerId = normalizeServerId(serverId);
  const normalizedClientId = normalizeClientId(clientId);

  console.log(`🔬 [folderPredictions] Predicting: ${audio.file_name}`);
  console.log(`   serverId: ${normalizedServerId}, clientId: ${normalizedClientId}, timestamp: ${timestamp}`);

  const predictApiUrl = `${API_BASE_URL}/api/audio/predict`;

  const response = await fetch(predictApiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: audio.file_id,
      file_name: audio.file_name,
      server_num: serverNum,
      client_num: clientNum,
      folder_timestamp: timestamp
    }),
    signal // Pass abort signal for cancellation
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`❌ [folderPredictions] Prediction failed: ${response.status}`, errorText);
    throw new Error(`Prediction failed: ${response.status}`);
  }

  const result = await response.json();

  // Save to Firebase if prediction was successful
  if (result.success && result.species && result.species.length > 0) {
    // Extract bat number from filename: "bat_1014.wav" -> "1014"
    const batIdMatch = audio.file_name.match(/bat_(\d+)/i);
    const batNumber = batIdMatch ? batIdMatch[1] : audio.file_name.replace('.wav', '');

    console.log(`💾 [folderPredictions] Saving to Firebase: ${normalizedServerId}/${normalizedClientId}/${timestamp}/${batNumber}`);

    try {
      await savePrediction(
        normalizedServerId,
        normalizedClientId,
        batNumber,
        result.species[0].species,
        result.species[0].confidence,
        new Date().toISOString(),
        result.call_parameters?.peak_freq || '',
        result.species,
        timestamp
      );
      console.log(`✅ [folderPredictions] Saved prediction for ${audio.file_name}`);
    } catch (err) {
      console.error('[folderPredictions] Firebase save error:', err);
    }
  }

  // Return updated entry
  return {
    file_id: audio.file_id,
    file_name: audio.file_name,
    size: audio.size,
    species: result.species || [],
    predicted_species:
      result.success && result.species && result.species.length > 0
        ? result.species[0].species
        : 'Error',
    confidence:
      result.success && result.species && result.species.length > 0
        ? result.species[0].confidence
        : 0,
    processing: false,
    from_cache: false,
    needs_prediction: false,
    error: result.success ? undefined : result.message || 'Prediction failed'
  };
};
