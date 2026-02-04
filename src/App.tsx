import { useState, useEffect } from 'react';
import { Plus, Activity, Server, Users, TreePine } from 'lucide-react';
import { ServerSection } from './components/ServerSection';
import { AddServerModal } from './components/AddServerModal';
import { ConfirmationModal } from './components/ConfirmationModal';
import { useMenu } from './context/MenuContext';
import { createServer, deleteServer, loadAllServers } from './firebase';

interface ServerData {
  id: string;
  name: string;
}

function App() {
  const { isExpanded } = useMenu();
  const [servers, setServers] = useState<ServerData[]>([]);
  const [isAddServerModalOpen, setIsAddServerModalOpen] = useState(false);
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    itemName: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    itemName: '',
    onConfirm: () => {}
  });

  // Load servers from Firebase
  useEffect(() => {
    console.log('🔄 Setting up Firebase listener for servers...');
    const unsubscribe = loadAllServers((firebaseServers) => {
      console.log('📡 Firebase servers update received:', firebaseServers);
      const serverArray: ServerData[] = Object.keys(firebaseServers).map((serverKey, index) => ({
        id: serverKey,
        name: serverKey.replace(/^\w/, c => c.toUpperCase()).replace(/(\d+)/, ' $1')
      }));
      console.log('Setting servers from Firebase:', serverArray);
      setServers(serverArray);
    });

    return () => {
      console.log('🔴 Cleaning up Firebase listener for servers');
      unsubscribe();
    };
  }, []);

  const addServer = async (serverNumber: number, location?: { lat: number; long: number; name: string }) => {
    const serverId = `server${serverNumber}`;
    
    try {
      // Create server
      await createServer(serverId);
      
      // If location is provided, set it
      if (location) {
        const { getDatabase, ref, update } = await import('firebase/database');
        const db = getDatabase();
        const serverInfoRef = ref(db, `servers/${serverId}/server_info`);
        
        await update(serverInfoRef, {
          server_lat: location.lat,
          server_long: location.long,
          server_location_name: location.name
        });
      }
      
      console.log('Server created successfully in Firebase:', serverId);
    } catch (error) {
      console.error('Error creating server in Firebase:', error);
    }
  };

  const removeServer = (serverId: string) => {
    const serverToRemove = servers.find(server => server.id === serverId);
    if (!serverToRemove) return;
    
    setConfirmationModal({
      isOpen: true,
      itemName: serverToRemove.name,
      onConfirm: () => {
        deleteServer(serverId)
          .then(() => {
            console.log('Server deleted successfully');
          })
          .catch(error => console.error('Error deleting server:', error));
      }
    });
  };

  const totalServers = servers.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50/80 to-blue-50/30 relative">
      {/* Header */}
      <div className={`relative bg-gradient-to-r from-emerald-800 via-teal-700 to-emerald-800 shadow-lg overflow-hidden transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
        {/* Background Video */}
        <video 
          autoPlay 
          loop 
          muted 
          playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-85"
          style={{ objectPosition: 'center 60%' }}
        >
          <source src="/vid1.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-800/30 via-teal-700/30 to-emerald-800/30"></div>
        
        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="bg-white/20 p-4 rounded-xl">
              <TreePine className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">Wildlife Monitoring System</h1>
              <p className="text-emerald-100 text-base">Bat Conservation India Trust</p>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pb-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20 transition-all duration-300 hover:bg-white/15 hover:scale-105">
              <div className="flex items-center gap-4">
                <div className="bg-purple-500/20 p-3 rounded-lg">
                  <Server className="w-6 h-6 text-purple-200" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">{totalServers}</div>
                  <div className="text-emerald-100 text-sm">Total Servers</div>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20 transition-all duration-300 hover:bg-white/15 hover:scale-105">
              <div className="flex items-center gap-4">
                <div className="bg-blue-500/20 p-3 rounded-lg">
                  <Users className="w-6 h-6 text-blue-200" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">-</div>
                  <div className="text-emerald-100 text-sm">Total Clients</div>
                </div>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-xl p-5 border border-white/20 transition-all duration-300 hover:bg-white/15 hover:scale-105">
              <div className="flex items-center gap-4">
                <div className="bg-green-500/20 p-3 rounded-lg">
                  <Activity className="w-6 h-6 text-green-200" />
                </div>
                <div>
                  <div className="text-2xl font-bold text-white">Live</div>
                  <div className="text-emerald-100 text-sm">System Status</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className={`max-w-7xl mx-auto px-4 py-6 transition-all duration-300 ${isExpanded ? 'ml-64' : 'ml-16'}`}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Client - Server Network</h2>
            <p className="text-gray-600 text-sm">Manage your bat detection Recording Stations</p>
          </div>
          
          <button
            onClick={() => setIsAddServerModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-lg hover:shadow-xl text-sm"
          >
            <Plus className="w-5 h-5" />
            Add Server
          </button>
        </div>

        <div className="space-y-6">
          {servers
            .sort((a, b) => {
              const aNum = parseInt(a.name.replace('Server ', ''));
              const bNum = parseInt(b.name.replace('Server ', ''));
              return aNum - bNum;
            })
            .map((server) => (
              <ServerSection
                key={server.id}
                serverId={server.id}
                serverName={server.name}
                onRemove={() => removeServer(server.id)}
              />
            ))}
        </div>

        {servers.length === 0 && (
          <div className="text-center py-16">
            <div className="bg-gray-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Server className="w-10 h-10 text-gray-400" />
            </div>
            <h3 className="text-base font-medium text-gray-900 mb-2">No Servers Available</h3>
            <p className="text-gray-500 mb-6 text-sm">Add your first monitoring server to get started</p>
            <button
              onClick={() => setIsAddServerModalOpen(true)}
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm"
            >
              Add Server
            </button>
          </div>
        )}
      </div>

      <AddServerModal
        isOpen={isAddServerModalOpen}
        onClose={() => setIsAddServerModalOpen(false)}
        onAdd={addServer}
        existingServers={servers.map(s => s.name)}
      />

      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        onClose={() => setConfirmationModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmationModal.onConfirm}
        title="Delete Server?"
        message="Are you sure you want to delete this server?"
        itemName={confirmationModal.itemName}
        type="server"
      />
    </div>
  );
}

export default App;
