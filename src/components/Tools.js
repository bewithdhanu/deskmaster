import React, { useState, useEffect } from 'react';
import BcryptHashGenerator from './tools/BcryptHashGenerator';
import PublicIPTool from './tools/PublicIPTool';
import IPLocationTool from './tools/IPLocationTool';
import PinggyTunnelTool from './tools/PinggyTunnelTool';
import TextReformatTool from './tools/TextReformatTool';
import PasswordGenerator from './tools/PasswordGenerator';
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
    'password-generator': true
  });
  const [toolOrder, setToolOrder] = useState([]);
  const [draggedTool, setDraggedTool] = useState(null);
  const [dropTarget, setDropTarget] = useState(null); // Track where we're dropping
  const [dropPosition, setDropPosition] = useState(null); // 'before' or 'after'
  const [showAddToolModal, setShowAddToolModal] = useState(false);

  const availableTools = [
    { id: 'bcrypt-generate', name: 'Generate Hash', description: 'Generate bcrypt hash from text' },
    { id: 'bcrypt-verify', name: 'Verify Hash', description: 'Verify text against bcrypt hash' },
    { id: 'public-ip', name: 'Public IP', description: 'Show your public IP address' },
    { id: 'ip-location', name: 'IP Location', description: 'Get location details from IP address(es)' },
    { id: 'pinggy', name: 'Pinggy Tunnel', description: 'Create secure tunnels to local ports' },
    { id: 'text-reformat', name: 'Text Reformat', description: 'Reformat text using ChatGPT GPT-4o mini' },
    { id: 'password-generator', name: 'Password Generator', description: 'Generate strong passwords with customizable options' }
  ];

  // Load tool order from settings on mount
  useEffect(() => {
    const loadToolOrder = async () => {
      try {
        const settings = await ipcRenderer.invoke('get-settings');
        if (settings.toolOrder && Array.isArray(settings.toolOrder)) {
          // Migrate old 'bcrypt' to separate tools
          const migratedOrder = settings.toolOrder.map(id => {
            if (id === 'bcrypt') {
              return ['bcrypt-generate', 'bcrypt-verify'];
            }
            return id;
          }).flat();
          setToolOrder(migratedOrder);
        } else {
          // Initialize default order
          const defaultOrder = ['bcrypt-generate', 'bcrypt-verify', 'public-ip', 'ip-location', 'pinggy', 'text-reformat', 'password-generator'];
          setToolOrder(defaultOrder);
        }
      } catch (error) {
        console.error('Error loading tool order:', error);
        // Fallback to default order
        const defaultOrder = ['bcrypt-generate', 'bcrypt-verify', 'public-ip', 'ip-location', 'pinggy', 'text-reformat', 'password-generator'];
        setToolOrder(defaultOrder);
      }
    };
    loadToolOrder();
  }, []);

  // Save tool order to settings
  const saveToolOrder = async (newOrder) => {
    try {
      const settings = await ipcRenderer.invoke('get-settings');
      const updatedSettings = {
        ...settings,
        toolOrder: newOrder
      };
      await ipcRenderer.invoke('update-settings', updatedSettings);
    } catch (error) {
      console.error('Error saving tool order:', error);
    }
  };

  const handleCloseTool = (toolId) => {
    setActiveTools(prev => ({
      ...prev,
      [toolId]: false
    }));
    // Remove from order
    setToolOrder(prev => {
      const newOrder = prev.filter(id => id !== toolId);
      saveToolOrder(newOrder);
      return newOrder;
    });
  };

  const handleAddTool = (toolId) => {
    setActiveTools(prev => ({
      ...prev,
      [toolId]: true
    }));
    // Add to order at the end
    setToolOrder(prev => {
      const newOrder = [...prev, toolId];
      saveToolOrder(newOrder);
      return newOrder;
    });
    setShowAddToolModal(false);
  };

  const handleDragStart = (e, toolId) => {
    // Check if the drag started on an interactive element
    const target = e.target;
    const isInteractiveElement = 
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'A' ||
      target.closest('button') !== null ||
      target.closest('input') !== null ||
      target.closest('textarea') !== null ||
      target.closest('select') !== null ||
      target.closest('a') !== null ||
      target.closest('[role="button"]') !== null;
    
    // Prevent dragging if clicking on interactive elements
    if (isInteractiveElement) {
      e.preventDefault();
      return;
    }
    
    setDraggedTool(toolId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', toolId);
  };

  const handleDragEnd = (e) => {
    setDraggedTool(null);
    setDropTarget(null);
    setDropPosition(null);
  };

  const handleDragOver = (e, targetToolId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (!draggedTool || draggedTool === targetToolId) return;

    // Determine if we're dropping before or after based on mouse position
    const rect = e.currentTarget.getBoundingClientRect();
    const mouseY = e.clientY;
    const elementMiddle = rect.top + rect.height / 2;
    
    const position = mouseY < elementMiddle ? 'before' : 'after';
    setDropTarget(targetToolId);
    setDropPosition(position);
  };

  const handleDragLeave = (e) => {
    // Only clear if we're actually leaving the element (not just moving to a child)
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDropTarget(null);
      setDropPosition(null);
    }
  };

  const handleDrop = (e, targetToolId) => {
    e.preventDefault();
    
    if (!draggedTool || draggedTool === targetToolId) {
      setDropTarget(null);
      setDropPosition(null);
      return;
    }

    setToolOrder(prev => {
      const newOrder = [...prev];
      const draggedIndex = newOrder.indexOf(draggedTool);
      const targetIndex = newOrder.indexOf(targetToolId);

      if (draggedIndex === -1 || targetIndex === -1) return prev;

      // Remove dragged item
      newOrder.splice(draggedIndex, 1);
      
      // Calculate new target index based on drop position
      let newTargetIndex = newOrder.indexOf(targetToolId);
      if (dropPosition === 'after') {
        newTargetIndex += 1;
      }
      // Adjust for removed item if dragging from before the target
      if (draggedIndex < newTargetIndex) {
        newTargetIndex -= 1;
      }
      
      // Insert at calculated position
      newOrder.splice(newTargetIndex, 0, draggedTool);

      saveToolOrder(newOrder);
      return newOrder;
    });

    setDraggedTool(null);
    setDropTarget(null);
    setDropPosition(null);
  };

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

    return orderedTools.map((component, index) => {
      const toolId = component.key;
      const isDragging = draggedTool === toolId;
      const isDropTarget = dropTarget === toolId;
      const showDropIndicatorBefore = isDropTarget && dropPosition === 'before';
      const showDropIndicatorAfter = isDropTarget && dropPosition === 'after';
      
      return (
        <React.Fragment key={toolId}>
          {/* Drop indicator before */}
          {showDropIndicatorBefore && (
            <div className="w-full h-1 bg-red-500 rounded-full mb-2 break-inside-avoid" />
          )}
          
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, toolId)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => handleDragOver(e, toolId)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, toolId)}
            className={`relative break-inside-avoid mb-4 ${isDragging ? 'opacity-30 cursor-grabbing' : 'cursor-grab'} transition-all duration-200`}
          >
            {component}
          </div>
          
          {/* Drop indicator after */}
          {showDropIndicatorAfter && (
            <div className="w-full h-1 bg-red-500 rounded-full mb-2 break-inside-avoid" />
          )}
        </React.Fragment>
      );
    });
  };

  const getAvailableToolsToAdd = () => {
    return availableTools.filter(tool => !activeTools[tool.id]);
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto p-4 gap-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-theme-primary">Tools</h1>
        <p className="text-theme-muted text-sm mt-1">Utility tools for your productivity</p>
      </div>
      
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
          <div className="bg-theme-card border border-theme rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-theme-primary">Available Tools</h2>
              <button
                onClick={() => setShowAddToolModal(false)}
                className="p-1 text-theme-muted hover:text-theme-primary transition-colors duration-200"
              >
                <MdClose className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-2">
              {getAvailableToolsToAdd().length === 0 ? (
                <p className="text-theme-muted text-sm text-center py-4">All tools are already added</p>
              ) : (
                getAvailableToolsToAdd().map(tool => (
                  <button
                    key={tool.id}
                    onClick={() => handleAddTool(tool.id)}
                    className="w-full p-3 bg-theme-secondary border border-theme rounded-lg text-left hover:bg-theme-card-hover transition-colors duration-200"
                  >
                    <div className="font-medium text-theme-primary text-sm">{tool.name}</div>
                    <div className="text-theme-muted text-xs mt-1">{tool.description}</div>
                  </button>
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
