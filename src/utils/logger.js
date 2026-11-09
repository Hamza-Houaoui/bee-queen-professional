const LOG_KEY = 'bq_app_logs';
const MAX_LOGS = 300;

export const initLogger = () => {
  const originalError = console.error;
  const originalWarn = console.warn;
  const originalLog = console.log;

  const saveLog = (level, args) => {
    try {
      let logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      const msg = Array.from(args).map(a => {
        if (a instanceof Error) return `${a.message}\n${a.stack}`;
        if (typeof a === 'object') {
          try { return JSON.stringify(a); } catch { return '[Object]'; }
        }
        return String(a);
      }).join(' ');
      
      logs.push(`[${new Date().toISOString()}] [${level}] ${msg}`);
      if (logs.length > MAX_LOGS) logs = logs.slice(logs.length - MAX_LOGS);
      
      localStorage.setItem(LOG_KEY, JSON.stringify(logs));
    } catch (e) {
      // fail silently
    }
  };

  console.error = function (...args) {
    saveLog('ERROR', args);
    originalError.apply(console, args);
  };

  console.warn = function (...args) {
    saveLog('WARN', args);
    originalWarn.apply(console, args);
  };

  console.log = function (...args) {
    saveLog('INFO', args);
    originalLog.apply(console, args);
  };

  window.addEventListener('error', (event) => {
    saveLog('FATAL', [event.error || event.message]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    saveLog('PROMISE_REJECT', [event.reason]);
  });
};

export const getLogs = () => {
  try {
    const logs = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
    return logs.join('\n');
  } catch {
    return 'No logs found.';
  }
};

export const clearLogs = () => {
  localStorage.removeItem(LOG_KEY);
};
