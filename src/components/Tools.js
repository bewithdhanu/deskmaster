import React, { useState, useEffect } from 'react';
import StatsManager from './StatsManager';
import BcryptHashGenerator from './tools/BcryptHashGenerator';
import PublicIPTool from './tools/PublicIPTool';
import IPLocationTool from './tools/IPLocationTool';
import PinggyTunnelTool from './tools/PinggyTunnelTool';
import TextReformatTool from './tools/TextReformatTool';
import PasswordGenerator from './tools/PasswordGenerator';
import OneTimeSecretTool from './tools/OneTimeSecretTool';
import { MdAdd, MdClose } from 'react-icons/md';
import { getIpcRenderer } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

const Tools = () => {
  const [activeTools, setActiveTools] = useState({
    'bcrypt-generate': true,
    'bcrypt-verify': true,
    'public-ip': true,
    'ip-location': true,
    'pinggy': true,
    'text-reformat': true,
    'password-generator': true,
    'onetimesecret': true
  });
  const [toolOrder, setToolOrder] = useState([]);
  const [showAddToolModal, setShowAddToolModal] = useState(false);
  const [insertAfterByTool, setInsertAfterByTool] = useState({});

  const availableTools = [
    { id: 'bcrypt-generate', name: 'Generate Hash', description: 'Generate bcrypt hash from text' },
    { id: 'bcrypt-verify', name: 'Verify Hash', description: 'Verify text against bcrypt hash' },
    { id: 'public-ip', name: 'Public IP', description: 'Show your public IP address' },
    { id: 'ip-location', name: 'IP Location', description: 'Get location details from IP address(es)' },
    { id: 'pinggy', name: 'Pinggy Tunnel', description: 'Create secure tunnels to local ports' },
    { id: 'text-reformat', name: 'Text Reformat', description: 'Reformat text using ChatGPT GPT-4o mini' },
    { id: 'password-generator', name: 'Password Generator', description: 'Generate strong passwords with customizable options' },
    { id: 'onetimesecret', name: 'OneTimeSecret', description: 'Create anonymous one-time shareable secrets' }
  ];

  const defaultToolOrder = ['bcrypt-generate', 'bcrypt-verify', 'public-ip', 'ip-location', 'pinggy', 'text-reformat', 'password-generator', 'onetimesecret'];

  // Load tool order and active tools from settings on mount (persisted until tool is uninstalled)
  useEffect(() => {
    const loadToolsState = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings');
        // Tool order: migrate old 'bcrypt' to separate tools
        if (settings.toolOrder && Array.isArray(settings.toolOrder) && settings.toolOrder.length > 0) {
          const migratedOrder = settings.toolOrder.map(id => {
            if (id === 'bcrypt') return ['bcrypt-generate', 'bcrypt-verify'];
            return id;
          }).flat();
          setToolOrder(migratedOrder);
        } else {
          setToolOrder(defaultToolOrder);
        }
        // Active tools: restore which tools are installed; new tools (not in saved) default to false
        if (settings.activeTools && typeof settings.activeTools === 'object') {
          const merged = {};
          availableTools.forEach(tool => {
            const saved = settings.activeTools[tool.id];
            merged[tool.id] = Object.prototype.hasOwnProperty.call(settings.activeTools, tool.id) ? saved !== false : false;
          });
          setActiveTools(merged);
        }
      } catch (error) {
        console.error('Error loading tools state:', error);
        setToolOrder(defaultToolOrder);
      }
    };
    loadToolsState();
  }, []);

  // Persist tool order and active tools (remembers arrangement and installed tools until uninstall)
  const persistToolsState = async (newOrder, newActiveTools) => {
    try {
      const settings = await ipcRenderer.invoke('get-settings');
      const updatedSettings = {
        ...settings,
        toolOrder: newOrder,
        activeTools: newActiveTools
      };
      await ipcRenderer.invoke('update-settings', updatedSettings);
    } catch (error) {
      console.error('Error saving tools state:', error);
    }
  };

  const handleCloseTool = (toolId) => {
    const newActiveTools = { ...activeTools, [toolId]: false };
    const newOrder = toolOrder.filter(id => id !== toolId);
    setActiveTools(newActiveTools);
    setToolOrder(newOrder);
    persistToolsState(newOrder, newActiveTools);
  };

  // Add tool at a chosen position (null = at end); preferred sequence is stored
  const handleAddTool = (toolId, insertAfterId = null) => {
    const newActiveTools = { ...activeTools, [toolId]: true };
    const newOrder = [...toolOrder];
    if (insertAfterId == null) {
      newOrder.push(toolId);
    } else {
      const idx = newOrder.indexOf(insertAfterId);
      if (idx === -1) newOrder.push(toolId);
      else newOrder.splice(idx + 1, 0, toolId);
    }
    setActiveTools(newActiveTools);
    setToolOrder(newOrder);
    persistToolsState(newOrder, newActiveTools);
    setShowAddToolModal(false);
  };

  const getToolDisplayName = (toolId) => availableTools.find(t => t.id === toolId)?.name || toolId;

  const getToolComponent = (toolId) => {
    switch (toolId) {
      case 'bcrypt-generate':
        if (activeTools['bcrypt-generate']) {
          return (
            <BcryptHashGenerator
              key="bcrypt-generate"
              toolId="bcrypt-generate"
              onClose={handleCloseTool}
              showGenerate={true}
              showVerify={false}
            />
          );
        }
        return null;
      case 'bcrypt-verify':
        if (activeTools['bcrypt-verify']) {
          return (
            <BcryptHashGenerator
              key="bcrypt-verify"
              toolId="bcrypt-verify"
              onClose={handleCloseTool}
              showGenerate={false}
              showVerify={true}
            />
          );
        }
        return null;
      case 'public-ip':
        if (activeTools['public-ip']) {
          return (
            <PublicIPTool
              key="public-ip"
              onClose={handleCloseTool}
            />
          );
        }
        return null;
      case 'ip-location':
        if (activeTools['ip-location']) {
          return (
            <IPLocationTool
              key="ip-location"
              onClose={handleCloseTool}
            />
          );
        }
        return null;
      case 'pinggy':
        if (activeTools['pinggy']) {
          return (
            <PinggyTunnelTool
              key="pinggy"
              onClose={handleCloseTool}
            />
          );
        }
        return null;
      case 'text-reformat':
        if (activeTools['text-reformat']) {
          return (
            <TextReformatTool
              key="text-reformat"
              onClose={handleCloseTool}
            />
          );
        }
        return null;
      case 'password-generator':
        if (activeTools['password-generator']) {
          return (
            <PasswordGenerator
              key="password-generator"
              onClose={handleCloseTool}
            />
          );
        }
        return null;
      case 'onetimesecret':
        if (activeTools['onetimesecret']) {
          return (
            <OneTimeSecretTool
              key="onetimesecret"
              onClose={handleCloseTool}
            />
          );
        }
        return null;
      default:
        return null;
    }
  };

  const getVisibleTools = () => {
    // Use toolOrder to determine rendering order
    const orderedTools = [];
    const processedIds = new Set();

    // First, add tools in the saved order
    toolOrder.forEach(toolId => {
      if (!processedIds.has(toolId)) {
        const component = getToolComponent(toolId);
        if (component) {
          orderedTools.push(component);
          processedIds.add(toolId);
        }
      }
    });

    // Add any tools that are active but not in the order (for backward compatibility)
    if (activeTools['bcrypt-generate'] && !processedIds.has('bcrypt-generate')) {
      const component = getToolComponent('bcrypt-generate');
      if (component) {
        orderedTools.push(component);
      }
    }
    if (activeTools['bcrypt-verify'] && !processedIds.has('bcrypt-verify')) {
      const component = getToolComponent('bcrypt-verify');
      if (component) {
        orderedTools.push(component);
      }
    }
    if (activeTools['public-ip'] && !processedIds.has('public-ip')) {
      orderedTools.push(getToolComponent('public-ip'));
    }
    if (activeTools['ip-location'] && !processedIds.has('ip-location')) {
      orderedTools.push(getToolComponent('ip-location'));
    }
    if (activeTools['pinggy'] && !processedIds.has('pinggy')) {
      orderedTools.push(getToolComponent('pinggy'));
    }
    if (activeTools['text-reformat'] && !processedIds.has('text-reformat')) {
      orderedTools.push(getToolComponent('text-reformat'));
    }
    if (activeTools['password-generator'] && !processedIds.has('password-generator')) {
      orderedTools.push(getToolComponent('password-generator'));
    }
    if (activeTools['onetimesecret'] && !processedIds.has('onetimesecret')) {
      orderedTools.push(getToolComponent('onetimesecret'));
    }

    return orderedTools.map((component) => {
      const toolId = component.key;
      return (
        <div key={toolId} className="break-inside-avoid mb-4">
          {component}
        </div>
      );
    });
  };

  const getAvailableToolsToAdd = () => {
    return availableTools.filter(tool => !activeTools[tool.id]);
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 gap-4">
      <StatsManager />
      {/* <div className="mb-4 mt-2">
        <h1 className="text-2xl font-bold text-theme-primary">Tools</h1>
        <p className="text-theme-muted text-sm mt-1">Utility tools for your productivity</p>
      </div> */}
      <div className="columns-1 md:columns-2 xl:columns-3 gap-4">
        {getVisibleTools()}
        
        {/* Add New Tool Button */}
        {getAvailableToolsToAdd().length > 0 && (
          <button
            onClick={() => setShowAddToolModal(true)}
            className="bg-theme-card border-2 border-dashed border-theme rounded-lg p-6 flex flex-col items-center justify-center gap-2 hover:bg-theme-card-hover transition-colors duration-200 min-h-[120px] break-inside-avoid mb-4"
          >
            <MdAdd className="w-8 h-8 text-theme-muted" />
            <span className="text-sm font-medium text-theme-primary">Add New Tool</span>
          </button>
        )}
      </div>

      {/* Add Tool Modal */}
      {showAddToolModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowAddToolModal(false)}>
          <div className="bg-theme-primary border border-theme rounded-lg p-6 max-w-md w-full mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-theme-primary">Available Tools</h2>
              <button
                onClick={() => setShowAddToolModal(false)}
                className="p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
              >
                <MdClose className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-theme-muted text-xs mb-3">Choose a tool and where to add it. Your order is saved.</p>
            <div className="space-y-3">
              {getAvailableToolsToAdd().length === 0 ? (
                <p className="text-theme-muted text-sm text-center py-4">All tools are already added</p>
              ) : (
                getAvailableToolsToAdd().map(tool => (
                  <div
                    key={tool.id}
                    className="p-3 bg-theme-secondary border border-theme rounded-lg flex flex-col sm:flex-row sm:items-center gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-theme-primary text-sm">{tool.name}</div>
                      <div className="text-theme-muted text-xs mt-0.5">{tool.description}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <select
                        className="px-2 py-1.5 bg-theme-primary border border-theme rounded text-theme-primary text-xs focus:outline-none focus:ring-2 focus:ring-red-500"
                        value={insertAfterByTool[tool.id] == null ? 'end' : insertAfterByTool[tool.id]}
                        onChange={(e) => {
                          const v = e.target.value;
                          setInsertAfterByTool(prev => ({ ...prev, [tool.id]: v === 'end' ? null : v }));
                        }}
                      >
                        <option value="end">At end</option>
                        {toolOrder.map(id => (
                          <option key={id} value={id}>After {getToolDisplayName(id)}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => handleAddTool(tool.id, insertAfterByTool[tool.id] ?? null)}
                        className="px-3 py-1.5 bg-red-500 text-white rounded text-sm font-medium hover:bg-red-600 transition-colors"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tools;
