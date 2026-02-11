// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, update, remove, onValue, off, get } from "firebase/database";
import { getAuth, signInAnonymously } from "firebase/auth";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDDCIyLe28ivoIzohTUwBzb3LVKfLtJxBg",
  authDomain: "bcit-d5764.firebaseapp.com",
  databaseURL: "https://bcit-d5764-default-rtdb.firebaseio.com",
  projectId: "bcit-d5764",
  storageBucket: "bcit-d5764.firebasestorage.app",
  messagingSenderId: "864766820084",
  appId: "1:864766820084:web:d524e84073e1924e5be8a1",
  measurementId: "G-0KZX261EZY"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// Sign in anonymously for database access
signInAnonymously(auth)
  .then(() => {
    console.log('Signed in anonymously to Firebase');
  })
  .catch((error) => {
    console.error('Anonymous sign-in failed:', error);
  });

// ==================== SERVER FUNCTIONS ====================

/**
 * Create a new server with the new schema
 */
export const createServer = async (serverId: string) => {
  try {
    const serverRef = ref(database, `servers/${serverId}`);
    await set(serverRef, {
      server_info: {
        server_lat: 0,
        server_long: 0,
        server_location_name: "Not set"
      },
      mode: {
        type: "idle",
        target_client_id: "",
        duration_sec: 0,
        schedule_key: "",
        updated_at: new Date().toISOString()
      },
      active_status: {
        status: "idle",
        progress: 0,
        total_files: 0,
        received_files: 0,
        total_size_bytes: 0,
        transferred_bytes: 0
      },
      connection_status: false,
      clients: {}
    });
    console.log('Server created:', serverId);
  } catch (error) {
    console.error('Failed to create server:', error);
    throw error;
  }
};

/**
 * Delete a server
 */
/**
 * Delete a server
 */
export const deleteServer = async (serverId: string) => {
  try {
    console.log(`🗑️ Attempting to delete server: ${serverId}`);
    const serverRef = ref(database, `servers/${serverId}`);
    
    // First check if server exists
    const snapshot = await get(serverRef);
    if (!snapshot.exists()) {
      console.log(`⚠️ Server ${serverId} does not exist in Firebase`);
      return;
    }
    
    console.log(`📋 Server ${serverId} exists, proceeding with deletion...`);
    await remove(serverRef);
    
    // Verify deletion
    const verifySnapshot = await get(serverRef);
    if (verifySnapshot.exists()) {
      console.error(`❌ Server ${serverId} still exists after deletion attempt!`);
      throw new Error('Server deletion failed - server still exists');
    }
    
    console.log(`✅ Server ${serverId} successfully deleted from Firebase`);
  } catch (error) {
    console.error(`❌ Failed to delete server ${serverId}:`, error);
    throw error;
  }
};

/**
 * Reset a server - resets all keys under the server to their initial state while preserving clients AND server location
 */
export const resetServer = async (serverId: string) => {
  try {
    // Get existing clients
    const clientsRef = ref(database, `servers/${serverId}/clients`);
    const clientsSnapshot = await new Promise<any>((resolve) => {
      onValue(clientsRef, (snapshot) => {
        resolve(snapshot.val() || {});
      }, { onlyOnce: true });
    });

    // Get existing server location
    const serverInfoRef = ref(database, `servers/${serverId}/server_info`);
    const serverInfoSnapshot = await new Promise<any>((resolve) => {
      onValue(serverInfoRef, (snapshot) => {
        resolve(snapshot.val() || { server_lat: 0, server_long: 0, server_location_name: "Not set" });
      }, { onlyOnce: true });
    });

    // Build sanitized clients: preserve client_info, scheduled_records AND predictions per client
    const sanitizedClients: any = {};
    Object.keys(clientsSnapshot || {}).forEach((cid) => {
      const clientNode = clientsSnapshot[cid] || {};
      if (clientNode.client_info) {
          const info = { ...(clientNode.client_info || {}) } as any;
          if (typeof info.location_updated === 'undefined') {
            info.location_updated = false;
          }
          sanitizedClients[cid] = { 
            client_info: info,
            scheduled_records: clientNode.scheduled_records || { _placeholder: "No scheduled records yet" },
            predictions: clientNode.predictions || {}
          };
      } else {
        sanitizedClients[cid] = {
          scheduled_records: clientNode.scheduled_records || { _placeholder: "No scheduled records yet" },
          predictions: clientNode.predictions || {}
        };
      }
    });

    // Reset server while keeping server location and client locations
    const serverRef = ref(database, `servers/${serverId}`);
    await set(serverRef, {
      server_info: serverInfoSnapshot,
      mode: {
        type: "idle",
        target_client_id: "",
        duration_sec: 0,
        schedule_key: "",
        updated_at: new Date().toISOString()
      },
      active_status: {
        status: "idle",
        progress: 0,
        total_files: 0,
        received_files: 0,
        total_size_bytes: 0,
        transferred_bytes: 0
      },
      connection_status: false,
      clients: sanitizedClients
    });
    console.log('Server reset (locations preserved):', serverId);
  } catch (error) {
    console.error('Failed to reset server:', error);
    throw error;
  }
};

/**
 * Refresh server data - triggers a re-fetch of server data from Firebase
 * This is achieved by updating a timestamp, which triggers real-time listeners
 */
export const refreshServerData = async (serverId: string) => {
  try {
    const modeRef = ref(database, `servers/${serverId}/mode`);
    await update(modeRef, {
      updated_at: new Date().toISOString()
    });
    console.log('Server data refresh triggered:', serverId);
  } catch (error) {
    console.error('Failed to refresh server data:', error);
    throw error;
  }
};

/**
 * Load all servers
 */
export const loadAllServers = (callback: (servers: any) => void) => {
  const serversRef = ref(database, 'servers');
  onValue(serversRef, (snapshot) => {
    const data = snapshot.val();
    callback(data || {});
  });
  return () => off(serversRef);
};

// ==================== STANDALONE FUNCTIONS ====================

/**
 * Create a new standalone
 */
export const createStandalone = async (standaloneId: string, location?: { lat: number; long: number; name: string }) => {
  try {
    const standaloneRef = ref(database, `standalones/${standaloneId}`);
    await set(standaloneRef, {
      standaloneinfo: {
        lat: location?.lat || 0,
        long: location?.long || 0,
        location_name: location?.name || "Not set",
        location_updated: false
      },
      mode: {
        type: "idle",
        duration_sec: 0,
        schedule_key: "",
        updated_at: new Date().toISOString()
      },
      active_status: {
        status: "idle",
        progress: 0,
        total_files: 0,
        total_size_bytes: 0
      },
      connection_status: false,
      scheduled_records: {
        _placeholder: "No scheduled records yet"
      },
      predictions: {}
    });
    console.log('Standalone created:', standaloneId);
  } catch (error) {
    console.error('Failed to create standalone:', error);
    throw error;
  }
};

/**
 * Delete a standalone
 */
export const deleteStandalone = async (standaloneId: string) => {
  try {
    console.log(`🗑️ Attempting to delete standalone: ${standaloneId}`);
    const standaloneRef = ref(database, `standalones/${standaloneId}`);
    
    const snapshot = await get(standaloneRef);
    if (!snapshot.exists()) {
      console.log(`⚠️ Standalone ${standaloneId} does not exist in Firebase`);
      return;
    }
    
    console.log(`📋 Standalone ${standaloneId} exists, proceeding with deletion...`);
    await remove(standaloneRef);
    
    const verifySnapshot = await get(standaloneRef);
    if (verifySnapshot.exists()) {
      console.error(`❌ Standalone ${standaloneId} still exists after deletion attempt!`);
      throw new Error('Standalone deletion failed - standalone still exists');
    }
    
    console.log(`✅ Standalone ${standaloneId} successfully deleted from Firebase`);
  } catch (error) {
    console.error(`❌ Failed to delete standalone ${standaloneId}:`, error);
    throw error;
  }
};

/**
 * Reset a standalone - resets mode, active_status, connection_status while preserving standaloneinfo, predictions, scheduled_records
 */
export const resetStandalone = async (standaloneId: string) => {
  try {
    const standaloneRef = ref(database, `standalones/${standaloneId}`);
    
    // Get existing data to preserve
    const [infoSnapshot, recordsSnapshot, predictionsSnapshot] = await Promise.all([
      new Promise<any>((resolve) => {
        const infoRef = ref(database, `standalones/${standaloneId}/standaloneinfo`);
        onValue(infoRef, (snapshot) => {
          resolve(snapshot.val() || { lat: 0, long: 0, location_name: "Not set", location_updated: false });
        }, { onlyOnce: true });
      }),
      new Promise<any>((resolve) => {
        const recordsRef = ref(database, `standalones/${standaloneId}/scheduled_records`);
        onValue(recordsRef, (snapshot) => {
          resolve(snapshot.val() || { _placeholder: "No scheduled records yet" });
        }, { onlyOnce: true });
      }),
      new Promise<any>((resolve) => {
        const predictionsRef = ref(database, `standalones/${standaloneId}/predictions`);
        onValue(predictionsRef, (snapshot) => {
          resolve(snapshot.val() || {});
        }, { onlyOnce: true });
      })
    ]);

    // Ensure location_updated is set
    const info = { ...(infoSnapshot || {}) } as any;
    if (typeof info.location_updated === 'undefined') {
      info.location_updated = false;
    }

    // Reset standalone while preserving standaloneinfo, scheduled_records, and predictions
    await set(standaloneRef, {
      standaloneinfo: info,
      scheduled_records: recordsSnapshot,
      predictions: predictionsSnapshot,
      mode: {
        type: "idle",
        duration_sec: 0,
        schedule_key: "",
        updated_at: new Date().toISOString()
      },
      active_status: {
        status: "idle",
        progress: 0,
        total_files: 0,
        total_size_bytes: 0
      },
      connection_status: false
    });
    
    console.log('Standalone reset (info, scheduled records, and predictions preserved):', standaloneId);
  } catch (error) {
    console.error('Failed to reset standalone:', error);
    throw error;
  }
};

/**
 * Load all standalones from Firebase
 */
export const loadAllStandalones = (callback: (standalones: any) => void) => {
  const standalonesRef = ref(database, 'standalones');
  onValue(standalonesRef, (snapshot) => {
    const data = snapshot.val();
    callback(data || {});
  });
  return () => off(standalonesRef);
};

// ==================== STANDALONE BUTTON COMMANDS ====================

/**
 * STANDALONE LOCATION BUTTON
 */
export const setStandaloneLocationCommand = async (standaloneId: string) => {
  try {
    const modeRef = ref(database, `standalones/${standaloneId}/mode`);
    await update(modeRef, {
      type: "location",
      updated_at: new Date().toISOString()
    });
    console.log('Standalone location command sent');
  } catch (error) {
    console.error('Failed to send standalone location command:', error);
    throw error;
  }
};

/**
 * STANDALONE CONNECT BUTTON
 */
export const setStandaloneConnectCommand = async (standaloneId: string) => {
  try {
    const modeRef = ref(database, `standalones/${standaloneId}/mode`);
    await update(modeRef, {
      type: "connect",
      updated_at: new Date().toISOString()
    });
    console.log('Standalone connect command sent');
  } catch (error) {
    console.error('Failed to send standalone connect command:', error);
    throw error;
  }
};

/**
 * STANDALONE INSTANT BUTTON
 */
export const setStandaloneInstantCommand = async (standaloneId: string, durationSec: number) => {
  try {
    const modeRef = ref(database, `standalones/${standaloneId}/mode`);
    await update(modeRef, {
      type: "instant",
      duration_sec: durationSec,
      updated_at: new Date().toISOString()
    });
    console.log('Standalone instant command sent');
  } catch (error) {
    console.error('Failed to send standalone instant command:', error);
    throw error;
  }
};

/**
 * STANDALONE SCHEDULE BUTTON
 */
export const setStandaloneScheduleCommand = async (
  standaloneId: string,
  durationSec: number,
  scheduleKey: string
) => {
  try {
    const now = new Date().toISOString();
    
    const modeRef = ref(database, `standalones/${standaloneId}/mode`);
    await update(modeRef, {
      type: "schedule",
      duration_sec: durationSec,
      schedule_key: scheduleKey,
      updated_at: now
    });
    
    // Create scheduled_records entry
    const scheduleRecordRef = ref(database, `standalones/${standaloneId}/scheduled_records/${scheduleKey}`);
    await update(scheduleRecordRef, {
      duration_sec: durationSec,
      status: "pending",
      created_at: now
    });
    
    console.log('Standalone schedule command sent and record created');
  } catch (error) {
    console.error('Failed to send standalone schedule command:', error);
    throw error;
  }
};

/**
 * STANDALONE UPLOAD BUTTON
 */
export const setStandaloneUploadCommand = async (
  standaloneId: string,
  scheduleKey: string
) => {
  try {
    const now = new Date().toISOString();
    
    const modeRef = ref(database, `standalones/${standaloneId}/mode`);
    await update(modeRef, {
      type: "upload_scheduled",
      schedule_key: scheduleKey,
      updated_at: now
    });
    
    console.log('Standalone upload command sent');
  } catch (error) {
    console.error('Failed to send standalone upload command:', error);
    throw error;
  }
};

// ==================== STANDALONE READ SUBSCRIPTIONS ====================

/**
 * Subscribe to standalone info
 */
export const subscribeToStandaloneInfo = (standaloneId: string, callback: (info: any) => void) => {
  const infoRef = ref(database, `standalones/${standaloneId}/standaloneinfo`);
  onValue(infoRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(infoRef);
};

/**
 * Subscribe to standalone mode
 */
export const subscribeToStandaloneMode = (standaloneId: string, callback: (mode: any) => void) => {
  const modeRef = ref(database, `standalones/${standaloneId}/mode`);
  onValue(modeRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(modeRef);
};

/**
 * Subscribe to standalone active status
 */
export const subscribeToStandaloneActiveStatus = (standaloneId: string, callback: (status: any) => void) => {
  const statusRef = ref(database, `standalones/${standaloneId}/active_status`);
  onValue(statusRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(statusRef);
};

/**
 * Subscribe to standalone connection status
 */
export const subscribeToStandaloneConnectionStatus = (standaloneId: string, callback: (status: boolean) => void) => {
  const statusRef = ref(database, `standalones/${standaloneId}/connection_status`);
  onValue(statusRef, (snapshot) => {
    callback(!!snapshot.val());
  });
  return () => off(statusRef);
};

/**
 * Subscribe to standalone scheduled records
 */
export const subscribeToStandaloneScheduledRecords = (standaloneId: string, callback: (records: any) => void) => {
  const recordsRef = ref(database, `standalones/${standaloneId}/scheduled_records`);
  onValue(recordsRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(recordsRef);
};

/**
 * Subscribe to standalone predictions
 */
export const subscribeToStandalonePredictions = (standaloneId: string, callback: (predictions: any) => void) => {
  const predictionsRef = ref(database, `standalones/${standaloneId}/predictions`);
  const unsubscribe = onValue(predictionsRef, (snapshot) => {
    const predictions: any = {};
    if (snapshot.exists()) {
      const data = snapshot.val();
      
      Object.entries(data).forEach(([folderOrBatId, folderData]: [string, any]) => {
        if (typeof folderData === 'object' && folderData !== null) {
          const firstKey = Object.keys(folderData)[0];
          const firstValue = folderData[firstKey];
          
          if (firstValue && typeof firstValue === 'object' && 's' in firstValue && 'c' in firstValue) {
            const allSpecies = Object.keys(folderData)
              .filter(key => !isNaN(parseInt(key)))
              .sort((a, b) => parseInt(a) - parseInt(b))
              .map(key => ({
                species: folderData[key].s,
                confidence: folderData[key].c
              }));
            
            const fileName = `${folderOrBatId}.wav`;
            predictions[fileName] = {
              species: allSpecies[0]?.species || 'Unknown',
              confidence: allSpecies[0]?.confidence || 0,
              allSpecies: allSpecies
            };
            predictions[folderOrBatId] = predictions[fileName];
          } else {
            Object.entries(folderData).forEach(([batNumber, batData]: [string, any]) => {
              if (typeof batData === 'object' && batData !== null) {
                const allSpecies = Object.keys(batData)
                  .filter(key => !isNaN(parseInt(key)))
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(key => ({
                    species: batData[key]?.s,
                    confidence: batData[key]?.c
                  }))
                  .filter(sp => sp.species && typeof sp.confidence === 'number');
                
                if (allSpecies.length > 0) {
                  const fileName = `bat_${batNumber}.wav`;
                  predictions[fileName] = {
                    species: allSpecies[0]?.species || 'Unknown',
                    confidence: allSpecies[0]?.confidence || 0,
                    allSpecies: allSpecies
                  };
                  predictions[`bat_${batNumber}`] = predictions[fileName];
                  predictions[batNumber] = predictions[fileName];
                }
              }
            });
          }
        }
      });
    }
    console.log('🔔 Firebase standalone predictions update:', Object.keys(predictions).length, 'predictions');
    callback(predictions);
  });
  
  return () => off(predictionsRef);
};

/**
 * Save prediction for standalone
 */
export const saveStandalonePrediction = async (
  standaloneId: string,
  batId: string,
  species: string,
  confidence: number,
  date?: string,
  frequency?: string,
  allSpecies?: any[],
  folderTimestamp?: string
) => {
  if (!standaloneId || !batId) {
    console.error('❌ [saveStandalonePrediction] Missing required parameters:', { standaloneId, batId });
    return;
  }

  if (folderTimestamp && allSpecies && allSpecies.length > 0) {
    let batNumber = batId.replace('.wav', '').replace('bat_', '');
    
    if (!batNumber) {
      console.error('❌ [saveStandalonePrediction] Could not extract bat number from:', batId);
      return;
    }
    
    const path = `standalones/${standaloneId}/predictions/${folderTimestamp}/${batNumber}`;
    console.log(`💾 [saveStandalonePrediction] Saving to: ${path}`);
    console.log(`   Species count: ${allSpecies.length}`);
    
    const predRef = ref(database, path);

    const cleanData: any = {};
    allSpecies.forEach((sp, index) => {
      if (sp && sp.species && typeof sp.confidence === 'number') {
        cleanData[index] = {
          s: sp.species,
          c: sp.confidence
        };
      }
    });
    
    if (Object.keys(cleanData).length > 0) {
      await set(predRef, cleanData);
      console.log(`✅ [saveStandalonePrediction] Saved ${Object.keys(cleanData).length} species for bat ${batNumber}`);
    } else {
      console.warn('⚠️ [saveStandalonePrediction] No valid species data to save');
    }
  } else if (species && typeof confidence === 'number') {
    console.log(`💾 [saveStandalonePrediction] Fallback save for ${batId}`);
    const predictionRef = ref(database, `standalones/${standaloneId}/predictions/${batId}`);
    const data: any = { s: species, c: confidence };
    if (date) data.d = date;
    if (frequency) data.f = frequency;
    await set(predictionRef, data);
  } else {
    console.warn('⚠️ [saveStandalonePrediction] No data to save - missing folderTimestamp or allSpecies');
  }
};

/**
 * Get folder predictions for standalone
 */
export const getStandaloneFolderPredictions = async (standaloneId: string, folderTimestamp: string) => {
  const path = `standalones/${standaloneId}/predictions/${folderTimestamp}`;
  console.log(`🔍 [getStandaloneFolderPredictions] Reading from: ${path}`);
  
  let folderRef = ref(database, path);
  let snapshot = await get(folderRef);
  
  console.log(`🔍 [getStandaloneFolderPredictions] Snapshot exists: ${snapshot.exists()}`);
  
  if (snapshot.exists()) {
    const data = snapshot.val();
    console.log(`🔍 [getStandaloneFolderPredictions] Raw data keys:`, Object.keys(data));
    const predictions: any = {};
    
    Object.keys(data).forEach(batNumber => {
      const batData = data[batNumber];
      if (typeof batData !== 'object' || batData === null) return;
      
      const allSpecies = Object.keys(batData)
        .filter(key => !isNaN(parseInt(key)))
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(key => ({
          species: batData[key]?.s,
          confidence: batData[key]?.c
        }))
        .filter(sp => sp.species && typeof sp.confidence === 'number');
      
      if (allSpecies.length > 0) {
        const fileName = `bat_${batNumber}.wav`;
        predictions[fileName] = {
          species: allSpecies[0]?.species || 'Unknown',
          confidence: allSpecies[0]?.confidence || 0,
          allSpecies: allSpecies
        };
      }
    });
    
    console.log(`📦 Loaded ${Object.keys(predictions).length} predictions for ${folderTimestamp}`);
    return predictions;
  }
  
  console.log(`📭 No predictions found for ${folderTimestamp}`);
  return {};
};

// ==================== CLIENT FUNCTIONS ====================

/**
 * Create a new client under a server
 */
export const createClient = async (serverId: string, clientId: string) => {
  try {
    const clientRef = ref(database, `servers/${serverId}/clients/${clientId}`);
    await set(clientRef, {
      client_info: {
        lat: 0,
        long: 0,
        location_name: "Not set",
        location_updated: false
      },
      scheduled_records: {
        _placeholder: "No scheduled records yet"
      }
    });
    console.log('Client created:', serverId, clientId);
  } catch (error) {
    console.error('Failed to create client:', error);
    throw error;
  }
};

/**
 * Delete a client
 */
export const deleteClient = async (serverId: string, clientId: string) => {
  try {
    const clientRef = ref(database, `servers/${serverId}/clients/${clientId}`);
    await remove(clientRef);
    console.log('Client deleted:', serverId, clientId);
  } catch (error) {
    console.error('Failed to delete client:', error);
    throw error;
  }
};

/**
 * Reset a client - resets all keys under the client to their initial state while preserving scheduled records AND location
 */
export const resetClient = async (serverId: string, clientId: string) => {
  try {
    // Get existing scheduled records
    const recordsRef = ref(database, `servers/${serverId}/clients/${clientId}/scheduled_records`);
    const recordsSnapshot = await new Promise<any>((resolve) => {
      onValue(recordsRef, (snapshot) => {
        resolve(snapshot.val() || { _placeholder: "No scheduled records yet" });
      }, { onlyOnce: true });
    });

    // Get existing client location
    const clientInfoRef = ref(database, `servers/${serverId}/clients/${clientId}/client_info`);
    const clientInfoSnapshot = await new Promise<any>((resolve) => {
      onValue(clientInfoRef, (snapshot) => {
        resolve(snapshot.val() || { lat: 0, long: 0, location_name: "Not set" });
      }, { onlyOnce: true });
    });

    // Get existing predictions
    const predictionsRef = ref(database, `servers/${serverId}/clients/${clientId}/predictions`);
    const predictionsSnapshot = await new Promise<any>((resolve) => {
      onValue(predictionsRef, (snapshot) => {
        resolve(snapshot.val() || {});
      }, { onlyOnce: true });
    });

    // Reset the client while keeping location (client_info), scheduled_records AND predictions
    const clientRef = ref(database, `servers/${serverId}/clients/${clientId}`);
    const info = { ...(clientInfoSnapshot || {}) } as any;
    if (typeof info.location_updated === 'undefined') {
      info.location_updated = false;
    }
    await set(clientRef, {
      client_info: info,
      scheduled_records: recordsSnapshot,
      predictions: predictionsSnapshot
    });
    
    // Also reset server mode to idle immediately and clear connection_status
    const modeRef = ref(database, `servers/${serverId}/mode`);
    await update(modeRef, {
      type: "idle",
      target_client_id: "",
      duration_sec: 0,
      schedule_key: "",
      updated_at: new Date().toISOString()
    });
    const serverRef = ref(database, `servers/${serverId}`);
    await update(serverRef, {
      connection_status: false,
      active_status: {
        status: "idle",
        progress: 0,
        total_files: 0,
        received_files: 0,
        total_size_bytes: 0,
        transferred_bytes: 0
      }
    });
    
    console.log('Client reset (scheduled records and location preserved, server mode reset to idle):', serverId, clientId);
  } catch (error) {
    console.error('Failed to reset client:', error);
    throw error;
  }
};

// ==================== BUTTON COMMANDS (UI WRITES) ====================

/**
 * SERVER LOCATION BUTTON - Get server GPS location
 */
export const setServerLocationCommand = async (serverId: string) => {
  try {
    const modeRef = ref(database, `servers/${serverId}/mode`);
    await update(modeRef, {
      type: "server_location",
      updated_at: new Date().toISOString()
    });
    // Do NOT set location_updated: true in server_info for feedback
    console.log('Server location command sent');
  } catch (error) {
    console.error('Failed to send server location command:', error);
    throw error;
  }
};

/**
 * CLIENT LOCATION BUTTON - Get client GPS location
 */
export const setClientLocationCommand = async (serverId: string, clientId: string) => {
  try {
    const modeRef = ref(database, `servers/${serverId}/mode`);
    await update(modeRef, {
      type: "client_location",
      target_client_id: clientId,
      updated_at: new Date().toISOString()
    });
    console.log('Client location command sent');
  } catch (error) {
    console.error('Failed to send client location command:', error);
    throw error;
  }
};

/**
 * CONNECT BUTTON - Test client connection
 */
export const setConnectCommand = async (serverId: string, clientId: string) => {
  try {
    const modeRef = ref(database, `servers/${serverId}/mode`);
    await update(modeRef, {
      type: "connect",
      target_client_id: clientId,
      updated_at: new Date().toISOString()
    });
    console.log('Connect command sent');
  } catch (error) {
    console.error('Failed to send connect command:', error);
    throw error;
  }
};

/**
 * INSTANT BUTTON - Start instant recording
 */
export const setInstantCommand = async (serverId: string, clientId: string, durationSec: number) => {
  try {
    const modeRef = ref(database, `servers/${serverId}/mode`);
    await update(modeRef, {
      type: "instant",
      target_client_id: clientId,
      duration_sec: durationSec,
      updated_at: new Date().toISOString()
    });
    console.log('Instant command sent');
  } catch (error) {
    console.error('Failed to send instant command:', error);
    throw error;
  }
};

/**
 * SCHEDULE BUTTON - Schedule a recording
 */
export const setScheduleCommand = async (
  serverId: string, 
  clientId: string, 
  durationSec: number,
  scheduleKey: string // Format: "2026-01-06T15:30:00"
) => {
  try {
    const now = new Date().toISOString();
    
    // Write mode command
    const modeRef = ref(database, `servers/${serverId}/mode`);
    await update(modeRef, {
      type: "schedule",
      target_client_id: clientId,
      duration_sec: durationSec,
      schedule_key: scheduleKey,
      updated_at: now
    });
    
    // Also create the scheduled_records entry for immediate visibility in Firebase
    // (Backend will update status to "scheduled" when it processes the command)
    const scheduleRecordRef = ref(database, `servers/${serverId}/clients/${clientId}/scheduled_records/${scheduleKey}`);
    await update(scheduleRecordRef, {
      duration_sec: durationSec,
      status: "pending",
      created_at: now
    });
    
    console.log('Schedule command sent and record created');
  } catch (error) {
    console.error('Failed to send schedule command:', error);
    throw error;
  }
};

/**
 * START TRANSMIT BUTTON - Transmit scheduled recording
 */
export const setTransmitScheduledCommand = async (
  serverId: string,
  clientId: string,
  scheduleKey: string
) => {
  try {
    const modeRef = ref(database, `servers/${serverId}/mode`);
    await update(modeRef, {
      type: "transmit_scheduled",
      target_client_id: clientId,
      schedule_key: scheduleKey,
      updated_at: new Date().toISOString()
    });
    console.log('Transmit scheduled command sent');
  } catch (error) {
    console.error('Failed to send transmit scheduled command:', error);
    throw error;
  }
};

// ==================== UI READ SUBSCRIPTIONS ====================

/**
 * Subscribe to server info (location)
 */
export const subscribeToServerInfo = (serverId: string, callback: (info: any) => void) => {
  const infoRef = ref(database, `servers/${serverId}/server_info`);
  onValue(infoRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(infoRef);
};

/**
 * Subscribe to server mode
 */
export const subscribeToMode = (serverId: string, callback: (mode: any) => void) => {
  const modeRef = ref(database, `servers/${serverId}/mode`);
  onValue(modeRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(modeRef);
};

/**
 * Subscribe to active status (progress)
 */
export const subscribeToActiveStatus = (serverId: string, callback: (status: any) => void) => {
  const statusRef = ref(database, `servers/${serverId}/active_status`);
  onValue(statusRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(statusRef);
};

/**
 * Subscribe to connection status
 */
export const subscribeToConnectionStatus = (serverId: string, callback: (status: boolean) => void) => {
  const statusRef = ref(database, `servers/${serverId}/connection_status`);
  onValue(statusRef, (snapshot) => {
    callback(!!snapshot.val());
  });
  return () => off(statusRef);
};

/**
 * Subscribe to client info
 */
export const subscribeToClientInfo = (serverId: string, clientId: string, callback: (info: any) => void) => {
  const infoRef = ref(database, `servers/${serverId}/clients/${clientId}/client_info`);
  onValue(infoRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(infoRef);
};

/**
 * Subscribe to all clients for a server
 */
export const subscribeToClients = (serverId: string, callback: (clients: any) => void) => {
  const clientsRef = ref(database, `servers/${serverId}/clients`);
  onValue(clientsRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(clientsRef);
};

/**
 * Subscribe to scheduled records for a client
 */
export const subscribeToScheduledRecords = (
  serverId: string,
  clientId: string,
  callback: (records: any) => void
) => {
  const recordsRef = ref(database, `servers/${serverId}/clients/${clientId}/scheduled_records`);
  onValue(recordsRef, (snapshot) => {
    callback(snapshot.val() || {});
  });
  return () => off(recordsRef);
};

/**
 * One-time migration: backfill client_info.location_updated = false
 * For all clients (or a specific server) missing the flag.
 */
export const backfillLocationUpdatedFlag = async (serverId?: string) => {
  try {
    if (serverId) {
      const clientsRef = ref(database, `servers/${serverId}/clients`);
      const clientsSnapshot = await new Promise<any>((resolve) => {
        onValue(clientsRef, (snapshot) => resolve(snapshot.val() || {}), { onlyOnce: true });
      });
      const clientIds = Object.keys(clientsSnapshot || {});
      for (const cid of clientIds) {
        const info = (clientsSnapshot[cid]?.client_info) || {};
        if (typeof info.location_updated === 'undefined') {
          const infoRef = ref(database, `servers/${serverId}/clients/${cid}/client_info`);
          await update(infoRef, { location_updated: false });
        }
      }
      console.log(`Backfill complete for server ${serverId}`);
      return;
    }

    const serversRef = ref(database, 'servers');
    const serversSnapshot = await new Promise<any>((resolve) => {
      onValue(serversRef, (snapshot) => resolve(snapshot.val() || {}), { onlyOnce: true });
    });
    const serverIds = Object.keys(serversSnapshot || {});
    for (const sid of serverIds) {
      const clients = (serversSnapshot[sid]?.clients) || {};
      for (const cid of Object.keys(clients || {})) {
        const info = (clients[cid]?.client_info) || {};
        if (typeof info.location_updated === 'undefined') {
          const infoRef = ref(database, `servers/${sid}/clients/${cid}/client_info`);
          await update(infoRef, { location_updated: false });
        }
      }
    }
    console.log('Backfill complete for all servers');
  } catch (error) {
    console.error('Backfill failed:', error);
    throw error;
  }
};

export { database };

// Prediction Management
// Structure: servers/serverX/clients/clientX/predictions/{timestamp}/{batNumber}/0,1,2...
// Example: servers/server1/clients/client1/predictions/23122025_1656/1014/0/{s,c}
export const savePrediction = async (
  serverId: string, 
  clientId: string, 
  batId: string, 
  species: string, 
  confidence: number, 
  date?: string, 
  frequency?: string,
  allSpecies?: any[],  // Array of all detected species
  folderTimestamp?: string  // Just the timestamp like "23122025_1656"
) => {
  // Validate inputs
  if (!serverId || !clientId || !batId) {
    console.error('❌ [savePrediction] Missing required parameters:', { serverId, clientId, batId });
    return;
  }

  if (folderTimestamp && allSpecies && allSpecies.length > 0) {
    // Extract bat number from filename like "bat_1014.wav" -> "1014"
    let batNumber = batId.replace('.wav', '').replace('bat_', '');
    
    if (!batNumber) {
      console.error('❌ [savePrediction] Could not extract bat number from:', batId);
      return;
    }
    
    // Structure: predictions/{timestamp}/{batNumber}/0,1,2...
    const path = `servers/${serverId}/clients/${clientId}/predictions/${folderTimestamp}/${batNumber}`;
    console.log(`💾 [savePrediction] Saving to: ${path}`);
    console.log(`   Species count: ${allSpecies.length}`);
    
    const predRef = ref(database, path);

    // Save each species as array index: 0, 1, 2... (no explicit delete/reset)
    const cleanData: any = {};
    allSpecies.forEach((sp, index) => {
      if (sp && sp.species && typeof sp.confidence === 'number') {
        cleanData[index] = {
          s: sp.species,
          c: sp.confidence
        };
      }
    });
    
    if (Object.keys(cleanData).length > 0) {
      await set(predRef, cleanData);
      console.log(`✅ [savePrediction] Saved ${Object.keys(cleanData).length} species for bat ${batNumber}`);
    } else {
      console.warn('⚠️ [savePrediction] No valid species data to save');
    }
  } else if (species && typeof confidence === 'number') {
    // Fallback for backward compatibility
    console.log(`💾 [savePrediction] Fallback save for ${batId}`);
    const predictionRef = ref(database, `servers/${serverId}/clients/${clientId}/predictions/${batId}`);
    const data: any = { s: species, c: confidence };
    if (date) data.d = date;
    if (frequency) data.f = frequency;
    await set(predictionRef, data);
  } else {
    console.warn('⚠️ [savePrediction] No data to save - missing folderTimestamp or allSpecies');
  }
};

export const getPrediction = async (serverId: string, clientId: string, batId: string, folderName?: string) => {
  let predictionRef;
  if (folderName) {
    const batCallName = batId.includes('_') ? `bat_${batId.split('_').pop()}` : batId;
    predictionRef = ref(database, `servers/${serverId}/clients/${clientId}/predictions/${folderName}/${batCallName}`);
  } else {
    predictionRef = ref(database, `servers/${serverId}/clients/${clientId}/predictions/${batId}`);
  }
  
  const snapshot = await get(predictionRef);
  if (snapshot.exists()) {
    const data = snapshot.val();
    
    // New array structure: {0: {s, c}, 1: {s, c}, ...}
    if (typeof data === 'object' && !data.s && !data.species) {
      const allSpecies = Object.keys(data)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(key => ({
          species: data[key].s,
          confidence: data[key].c
        }));
      
      return {
        species: allSpecies[0]?.species || 'Unknown',
        confidence: allSpecies[0]?.confidence || 0,
        allSpecies: allSpecies
      };
    }
    
    // Old structure fallback
    return { 
      species: data.species || data.s, 
      confidence: data.confidence || data.c,
      allSpecies: data.all_species || data.all || []
    };
  }
  return null;
};

// Get predictions for a folder timestamp
// Structure: predictions/{timestamp}/{batNumber}/0,1,2...
export const getFolderPredictions = async (serverId: string, clientId: string, folderTimestamp: string) => {
  const path = `servers/${serverId}/clients/${clientId}/predictions/${folderTimestamp}`;
  console.log(`🔍 [getFolderPredictions] Reading from: ${path}`);
  
  // Try with just timestamp first (new structure)
  let folderRef = ref(database, path);
  let snapshot = await get(folderRef);
  
  console.log(`🔍 [getFolderPredictions] Snapshot exists: ${snapshot.exists()}`);
  
  if (snapshot.exists()) {
    const data = snapshot.val();
    console.log(`🔍 [getFolderPredictions] Raw data keys:`, Object.keys(data));
    const predictions: any = {};
    
    Object.keys(data).forEach(batNumber => {
      const batData = data[batNumber];
      if (typeof batData !== 'object' || batData === null) return;
      
      // Handle the nested structure: {0: {s, c}, 1: {s, c}, ...}
      const allSpecies = Object.keys(batData)
        .filter(key => !isNaN(parseInt(key)))
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map(key => ({
          species: batData[key]?.s,
          confidence: batData[key]?.c
        }))
        .filter(sp => sp.species && typeof sp.confidence === 'number');
      
      if (allSpecies.length > 0) {
        // Store by file_name format (bat_1014.wav)
        const fileName = `bat_${batNumber}.wav`;
        predictions[fileName] = {
          species: allSpecies[0]?.species || 'Unknown',
          confidence: allSpecies[0]?.confidence || 0,
          allSpecies: allSpecies
        };
      }
    });
    
    console.log(`📦 Loaded ${Object.keys(predictions).length} predictions for ${folderTimestamp}`);
    return predictions;
  }
  
  console.log(`📭 No predictions found for ${folderTimestamp}`);
  return {};
};

export const subscribeToPredictions = (serverId: string, clientId: string, callback: (predictions: any) => void) => {
  const predictionsRef = ref(database, `servers/${serverId}/clients/${clientId}/predictions`);
  const unsubscribe = onValue(predictionsRef, (snapshot) => {
    const predictions: any = {};
    if (snapshot.exists()) {
      const data = snapshot.val();
      
      // Handle new nested folder structure: predictions/{folderName}/{batCallName}/{0,1,2...}
      Object.entries(data).forEach(([folderOrBatId, folderData]: [string, any]) => {
        if (typeof folderData === 'object' && folderData !== null) {
          // Check if this is a folder with bat calls inside
          const firstKey = Object.keys(folderData)[0];
          const firstValue = folderData[firstKey];
          
          // If firstValue has 's' and 'c', it's the old direct structure
          if (firstValue && typeof firstValue === 'object' && 's' in firstValue && 'c' in firstValue) {
            // Old structure: predictions/{batId}/{0: {s,c}, 1: {s,c}}
            const allSpecies = Object.keys(folderData)
              .filter(key => !isNaN(parseInt(key)))
              .sort((a, b) => parseInt(a) - parseInt(b))
              .map(key => ({
                species: folderData[key].s,
                confidence: folderData[key].c
              }));
            
            const fileName = `${folderOrBatId}.wav`;
            predictions[fileName] = {
              species: allSpecies[0]?.species || 'Unknown',
              confidence: allSpecies[0]?.confidence || 0,
              allSpecies: allSpecies
            };
            predictions[folderOrBatId] = predictions[fileName];
          } else {
            // New folder structure: predictions/{timestamp}/{batNumber}/{0,1,2...}
            // batNumber is just the number (e.g., "1023"), not the full name
            Object.entries(folderData).forEach(([batNumber, batData]: [string, any]) => {
              if (typeof batData === 'object' && batData !== null) {
                const allSpecies = Object.keys(batData)
                  .filter(key => !isNaN(parseInt(key)))
                  .sort((a, b) => parseInt(a) - parseInt(b))
                  .map(key => ({
                    species: batData[key]?.s,
                    confidence: batData[key]?.c
                  }))
                  .filter(sp => sp.species && typeof sp.confidence === 'number');
                
                if (allSpecies.length > 0) {
                  // Map bat number to file name: "1023" -> "bat_1023.wav"
                  const fileName = `bat_${batNumber}.wav`;
                  predictions[fileName] = {
                    species: allSpecies[0]?.species || 'Unknown',
                    confidence: allSpecies[0]?.confidence || 0,
                    allSpecies: allSpecies
                  };
                  // Also store with various formats for lookup flexibility
                  predictions[`bat_${batNumber}`] = predictions[fileName];
                  predictions[batNumber] = predictions[fileName];
                }
              }
            });
          }
        }
      });
    }
    console.log('🔔 Firebase predictions update:', Object.keys(predictions).length, 'predictions');
    callback(predictions);
  });
  
  // Return unsubscribe function
  return () => off(predictionsRef);
};

// Migrate predictions to new flat structure
export const migratePredictionsStructure = async (serverId: string, clientId: string) => {
  const predictionsRef = ref(database, `servers/${serverId}/clients/${clientId}/predictions`);
  const snapshot = await get(predictionsRef);
  
  if (!snapshot.exists()) return;
  
  const data = snapshot.val();
  const migratedData: any = {};
  let needsMigration = false;
  
  // Check and convert old structure to new
  Object.entries(data).forEach(([batId, pred]: [string, any]) => {
    // If pred is an object with 's' and 'c', it's already in new format
    if (pred && typeof pred === 'object' && 's' in pred && 'c' in pred) {
      migratedData[batId] = { s: pred.s, c: pred.c };
    } else {
      // Old format or corrupt data - mark for migration
      needsMigration = true;
      console.log(`⚠️ Removing invalid prediction format for ${batId}:`, pred);
    }
  });
  
  if (needsMigration || Object.keys(migratedData).length !== Object.keys(data).length) {
    console.log('🔄 Migrating predictions to new structure...');
    await set(predictionsRef, migratedData);
    console.log('✅ Migration complete!');
  }
};

// Clean up invalid prediction paths (like "undefined", timestamps without folder prefix, etc.)
export const cleanupInvalidPredictions = async (serverId: string, clientId: string) => {
  const predictionsRef = ref(database, `servers/${serverId}/clients/${clientId}/predictions`);
  const snapshot = await get(predictionsRef);
  
  if (!snapshot.exists()) {
    console.log('No predictions to clean up');
    return;
  }
  
  const data = snapshot.val();
  const keysToRemove: string[] = [];
  
  Object.keys(data).forEach(key => {
    // Remove invalid keys:
    // - "undefined"
    // - Keys that are just timestamps (like "23122025_1656_1034")
    // - Keys that don't follow the expected pattern
    
    if (key === 'undefined' || key === 'null') {
      keysToRemove.push(key);
    } else if (/^\d{8}_\d{4}_\d+$/.test(key)) {
      // Pattern like "23122025_1656_1034" - invalid
      keysToRemove.push(key);
    } else if (!key.startsWith('server') && !key.startsWith('bat_')) {
      // Check if it's a valid folder name (should start with server) or bat call
      // If it's just random timestamp, remove it
      if (/^\d+_\d+$/.test(key) || /^\d+$/.test(key)) {
        keysToRemove.push(key);
      }
    }
  });
  
  if (keysToRemove.length > 0) {
    console.log(`🧹 Cleaning up ${keysToRemove.length} invalid prediction keys:`, keysToRemove);
    
    for (const key of keysToRemove) {
      const keyRef = ref(database, `servers/${serverId}/clients/${clientId}/predictions/${key}`);
      await set(keyRef, null);
      console.log(`  ❌ Removed: ${key}`);
    }
    
    console.log('✅ Cleanup complete!');
  } else {
    console.log('✅ No invalid predictions found');
  }
};
