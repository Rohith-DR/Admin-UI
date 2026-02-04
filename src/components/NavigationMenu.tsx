import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  AlertTriangle, 
  Download, 
  ChevronRight, 
  ChevronLeft,
  X,
  Plus,
  Bell,
  Mail,
  Eye,
  Trash2,
  Download as DownloadIcon,
  CheckCircle,
  AlertCircle,
  Info,
  Home
} from 'lucide-react';
import { useMenu } from '../context/MenuContext';

export const NavigationMenu: React.FC = () => {
  const { isExpanded, toggleMenu } = useMenu();
  const navigate = useNavigate();
  const [showAlertsPopup, setShowAlertsPopup] = useState(false);
  const [showDownloadsPopup, setShowDownloadsPopup] = useState(false);
  const [alertForm, setAlertForm] = useState({
    type: 'new_species',
    threshold: '',
    clientId: 'all',
    emailNotification: true,
    message: ''
  });

  // Download form state
  const [downloadForm, setDownloadForm] = useState({
    downloadType: 'preset', // 'preset' or 'custom'
    dataSource: 'all_servers',
    clientId: 'all',
    dateRange: '30_days',
    startDate: '',
    endDate: '',
    includeEnvironmental: true,
    includeAudio: false
  });

  // Mock data for active alerts
  const [activeAlerts, setActiveAlerts] = useState([
    { id: 1, type: 'New Species Detected', message: 'Rhinolophus detected at Forest Station Alpha', time: '2 hours ago', status: 'active' },
    { id: 2, type: 'Client Down', message: 'Wetland Monitor Beta offline', time: '5 hours ago', status: 'critical' },
    { id: 3, type: 'High Call Activity', message: '150+ calls in last hour at Cave Detection Gamma', time: '1 day ago', status: 'info' }
  ]);

  const handleCreateAlert = () => {
    const newAlert = {
      id: Date.now(),
      type: alertForm.type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      message: alertForm.message || `Alert for ${alertForm.type}`,
      time: 'Just now',
      status: 'active'
    };
    setActiveAlerts([newAlert, ...activeAlerts]);
    setAlertForm({ type: 'new_species', threshold: '', clientId: 'all', emailNotification: true, message: '' });
  };

  const handleDownload = () => {
    const downloadParams = {
      type: downloadForm.downloadType,
      source: downloadForm.dataSource,
      client: downloadForm.clientId,
      dateRange: downloadForm.dateRange,
      startDate: downloadForm.startDate,
      endDate: downloadForm.endDate,
      environmental: downloadForm.includeEnvironmental,
      audio: downloadForm.includeAudio
    };
    
    console.log('Download request:', downloadParams);
    // Call your database API here
    setShowDownloadsPopup(false);
  };

  const deleteAlert = (alertId: number) => {
    setActiveAlerts(activeAlerts.filter(alert => alert.id !== alertId));
  };

  const getAlertIcon = (status: string) => {
    switch(status) {
      case 'critical': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'info': return <Info className="w-4 h-4 text-blue-500" />;
      default: return <CheckCircle className="w-4 h-4 text-green-500" />;
    }
  };

  // Alerts Popup Component
  const AlertsPopup = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-orange-600" />
            <h2 className="text-xl font-bold text-gray-800">Alert Management</h2>
          </div>
          <button 
            onClick={() => setShowAlertsPopup(false)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row max-h-[calc(90vh-80px)]">
          <div className="lg:w-1/2 p-6 border-r border-gray-200">
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Plus className="w-5 h-5 text-green-600" />
              <span>Create New Alert</span>
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Alert Type</label>
                <select 
                  value={alertForm.type}
                  onChange={(e) => setAlertForm({...alertForm, type: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="new_species">New Species Detected</option>
                  <option value="call_threshold">Call Count Threshold</option>
                  <option value="client_down">Client/Server Down</option>
                  <option value="frequency_anomaly">Frequency Anomaly</option>
                  <option value="environmental_change">Environmental Change</option>
                  <option value="low_activity">Low Activity Alert</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Threshold/Parameters</label>
                <input
                  type="text"
                  value={alertForm.threshold}
                  onChange={(e) => setAlertForm({...alertForm, threshold: e.target.value})}
                  placeholder="e.g., >100 calls/hour, <20kHz frequency"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Client</label>
                <select 
                  value={alertForm.clientId}
                  onChange={(e) => setAlertForm({...alertForm, clientId: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                >
                  <option value="all">All Clients</option>
                  <option value="1">Client-1</option>
                  <option value="2">Client-2</option>
                  <option value="3">Client-3</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Custom Message</label>
                <textarea
                  value={alertForm.message}
                  onChange={(e) => setAlertForm({...alertForm, message: e.target.value})}
                  placeholder="Custom alert message (optional)"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="emailNotification"
                  checked={alertForm.emailNotification}
                  onChange={(e) => setAlertForm({...alertForm, emailNotification: e.target.checked})}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <label htmlFor="emailNotification" className="text-sm text-gray-700 flex items-center space-x-2">
                  <Mail className="w-4 h-4" />
                  <span>Send email notifications</span>
                </label>
              </div>

              <button
                onClick={handleCreateAlert}
                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors duration-300 flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Create Alert</span>
              </button>
            </div>
          </div>

          <div className="lg:w-1/2 p-6 overflow-y-auto">
            <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
              <Bell className="w-5 h-5 text-red-600" />
              <span>Active Alerts ({activeAlerts.length})</span>
            </h3>

            <div className="space-y-3">
              {activeAlerts.map(alert => (
                <div 
                  key={alert.id}
                  className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      {getAlertIcon(alert.status)}
                      <div>
                        <h4 className="font-semibold text-gray-800">{alert.type}</h4>
                        <p className="text-sm text-gray-600 mt-1">{alert.message}</p>
                        <p className="text-xs text-gray-500 mt-2">{alert.time}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button className="p-1 hover:bg-gray-100 rounded transition-colors">
                        <Eye className="w-4 h-4 text-gray-600" />
                      </button>
                      <button 
                        onClick={() => deleteAlert(alert.id)}
                        className="p-1 hover:bg-red-50 rounded transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {activeAlerts.length === 0 && (
                <div className="text-center py-8">
                  <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No active alerts</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Downloads Popup Component
  const DownloadsPopup = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <Download className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-bold text-gray-800">Download Data</h2>
          </div>
          <button 
            onClick={() => setShowDownloadsPopup(false)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Download Type Radio Buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Download Type</label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="downloadType"
                  value="preset"
                  checked={downloadForm.downloadType === 'preset'}
                  onChange={(e) => setDownloadForm({...downloadForm, downloadType: e.target.value})}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Quick Download (Preset Options)</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="downloadType"
                  value="custom"
                  checked={downloadForm.downloadType === 'custom'}
                  onChange={(e) => setDownloadForm({...downloadForm, downloadType: e.target.value})}
                  className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Custom Download (Advanced Options)</span>
              </label>
            </div>
          </div>

          {/* Data Source Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Data Source</label>
            <select 
              value={downloadForm.dataSource}
              onChange={(e) => setDownloadForm({...downloadForm, dataSource: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all_servers">All Servers</option>
              <option value="single_server">Single Server</option>
              <option value="single_client">Single Client</option>
            </select>
          </div>

          {/* Client Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Client</label>
            <select 
              value={downloadForm.clientId}
              onChange={(e) => setDownloadForm({...downloadForm, clientId: e.target.value})}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Clients</option>
              <option value="1">Client-1</option>
              <option value="2">Client-2</option>
              <option value="3">Client-3</option>
            </select>
          </div>

          {/* Show additional options only for custom download */}
          {downloadForm.downloadType === 'custom' && (
            <>
              {/* Date Range */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                <select 
                  value={downloadForm.dateRange}
                  onChange={(e) => setDownloadForm({...downloadForm, dateRange: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="7_days">Last 7 Days</option>
                  <option value="30_days">Last 30 Days</option>
                  <option value="90_days">Last 90 Days</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>

              {/* Custom Date Range */}
              {downloadForm.dateRange === 'custom' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Start Date</label>
                    <input
                      type="date"
                      value={downloadForm.startDate}
                      onChange={(e) => setDownloadForm({...downloadForm, startDate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">End Date</label>
                    <input
                      type="date"
                      value={downloadForm.endDate}
                      onChange={(e) => setDownloadForm({...downloadForm, endDate: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                    />
                  </div>
                </div>
              )}

              {/* Data Parameters */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">Include Parameters</label>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={downloadForm.includeEnvironmental}
                      onChange={(e) => setDownloadForm({...downloadForm, includeEnvironmental: e.target.checked})}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Environmental Data</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={downloadForm.includeAudio}
                      onChange={(e) => setDownloadForm({...downloadForm, includeAudio: e.target.checked})}
                      className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-700">Audio Files</span>
                  </label>
                </div>
              </div>
            </>
          )}

          {/* Download Button */}
          <button
            onClick={handleDownload}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg font-semibold transition-colors duration-300 flex items-center justify-center space-x-2"
          >
            <DownloadIcon className="w-4 h-4" />
            <span>Download Data</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Collapsed Menu */}
      {!isExpanded && (
        <aside className="fixed top-0 left-0 h-full w-16 bg-white shadow-2xl z-40 border-r border-gray-200 flex flex-col">
          <div className="flex items-center justify-center p-4 border-b border-gray-200 h-16">
            <button
              onClick={toggleMenu}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <nav className="p-2 space-y-2">
            <button 
              onClick={() => navigate('/')}
              className="flex justify-center p-2 hover:bg-gray-100 rounded transition-colors w-full"
              title="Home"
            >
              <Home className="w-5 h-5 text-gray-600" />
            </button>
            <button 
              onClick={() => setShowAlertsPopup(true)}
              className="flex justify-center p-2 hover:bg-gray-100 rounded transition-colors w-full"
            >
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </button>
            <button 
              onClick={() => setShowDownloadsPopup(true)}
              className="flex justify-center p-2 hover:bg-gray-100 rounded transition-colors w-full"
            >
              <Download className="w-5 h-5 text-blue-600" />
            </button>
          </nav>
        </aside>
      )}

      {/* Expanded Menu */}
      {isExpanded && (
        <aside className="fixed top-0 left-0 h-full w-64 bg-white shadow-2xl z-40 border-r border-gray-200 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 h-16">
            <h2 className="text-lg font-semibold">Menu</h2>
            <button
              onClick={toggleMenu}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-gray-600" />
            </button>
          </div>
          
          <nav className="p-4 space-y-2">
            <button 
              onClick={() => navigate('/')}
              className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-300 w-full text-left"
            >
              <Home className="w-5 h-5 text-gray-600" />
              <span>Home</span>
            </button>

            <button 
              onClick={() => setShowAlertsPopup(true)}
              className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-300 w-full text-left"
            >
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <span>Alerts</span>
              <div className="ml-auto bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                {activeAlerts.length}
              </div>
            </button>
            
            <button 
              onClick={() => setShowDownloadsPopup(true)}
              className="flex items-center space-x-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-300 w-full text-left"
            >
              <Download className="w-5 h-5 text-blue-600" />
              <span>Downloads</span>
            </button>
          </nav>
        </aside>
      )}

      {/* Popups */}
      {showAlertsPopup && <AlertsPopup />}
      {showDownloadsPopup && <DownloadsPopup />}
    </>
  );
};