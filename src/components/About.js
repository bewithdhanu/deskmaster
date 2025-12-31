import React from 'react';
import { getIpcRenderer } from '../utils/electron';

const ipcRenderer = getIpcRenderer();

const About = () => {
  const [version, setVersion] = React.useState('2.0.0');
  const [iconPath, setIconPath] = React.useState('');

  React.useEffect(() => {
    // Get version from package.json
    ipcRenderer.invoke('get-app-version').then((appVersion) => {
      if (appVersion) {
        setVersion(appVersion);
      }
    }).catch(() => {
      // Fallback to default version
      setVersion('2.0.0');
    });

    // Get app icon path
    ipcRenderer.invoke('get-app-icon-path').then((path) => {
      if (path) {
        setIconPath(path);
      }
    }).catch(() => {
      // Fallback to emoji if icon not found
      setIconPath('');
    });
  }, []);

  return (
    <div className="about-container">
      <div className="about-header">
        <div className="app-logo">
          {iconPath ? (
            <img src={iconPath} alt="DeskMaster" />
          ) : (
            <span className="app-icon-emoji">🖥️</span>
          )}
        </div>
        <h1 className="app-name">DeskMaster</h1>
      </div>

      <div className="about-content">
        <div className="credits">
          <p>Developed by <strong>Dhanu K</strong></p>
          <p>Licensed under <strong>MIT License</strong></p>
        </div>
        
        <div className="version-info">
          <p>Version <strong>{version}</strong></p>
        </div>
      </div>
    </div>
  );
};

export default About;
