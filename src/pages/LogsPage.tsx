import React, { useState, useEffect } from 'react';

const LogsPage: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/logs');
      if (response.ok) {
        const data = await response.json();
        setLogs(data.reverse()); // Show most recent logs first
      }
    } catch (error) {
      console.error('Failed to fetch logs:', error);
      setLogs(['Error fetching logs.']);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  return (
    <div style={{ fontFamily: 'monospace', backgroundColor: '#1E1E1E', color: '#D4D4D4', padding: '20px', minHeight: '100vh' }}>
      <h1 style={{ color: '#569CD6' }}>Server Logs</h1>
      <button 
        onClick={fetchLogs} 
        disabled={isLoading}
        style={{ 
          padding: '10px 15px', 
          marginBottom: '20px', 
          backgroundColor: '#007ACC',
          color: 'white',
          border: 'none',
          cursor: 'pointer'
        }}
      >
        {isLoading ? 'Refreshing...' : 'Refresh Logs'}
      </button>
      <pre style={{ whiteSpace: 'pre-wrap', wordWrap: 'break-word' }}>
        {logs.length > 0 ? logs.join('\n') : 'No logs to display.'}
      </pre>
    </div>
  );
};

export default LogsPage;
